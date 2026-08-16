package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	defaultRepoURL = "https://github.com/google/cel-go.git"
	// Post-v0.31.0 master. See packages/cel/UPSTREAM.md for the parity ledger.
	defaultRef     = "ef240479443ae9bbf89edd93430b1be2173350a7"
	defaultOutPath = "packages/cel/testdata/cel-go/cel-go-test-cases.json"
	defaultReport  = "packages/cel/testdata/cel-go/cel-go-test-cases.report.json"
)

// ExtractorConfig defines the CLI-configurable behavior for cel-go table extraction.
type ExtractorConfig struct {
	RepoURL    string
	Ref        string
	OutPath    string
	ReportPath string
	Workdir    string
}

// ExtractorReport summarizes extraction coverage and fallback behavior.
type ExtractorReport struct {
	TestFilesScanned      int               `json:"testFilesScanned"`
	CandidateTablesFound  int               `json:"candidateTablesFound"`
	ExportedTables        int               `json:"exportedTables"`
	RowsExported          int               `json:"rowsExported"`
	StructuredFields      int               `json:"structuredFields"`
	FallbackFields        int               `json:"fallbackFields"`
	SkippedTables         []SkippedTable    `json:"skippedTables"`
	UnresolvedTableUsages []UnresolvedUsage `json:"unresolvedTableUsages,omitempty"`
}

// SkippedTable records why a table declaration could not be exported.
type SkippedTable struct {
	File   string `json:"file"`
	Test   string `json:"test"`
	Table  string `json:"table"`
	Reason string `json:"reason"`
}

// UnresolvedUsage captures a table-like range loop whose source table was not resolved.
type UnresolvedUsage struct {
	File  string `json:"file"`
	Test  string `json:"test"`
	Table string `json:"table"`
}

type extractionResult struct {
	Cases  map[string][]map[string]any
	Report ExtractorReport
}

type fileParse struct {
	relPath  string
	fullPath string
	src      []byte
	file     *ast.File
	fset     *token.FileSet
}

type tableCandidate struct {
	Name       string
	FieldNames []string
	Rows       []ast.Expr
	RelPath    string
	TestName   string
	File       *ast.File
	Fset       *token.FileSet
	Source     []byte
}

type tableUse struct {
	CandidateKey string
	TableName    string
	TestName     string
	RelPath      string
}

type helperTable struct {
	Name      string
	Candidate tableCandidate
}

type rowEncodingResult struct {
	Row            map[string]any
	StructuredUsed int
	FallbackUsed   int
}

type exprEncodingResult struct {
	Value        any
	UsedFallback bool
}

func main() {
	cfg := ExtractorConfig{}
	flag.StringVar(&cfg.RepoURL, "repo", defaultRepoURL, "git repository URL or path for cel-go")
	flag.StringVar(&cfg.Ref, "ref", defaultRef, "git tag, branch, or commit to export")
	flag.StringVar(&cfg.OutPath, "out", defaultOutPath, "path for extracted JSON test cases")
	flag.StringVar(&cfg.ReportPath, "report", defaultReport, "path for extraction summary report")
	flag.StringVar(&cfg.Workdir, "workdir", "", "optional reusable clone directory")
	flag.Parse()

	if err := run(cfg); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(cfg ExtractorConfig) error {
	repoRoot, cleanup, err := prepareRepo(cfg.RepoURL, cfg.Ref, cfg.Workdir)
	if err != nil {
		return err
	}
	if cleanup != nil {
		defer cleanup()
	}

	result, err := extractRepo(repoRoot)
	if err != nil {
		return err
	}

	if err := writeJSONFile(cfg.OutPath, result.Cases); err != nil {
		return err
	}
	if err := writeJSONFile(cfg.ReportPath, result.Report); err != nil {
		return err
	}
	return nil
}

func prepareRepo(repoURL, ref, workdir string) (string, func(), error) {
	if workdir == "" {
		tempDir, err := os.MkdirTemp("", "cel-go-test-extractor-*")
		if err != nil {
			return "", nil, err
		}
		repoRoot := filepath.Join(tempDir, "cel-go")
		if err := cloneRepo(repoURL, repoRoot); err != nil {
			_ = os.RemoveAll(tempDir)
			return "", nil, err
		}
		if err := checkoutRepo(repoRoot, ref); err != nil {
			_ = os.RemoveAll(tempDir)
			return "", nil, err
		}
		return repoRoot, func() { _ = os.RemoveAll(tempDir) }, nil
	}

	if _, err := os.Stat(filepath.Join(workdir, ".git")); err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			return "", nil, err
		}
		if err := cloneRepo(repoURL, workdir); err != nil {
			return "", nil, err
		}
	} else {
		if err := runGit(workdir, "fetch", "--tags", "--force", "origin"); err != nil {
			return "", nil, err
		}
	}
	if err := checkoutRepo(workdir, ref); err != nil {
		return "", nil, err
	}
	return workdir, nil, nil
}

func cloneRepo(repoURL, destination string) error {
	parent := filepath.Dir(destination)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return err
	}
	return runCommand("", "git", "clone", repoURL, destination)
}

func checkoutRepo(repoRoot, ref string) error {
	if err := runGit(repoRoot, "checkout", "--force", ref); err != nil {
		return err
	}
	return runGit(repoRoot, "clean", "-fdx")
}

func runGit(repoRoot string, args ...string) error {
	return runCommand(repoRoot, "git", args...)
}

func runCommand(workdir, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = workdir
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if output, err := cmd.Output(); err != nil {
		return fmt.Errorf("%s %s failed: %w\n%s%s", name, strings.Join(args, " "), err, string(output), stderr.String())
	}
	return nil
}

func writeJSONFile(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o644)
}

func extractRepo(repoRoot string) (*extractionResult, error) {
	files, err := parseTestFiles(repoRoot)
	if err != nil {
		return nil, err
	}
	typeMaps := buildTypeMaps(files)

	report := ExtractorReport{SkippedTables: []SkippedTable{}}
	report.TestFilesScanned = len(files)
	cases := map[string][]map[string]any{}

	for _, parsed := range files {
		fileTables, fileUses, unresolvedUses := extractFileTables(parsed, typeMaps[filepath.Dir(parsed.relPath)], &report)
		for _, unresolved := range unresolvedUses {
			report.UnresolvedTableUsages = append(report.UnresolvedTableUsages, unresolved)
		}

		groupedByTest := map[string][]tableCandidate{}
		for _, use := range fileUses {
			candidate, ok := fileTables[use.CandidateKey]
			if !ok {
				continue
			}
			candidate.TestName = use.TestName
			groupedByTest[use.TestName] = append(groupedByTest[use.TestName], candidate)
		}

		testNames := make([]string, 0, len(groupedByTest))
		for testName := range groupedByTest {
			testNames = append(testNames, testName)
		}
		sort.Strings(testNames)

		for _, testName := range testNames {
			tables := groupedByTest[testName]
			sort.SliceStable(tables, func(i, j int) bool {
				if tables[i].Name == tables[j].Name {
					return len(tables[i].Rows) < len(tables[j].Rows)
				}
				return tables[i].Name < tables[j].Name
			})

			suffixCounts := map[string]int{}
			for _, table := range tables {
				key := filepath.ToSlash(filepath.Join(parsed.relPath, testName))
				if len(tables) > 1 {
					suffix := table.Name
					if suffix == "" {
						suffix = strconv.Itoa(suffixCounts[""] + 1)
					}
					suffixCounts[suffix]++
					if suffixCounts[suffix] > 1 {
						suffix = fmt.Sprintf("%s#%d", suffix, suffixCounts[suffix])
					}
					key += "#" + suffix
				}

				rows := make([]map[string]any, 0, len(table.Rows))
				for _, rowExpr := range table.Rows {
					row, err := encodeRow(rowExpr, table.FieldNames, table.Fset, table.Source)
					if err != nil {
						report.SkippedTables = append(report.SkippedTables, SkippedTable{
							File:   table.RelPath,
							Test:   table.TestName,
							Table:  table.Name,
							Reason: err.Error(),
						})
						rows = nil
						break
					}
					report.StructuredFields += row.StructuredUsed
					report.FallbackFields += row.FallbackUsed
					rows = append(rows, row.Row)
				}
				if rows == nil {
					continue
				}
				report.ExportedTables++
				report.RowsExported += len(rows)
				cases[key] = rows
			}
		}
	}

	return &extractionResult{
		Cases:  cases,
		Report: report,
	}, nil
}

func parseTestFiles(repoRoot string) ([]fileParse, error) {
	var files []fileParse
	err := filepath.WalkDir(repoRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			name := d.Name()
			if strings.HasPrefix(name, ".") || name == "vendor" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(d.Name(), "_test.go") {
			return nil
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, path, src, parser.ParseComments)
		if err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		relPath, err := filepath.Rel(repoRoot, path)
		if err != nil {
			return err
		}
		files = append(files, fileParse{
			relPath:  filepath.ToSlash(relPath),
			fullPath: path,
			src:      src,
			file:     file,
			fset:     fset,
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i].relPath < files[j].relPath
	})
	return files, nil
}

func buildTypeMaps(files []fileParse) map[string]map[string][]string {
	result := map[string]map[string][]string{}
	for _, parsed := range files {
		dir := filepath.Dir(parsed.relPath)
		if _, ok := result[dir]; !ok {
			result[dir] = map[string][]string{}
		}
		for _, decl := range parsed.file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.TYPE {
				continue
			}
			for _, spec := range gen.Specs {
				typeSpec, ok := spec.(*ast.TypeSpec)
				if !ok {
					continue
				}
				if structType, ok := typeSpec.Type.(*ast.StructType); ok {
					result[dir][typeSpec.Name.Name] = extractStructFields(structType)
				}
			}
		}
	}
	return result
}

func extractFileTables(parsed fileParse, typeMap map[string][]string, report *ExtractorReport) (map[string]tableCandidate, []tableUse, []UnresolvedUsage) {
	topLevelTables := map[string]tableCandidate{}
	helperTables := map[string]tableCandidate{}
	for _, decl := range parsed.file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.VAR {
			continue
		}
		for _, spec := range gen.Specs {
			valueSpec, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			for idx, value := range valueSpec.Values {
				if idx >= len(valueSpec.Names) {
					continue
				}
				name := valueSpec.Names[idx].Name
				candidate, ok := buildTableCandidate(name, parsed.relPath, "", parsed.file, parsed.fset, parsed.src, value, typeMap)
				if !ok {
					continue
				}
				report.CandidateTablesFound++
				topLevelTables[candidateStorageKey("", name)] = candidate
			}
		}
	}
	for _, decl := range parsed.file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Body == nil || strings.HasPrefix(fn.Name.Name, "Test") {
			continue
		}
		candidate, ok := buildHelperTableCandidate(
			fn,
			parsed.relPath,
			parsed.file,
			parsed.fset,
			parsed.src,
			typeMap,
		)
		if !ok {
			continue
		}
		report.CandidateTablesFound++
		helperTables[candidate.Name] = candidate.Candidate
	}

	var uses []tableUse
	var unresolved []UnresolvedUsage
	fileTables := map[string]tableCandidate{}
	for name, candidate := range topLevelTables {
		fileTables[name] = candidate
	}
	for name, candidate := range helperTables {
		fileTables[candidateStorageKey("", name)] = candidate
	}

	for _, decl := range parsed.file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Body == nil || !strings.HasPrefix(fn.Name.Name, "Test") {
			continue
		}

		localTables := map[string]tableCandidate{}
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			switch stmt := n.(type) {
			case *ast.AssignStmt:
				if stmt.Tok != token.DEFINE && stmt.Tok != token.ASSIGN {
					return true
				}
				for idx, rhs := range stmt.Rhs {
					if idx >= len(stmt.Lhs) {
						continue
					}
					ident, ok := stmt.Lhs[idx].(*ast.Ident)
					if !ok {
						continue
					}
					candidate, ok := buildTableCandidate(ident.Name, parsed.relPath, fn.Name.Name, parsed.file, parsed.fset, parsed.src, rhs, typeMap)
					if !ok {
						continue
					}
					report.CandidateTablesFound++
					localTables[candidateStorageKey(fn.Name.Name, ident.Name)] = candidate
				}
			case *ast.DeclStmt:
				gen, ok := stmt.Decl.(*ast.GenDecl)
				if !ok || gen.Tok != token.VAR {
					return true
				}
				for _, spec := range gen.Specs {
					valueSpec, ok := spec.(*ast.ValueSpec)
					if !ok {
						continue
					}
					for idx, value := range valueSpec.Values {
						if idx >= len(valueSpec.Names) {
							continue
						}
						name := valueSpec.Names[idx].Name
						candidate, ok := buildTableCandidate(name, parsed.relPath, fn.Name.Name, parsed.file, parsed.fset, parsed.src, value, typeMap)
						if !ok {
							continue
						}
						report.CandidateTablesFound++
						localTables[candidateStorageKey(fn.Name.Name, name)] = candidate
					}
				}
			case *ast.RangeStmt:
				tableName, helperName := rangeTableName(stmt.X)
				if helperName != "" {
					helperKey := candidateStorageKey("", helperName)
					if _, ok := helperTables[helperName]; ok {
						uses = append(uses, tableUse{
							CandidateKey: helperKey,
							TableName:    helperName,
							TestName:     fn.Name.Name,
							RelPath:      parsed.relPath,
						})
						return true
					}
					unresolved = append(unresolved, UnresolvedUsage{
						File:  parsed.relPath,
						Test:  fn.Name.Name,
						Table: helperName,
					})
					return true
				}
				if tableName == "" {
					return true
				}
				localKey := candidateStorageKey(fn.Name.Name, tableName)
				if _, ok := localTables[localKey]; ok {
					uses = append(uses, tableUse{CandidateKey: localKey, TableName: tableName, TestName: fn.Name.Name, RelPath: parsed.relPath})
					return true
				}
				globalKey := candidateStorageKey("", tableName)
				if _, ok := topLevelTables[globalKey]; ok {
					uses = append(uses, tableUse{CandidateKey: globalKey, TableName: tableName, TestName: fn.Name.Name, RelPath: parsed.relPath})
					return true
				}
				unresolved = append(unresolved, UnresolvedUsage{File: parsed.relPath, Test: fn.Name.Name, Table: tableName})
			}
			return true
		})

		for name, candidate := range localTables {
			fileTables[name] = candidate
		}
	}

	return fileTables, dedupeUses(uses), dedupeUnresolvedUses(dedupeUnresolved(unresolved, fileTables))
}

func buildHelperTableCandidate(
	fn *ast.FuncDecl,
	relPath string,
	file *ast.File,
	fset *token.FileSet,
	src []byte,
	typeMap map[string][]string,
) (helperTable, bool) {
	for _, stmt := range fn.Body.List {
		returnStmt, ok := stmt.(*ast.ReturnStmt)
		if !ok || len(returnStmt.Results) != 1 {
			continue
		}
		candidate, ok := buildTableCandidate(
			fn.Name.Name,
			relPath,
			"",
			file,
			fset,
			src,
			returnStmt.Results[0],
			typeMap,
		)
		if !ok {
			continue
		}
		return helperTable{Name: fn.Name.Name, Candidate: candidate}, true
	}
	return helperTable{}, false
}

func dedupeUses(uses []tableUse) []tableUse {
	seen := map[string]bool{}
	result := make([]tableUse, 0, len(uses))
	for _, use := range uses {
		key := use.RelPath + "\x00" + use.TestName + "\x00" + use.CandidateKey
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, use)
	}
	return result
}

func dedupeUnresolved(unresolved []UnresolvedUsage, tables map[string]tableCandidate) []UnresolvedUsage {
	var result []UnresolvedUsage
	for _, item := range unresolved {
		if _, ok := tables[item.Table]; ok {
			continue
		}
		if _, ok := tables[candidateStorageKey("", item.Table)]; ok {
			continue
		}
		result = append(result, item)
	}
	return result
}

func dedupeUnresolvedUses(unresolved []UnresolvedUsage) []UnresolvedUsage {
	seen := map[string]bool{}
	result := make([]UnresolvedUsage, 0, len(unresolved))
	for _, item := range unresolved {
		key := item.File + "\x00" + item.Test + "\x00" + item.Table
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, item)
	}
	return result
}

func buildTableCandidate(name, relPath, testName string, file *ast.File, fset *token.FileSet, src []byte, expr ast.Expr, typeMap map[string][]string) (tableCandidate, bool) {
	composite, ok := expr.(*ast.CompositeLit)
	if !ok {
		return tableCandidate{}, false
	}
	fieldNames, rows, ok := extractTableSpec(composite, typeMap)
	if !ok {
		return tableCandidate{}, false
	}
	return tableCandidate{
		Name:       name,
		FieldNames: fieldNames,
		Rows:       rows,
		RelPath:    relPath,
		TestName:   testName,
		File:       file,
		Fset:       fset,
		Source:     src,
	}, true
}

func extractTableSpec(composite *ast.CompositeLit, typeMap map[string][]string) ([]string, []ast.Expr, bool) {
	fieldNames, ok := resolveSliceStructFields(composite.Type, typeMap)
	if !ok || len(fieldNames) == 0 {
		return extractMapStructTableSpec(composite, typeMap)
	}
	rows := make([]ast.Expr, 0, len(composite.Elts))
	for _, elt := range composite.Elts {
		rows = append(rows, elt)
	}
	return fieldNames, rows, true
}

func extractMapStructTableSpec(composite *ast.CompositeLit, typeMap map[string][]string) ([]string, []ast.Expr, bool) {
	fieldNames, ok := resolveMapStructFields(composite.Type, typeMap)
	if !ok || len(fieldNames) == 0 {
		return nil, nil, false
	}
	rows := make([]ast.Expr, 0, len(composite.Elts))
	for _, elt := range composite.Elts {
		kv, ok := elt.(*ast.KeyValueExpr)
		if !ok {
			return nil, nil, false
		}
		row, ok := mapEntryToRowComposite(kv, fieldNames)
		if !ok {
			return nil, nil, false
		}
		rows = append(rows, row)
	}
	return append([]string{"name"}, fieldNames...), rows, true
}

func resolveSliceStructFields(expr ast.Expr, typeMap map[string][]string) ([]string, bool) {
	switch typed := expr.(type) {
	case *ast.ArrayType:
		return resolveStructFieldsFromExpr(typed.Elt, typeMap)
	case *ast.Ident:
		fields, ok := typeMap[typed.Name]
		return cloneStrings(fields), ok
	default:
		return nil, false
	}
}

func resolveMapStructFields(expr ast.Expr, typeMap map[string][]string) ([]string, bool) {
	mapType, ok := expr.(*ast.MapType)
	if !ok {
		return nil, false
	}
	keyIdent, ok := mapType.Key.(*ast.Ident)
	if !ok || keyIdent.Name != "string" {
		return nil, false
	}
	return resolveStructFieldsFromExpr(mapType.Value, typeMap)
}

func resolveStructFieldsFromExpr(expr ast.Expr, typeMap map[string][]string) ([]string, bool) {
	switch typed := expr.(type) {
	case *ast.StructType:
		return extractStructFields(typed), true
	case *ast.Ident:
		fields, ok := typeMap[typed.Name]
		return cloneStrings(fields), ok
	default:
		return nil, false
	}
}

func extractStructFields(structType *ast.StructType) []string {
	var fields []string
	for _, field := range structType.Fields.List {
		if len(field.Names) == 0 {
			fields = append(fields, renderNode(field.Type))
			continue
		}
		for _, name := range field.Names {
			fields = append(fields, name.Name)
		}
	}
	return fields
}

func cloneStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	cloned := make([]string, len(values))
	copy(cloned, values)
	return cloned
}

func mapEntryToRowComposite(entry *ast.KeyValueExpr, fieldNames []string) (*ast.CompositeLit, bool) {
	valueComposite, ok := entry.Value.(*ast.CompositeLit)
	if !ok {
		return nil, false
	}
	rowElts := []ast.Expr{
		&ast.KeyValueExpr{
			Key:   ast.NewIdent("name"),
			Value: entry.Key,
		},
	}
	allKeyed := true
	for _, elt := range valueComposite.Elts {
		if _, ok := elt.(*ast.KeyValueExpr); !ok {
			allKeyed = false
			break
		}
	}
	if allKeyed {
		rowElts = append(rowElts, valueComposite.Elts...)
		return &ast.CompositeLit{Elts: rowElts}, true
	}
	if len(valueComposite.Elts) > len(fieldNames) {
		return nil, false
	}
	for idx, elt := range valueComposite.Elts {
		rowElts = append(rowElts, &ast.KeyValueExpr{
			Key:   ast.NewIdent(fieldNames[idx]),
			Value: elt,
		})
	}
	return &ast.CompositeLit{Elts: rowElts}, true
}

func encodeRow(expr ast.Expr, fieldNames []string, fset *token.FileSet, src []byte) (rowEncodingResult, error) {
	composite, ok := expr.(*ast.CompositeLit)
	if !ok {
		return rowEncodingResult{}, fmt.Errorf("row %q is not a composite literal", renderExpr(expr, fset, src))
	}
	row := map[string]any{}
	structuredUsed := 0
	fallbackUsed := 0

	allKeyed := true
	for _, elt := range composite.Elts {
		if _, ok := elt.(*ast.KeyValueExpr); !ok {
			allKeyed = false
			break
		}
	}

	if allKeyed {
		for _, elt := range composite.Elts {
			keyValue := elt.(*ast.KeyValueExpr)
			fieldName := renderFieldKey(keyValue.Key, fset, src)
			encoded := encodeExpr(keyValue.Value, fset, src)
			row[fieldName] = encoded.Value
			if encoded.UsedFallback {
				fallbackUsed++
			} else {
				structuredUsed++
			}
		}
		return rowEncodingResult{Row: row, StructuredUsed: structuredUsed, FallbackUsed: fallbackUsed}, nil
	}

	if len(composite.Elts) > len(fieldNames) {
		return rowEncodingResult{}, fmt.Errorf("row %q has %d values for %d fields", renderExpr(expr, fset, src), len(composite.Elts), len(fieldNames))
	}
	for idx, elt := range composite.Elts {
		fieldName := fieldNames[idx]
		encoded := encodeExpr(elt, fset, src)
		row[fieldName] = encoded.Value
		if encoded.UsedFallback {
			fallbackUsed++
		} else {
			structuredUsed++
		}
	}
	return rowEncodingResult{Row: row, StructuredUsed: structuredUsed, FallbackUsed: fallbackUsed}, nil
}

func renderFieldKey(expr ast.Expr, fset *token.FileSet, src []byte) string {
	switch key := expr.(type) {
	case *ast.Ident:
		return key.Name
	default:
		return renderExpr(expr, fset, src)
	}
}

func encodeExpr(expr ast.Expr, fset *token.FileSet, src []byte) exprEncodingResult {
	switch typed := expr.(type) {
	case *ast.BasicLit:
		switch typed.Kind {
		case token.STRING:
			value, err := strconv.Unquote(typed.Value)
			if err != nil {
				return fallbackExpr(expr, fset, src)
			}
			return exprEncodingResult{Value: value}
		case token.INT, token.FLOAT:
			return exprEncodingResult{Value: json.Number(typed.Value)}
		default:
			return fallbackExpr(expr, fset, src)
		}
	case *ast.Ident:
		switch typed.Name {
		case "true":
			return exprEncodingResult{Value: true}
		case "false":
			return exprEncodingResult{Value: false}
		case "nil":
			return exprEncodingResult{Value: nil}
		default:
			return fallbackExpr(expr, fset, src)
		}
	case *ast.UnaryExpr:
		if (typed.Op == token.SUB || typed.Op == token.ADD) && isNumericBasicLit(typed.X) {
			inner := typed.X.(*ast.BasicLit)
			return exprEncodingResult{Value: json.Number(typed.Op.String() + inner.Value)}
		}
		return fallbackExpr(expr, fset, src)
	case *ast.ParenExpr:
		return encodeExpr(typed.X, fset, src)
	case *ast.CompositeLit:
		if isMapLiteral(typed.Type) {
			obj := map[string]any{}
			usedFallback := false
			for _, elt := range typed.Elts {
				kv, ok := elt.(*ast.KeyValueExpr)
				if !ok {
					return fallbackExpr(expr, fset, src)
				}
				key := renderExpr(kv.Key, fset, src)
				if unquoted, err := tryLiteralMapKey(kv.Key); err == nil {
					key = unquoted
				}
				value := encodeExpr(kv.Value, fset, src)
				obj[key] = value.Value
				usedFallback = usedFallback || value.UsedFallback
			}
			return exprEncodingResult{Value: obj, UsedFallback: usedFallback}
		}
		if isArrayLiteral(typed.Type) {
			values := make([]any, 0, len(typed.Elts))
			usedFallback := false
			for _, elt := range typed.Elts {
				value := encodeExpr(elt, fset, src)
				values = append(values, value.Value)
				usedFallback = usedFallback || value.UsedFallback
			}
			return exprEncodingResult{Value: values, UsedFallback: usedFallback}
		}
		return fallbackExpr(expr, fset, src)
	default:
		return fallbackExpr(expr, fset, src)
	}
}

func fallbackExpr(expr ast.Expr, fset *token.FileSet, src []byte) exprEncodingResult {
	return exprEncodingResult{
		Value: map[string]any{
			"$expr": renderExpr(expr, fset, src),
		},
		UsedFallback: true,
	}
}

func isNumericBasicLit(expr ast.Expr) bool {
	basicLit, ok := expr.(*ast.BasicLit)
	if !ok {
		return false
	}
	return basicLit.Kind == token.INT || basicLit.Kind == token.FLOAT
}

func isArrayLiteral(expr ast.Expr) bool {
	_, ok := expr.(*ast.ArrayType)
	return ok
}

func isMapLiteral(expr ast.Expr) bool {
	_, ok := expr.(*ast.MapType)
	return ok
}

func tryLiteralMapKey(expr ast.Expr) (string, error) {
	basicLit, ok := expr.(*ast.BasicLit)
	if !ok || basicLit.Kind != token.STRING {
		return "", fmt.Errorf("not a string literal")
	}
	return strconv.Unquote(basicLit.Value)
}

func renderExpr(expr ast.Expr, fset *token.FileSet, src []byte) string {
	start := fset.Position(expr.Pos()).Offset
	end := fset.Position(expr.End()).Offset
	if start >= 0 && end >= start && end <= len(src) {
		return strings.TrimSpace(string(src[start:end]))
	}
	return renderNode(expr)
}

func renderNode(node ast.Node) string {
	var buf bytes.Buffer
	if err := format.Node(&buf, token.NewFileSet(), node); err != nil {
		return ""
	}
	return strings.TrimSpace(buf.String())
}

func identName(expr ast.Expr) string {
	ident, ok := expr.(*ast.Ident)
	if !ok {
		return ""
	}
	return ident.Name
}

func rangeTableName(expr ast.Expr) (string, string) {
	if ident := identName(expr); ident != "" {
		return ident, ""
	}
	call, ok := expr.(*ast.CallExpr)
	if !ok {
		return "", ""
	}
	helperName := identName(call.Fun)
	if helperName == "" {
		return "", ""
	}
	return "", helperName
}

func candidateStorageKey(testName, tableName string) string {
	return testName + "\x00" + tableName
}

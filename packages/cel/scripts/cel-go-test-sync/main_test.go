package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestExtractRepoSynthetic(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, repoRoot, "sample/sample_test.go", `package sample

import "testing"

type namedCase struct {
	name string
	want int
}

var shared = []struct {
	input string
	want  string
}{
	{input: "hello", want: "world"},
}

func TestLocalAndShared(t *testing.T) {
	tests := []struct {
		name   string
		value  int
		build  any
		nums   []int
		labels map[string]int
	}{
		{
			name:   "first",
			value:  -1,
			build:  newBuilder(One),
			nums:   []int{1, 2},
			labels: map[string]int{"x": 1},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {})
	}
	for _, tc := range shared {
		t.Run(tc.input, func(t *testing.T) {})
	}
}

func TestNamedType(t *testing.T) {
	custom := []namedCase{
		{name: "named", want: 2},
	}
	for _, tc := range custom {
		t.Run(tc.name, func(t *testing.T) {})
	}
}
`)

	result, err := extractRepo(repoRoot)
	if err != nil {
		t.Fatalf("extractRepo() failed: %v", err)
	}

	if got := len(result.Cases); got != 3 {
		t.Fatalf("len(result.Cases) = %d, want 3", got)
	}

	testsKey := "sample/sample_test.go/TestLocalAndShared#tests"
	sharedKey := "sample/sample_test.go/TestLocalAndShared#shared"
	customKey := "sample/sample_test.go/TestNamedType"

	first := result.Cases[testsKey][0]
	if got, want := first["name"], "first"; got != want {
		t.Fatalf("tests row name = %#v, want %#v", got, want)
	}
	if got, want := first["value"], json.Number("-1"); got != want {
		t.Fatalf("tests row value = %#v, want %#v", got, want)
	}
	if !slices.Equal(anySlice(t, first["nums"]), []any{json.Number("1"), json.Number("2")}) {
		t.Fatalf("tests row nums = %#v", first["nums"])
	}
	labels, ok := first["labels"].(map[string]any)
	if !ok || labels["x"] != json.Number("1") {
		t.Fatalf("tests row labels = %#v", first["labels"])
	}
	if got := first["build"]; got == nil || !strings.Contains(mustExpr(t, got), "newBuilder(One)") {
		t.Fatalf("tests row build fallback = %#v", got)
	}

	if got, want := result.Cases[sharedKey][0]["input"], "hello"; got != want {
		t.Fatalf("shared row input = %#v, want %#v", got, want)
	}
	if got, want := result.Cases[customKey][0]["want"], json.Number("2"); got != want {
		t.Fatalf("custom row want = %#v, want %#v", got, want)
	}

	report := result.Report
	if report.CandidateTablesFound != 3 {
		t.Fatalf("CandidateTablesFound = %d, want 3", report.CandidateTablesFound)
	}
	if report.ExportedTables != 3 {
		t.Fatalf("ExportedTables = %d, want 3", report.ExportedTables)
	}
	if report.RowsExported != 3 {
		t.Fatalf("RowsExported = %d, want 3", report.RowsExported)
	}
	if report.FallbackFields == 0 {
		t.Fatalf("FallbackFields = %d, want > 0", report.FallbackFields)
	}
	if len(report.SkippedTables) != 0 {
		t.Fatalf("SkippedTables = %#v, want none", report.SkippedTables)
	}
}

func TestExtractRepoDeterministic(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, repoRoot, "stable/stable_test.go", `package stable

import "testing"

func TestStable(t *testing.T) {
	cases := []struct {
		name string
		want int
	}{
		{name: "a", want: 1},
		{name: "b", want: 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {})
	}
}
`)

	first, err := extractRepo(repoRoot)
	if err != nil {
		t.Fatalf("first extractRepo() failed: %v", err)
	}
	second, err := extractRepo(repoRoot)
	if err != nil {
		t.Fatalf("second extractRepo() failed: %v", err)
	}

	firstJSON, err := json.Marshal(first.Cases)
	if err != nil {
		t.Fatalf("json.Marshal(first.Cases) failed: %v", err)
	}
	secondJSON, err := json.Marshal(second.Cases)
	if err != nil {
		t.Fatalf("json.Marshal(second.Cases) failed: %v", err)
	}
	if string(firstJSON) != string(secondJSON) {
		t.Fatalf("determinism mismatch:\n%s\n%s", firstJSON, secondJSON)
	}
}

func TestExtractRepoHelperReturnedTable(t *testing.T) {
	repoRoot := t.TempDir()
	writeTestFile(t, repoRoot, "helper/helper_test.go", `package helper

import "testing"

type testInfo struct {
	name string
	want int
}

func testCases(t testing.TB) []testInfo {
	t.Helper()
	return []testInfo{
		{name: "first", want: 1},
		{name: "second", want: 2},
	}
}

func TestFromHelper(t *testing.T) {
	for _, tc := range testCases(t) {
		t.Run(tc.name, func(t *testing.T) {})
	}
}
`)

	result, err := extractRepo(repoRoot)
	if err != nil {
		t.Fatalf("extractRepo() failed: %v", err)
	}

	key := "helper/helper_test.go/TestFromHelper"
	rows := result.Cases[key]
	if got := len(rows); got != 2 {
		t.Fatalf("%s rows = %d, want 2", key, got)
	}
	if got, want := rows[0]["name"], "first"; got != want {
		t.Fatalf("%s first name = %#v, want %#v", key, got, want)
	}
	if got, want := rows[1]["want"], json.Number("2"); got != want {
		t.Fatalf("%s second want = %#v, want %#v", key, got, want)
	}
	if len(result.Report.UnresolvedTableUsages) != 0 {
		t.Fatalf("UnresolvedTableUsages = %#v, want none", result.Report.UnresolvedTableUsages)
	}
}

func TestExtractRepoUpstreamSamples(t *testing.T) {
	repoRoot := t.TempDir()
	for _, relPath := range []string{
		"common/types/types_test.go",
		"parser/unescape_test.go",
		"cel/cel_test.go",
	} {
		srcPath := filepath.Join(moduleCacheRoot(t), "github.com/google/cel-go@"+defaultRef, filepath.FromSlash(relPath))
		content, err := os.ReadFile(srcPath)
		if err != nil {
			t.Fatalf("os.ReadFile(%q) failed: %v", srcPath, err)
		}
		writeTestFile(t, repoRoot, relPath, string(content))
	}

	result, err := extractRepo(repoRoot)
	if err != nil {
		t.Fatalf("extractRepo() failed: %v", err)
	}

	typeStringKey := "common/types/types_test.go/TestTypeString"
	if got := len(result.Cases[typeStringKey]); got != 16 {
		t.Fatalf("%s rows = %d, want 16", typeStringKey, got)
	}
	if got, want := result.Cases[typeStringKey][0]["out"], "list(int)"; got != want {
		t.Fatalf("%s first out = %#v, want %#v", typeStringKey, got, want)
	}
	if got := mustExpr(t, result.Cases[typeStringKey][0]["in"]); !strings.Contains(got, "NewListType(IntType)") {
		t.Fatalf("%s first in fallback = %q", typeStringKey, got)
	}

	unescapeKey := "parser/unescape_test.go/TestUnescape"
	if got := len(result.Cases[unescapeKey]); got < 25 {
		t.Fatalf("%s rows = %d, want at least 25", unescapeKey, got)
	}
	if got, want := result.Cases[unescapeKey][0]["in"], `'hello'`; got != want {
		t.Fatalf("%s first in = %#v, want %#v", unescapeKey, got, want)
	}

	crossTypeKey := "cel/cel_test.go/TestCrossTypeNumericComparisons"
	if got := len(result.Cases[crossTypeKey]); got < 4 {
		t.Fatalf("%s rows = %d, want at least 4", crossTypeKey, got)
	}
	if got, ok := result.Cases[crossTypeKey][0]["name"].(string); !ok || got == "" {
		t.Fatalf("%s first name = %#v, want non-empty string", crossTypeKey, result.Cases[crossTypeKey][0]["name"])
	}
	if result.Report.FallbackFields == 0 {
		t.Fatalf("FallbackFields = %d, want > 0 for upstream fixtures", result.Report.FallbackFields)
	}
}

func moduleCacheRoot(t *testing.T) string {
	t.Helper()
	cmd := exec.Command("go", "env", "GOMODCACHE")
	output, err := cmd.Output()
	if err != nil {
		t.Fatalf("go env GOMODCACHE failed: %v", err)
	}
	return strings.TrimSpace(string(output))
}

func writeTestFile(t *testing.T, repoRoot, relPath, content string) {
	t.Helper()
	fullPath := filepath.Join(repoRoot, filepath.FromSlash(relPath))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("os.MkdirAll(%q) failed: %v", filepath.Dir(fullPath), err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("os.WriteFile(%q) failed: %v", fullPath, err)
	}
}

func anySlice(t *testing.T, value any) []any {
	t.Helper()
	slice, ok := value.([]any)
	if !ok {
		t.Fatalf("value %#v is not []any", value)
	}
	return slice
}

func mustExpr(t *testing.T, value any) string {
	t.Helper()
	object, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("value %#v is not a fallback expression object", value)
	}
	expr, ok := object["$expr"].(string)
	if !ok {
		t.Fatalf("fallback object %#v does not contain $expr string", object)
	}
	return expr
}

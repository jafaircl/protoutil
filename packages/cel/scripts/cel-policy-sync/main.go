// Command cel-policy-sync synchronizes cel-policy conformance fixtures as canonical JSON.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"go.yaml.in/yaml/v3"
)

const (
	defaultRepoURL    = "https://github.com/cel-expr/cel-policy.git"
	defaultRef        = "c531abcf97d3bd910b8ac9a106eda42ce9d1bec9"
	defaultRepoSubdir = "conformance/testdata"
	defaultOutputDir  = "./testdata/policy"
	defaultWorkdir    = "./.tmp/cel-policy-upstream"
)

// syncConfig configures the upstream checkout and generated fixture destination.
type syncConfig struct {
	RepoURL    string
	Ref        string
	RepoSubdir string
	OutputDir  string
	Workdir    string
}

// policyDocument contains the original YAML and its canonical JSON-compatible value.
type policyDocument struct {
	Source string `json:"source"`
	Value  any    `json:"value"`
}

// policyFixture contains every YAML document belonging to one upstream policy suite.
type policyFixture struct {
	Path  string                    `json:"path"`
	Files map[string]policyDocument `json:"files"`
}

// fixtureDirectoryOptions describes one recursive fixture-directory synchronization step.
type fixtureDirectoryOptions struct {
	RootDir    string
	CurrentDir string
	OutputDir  string
}

// writePolicyFixtureOptions describes one policy fixture bundle write.
type writePolicyFixtureOptions struct {
	RootDir    string
	FixtureDir string
	OutputDir  string
	Entries    []os.DirEntry
}

// commandOptions describes one synchronization subprocess invocation.
type commandOptions struct {
	Workdir string
	Name    string
	Args    []string
}

// main parses command-line options and synchronizes the selected upstream revision.
func main() {
	cfg := syncConfig{}
	flag.StringVar(&cfg.RepoURL, "repo", defaultRepoURL, "git repository URL or path for cel-policy fixtures")
	flag.StringVar(&cfg.Ref, "ref", defaultRef, "git branch, tag, or commit to sync")
	flag.StringVar(&cfg.RepoSubdir, "fixtures-subdir", defaultRepoSubdir, "fixture directory within the cloned repo")
	flag.StringVar(&cfg.OutputDir, "out", defaultOutputDir, "directory for canonical JSON fixtures")
	flag.StringVar(&cfg.Workdir, "workdir", defaultWorkdir, "reusable clone directory")
	flag.Parse()

	if err := run(cfg); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// run prepares the upstream repository and synchronizes its policy fixtures.
func run(cfg syncConfig) error {
	repoRoot, err := prepareRepo(cfg)
	if err != nil {
		return err
	}
	return syncFixtures(
		filepath.Join(repoRoot, filepath.FromSlash(cfg.RepoSubdir)),
		cfg.OutputDir,
	)
}

// syncFixtures recursively converts complete policy fixture directories to JSON bundles.
func syncFixtures(fixturesDir, outputDir string) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	if err := clearJSONFixtures(outputDir); err != nil {
		return err
	}
	return syncFixtureDirectory(fixtureDirectoryOptions{
		RootDir:    fixturesDir,
		CurrentDir: fixturesDir,
		OutputDir:  outputDir,
	})
}

// syncFixtureDirectory visits fixture directories without callback-style functional arguments.
func syncFixtureDirectory(options fixtureDirectoryOptions) error {
	entries, err := os.ReadDir(options.CurrentDir)
	if err != nil {
		return err
	}

	names := make(map[string]bool, len(entries))
	for _, entry := range entries {
		names[entry.Name()] = true
	}
	if names["policy.yaml"] && names["tests.yaml"] {
		if err := writePolicyFixture(writePolicyFixtureOptions{
			RootDir:    options.RootDir,
			FixtureDir: options.CurrentDir,
			OutputDir:  options.OutputDir,
			Entries:    entries,
		}); err != nil {
			return err
		}
	}
	for _, entry := range entries {
		if entry.IsDir() {
			if err := syncFixtureDirectory(fixtureDirectoryOptions{
				RootDir:    options.RootDir,
				CurrentDir: filepath.Join(options.CurrentDir, entry.Name()),
				OutputDir:  options.OutputDir,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

// writePolicyFixture converts every YAML document in a suite directory to one JSON file.
func writePolicyFixture(options writePolicyFixtureOptions) error {
	relativePath, err := filepath.Rel(options.RootDir, options.FixtureDir)
	if err != nil {
		return err
	}
	fixture := policyFixture{
		Path:  filepath.ToSlash(relativePath),
		Files: make(map[string]policyDocument),
	}
	for _, entry := range options.Entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}
		inputPath := filepath.Join(options.FixtureDir, entry.Name())
		input, err := os.ReadFile(inputPath)
		if err != nil {
			return err
		}
		var value any
		if err := yaml.Unmarshal(input, &value); err != nil {
			return fmt.Errorf("unmarshal %s: %w", inputPath, err)
		}
		fixture.Files[entry.Name()] = policyDocument{
			Source: string(input),
			Value:  value,
		}
	}

	output, err := json.MarshalIndent(fixture, "", "  ")
	if err != nil {
		return err
	}
	outputName := strings.ReplaceAll(filepath.ToSlash(relativePath), "_", "-")
	outputName = strings.ReplaceAll(outputName, "/", "--") + ".json"
	return os.WriteFile(filepath.Join(options.OutputDir, outputName), append(output, '\n'), 0o644)
}

// clearJSONFixtures removes generated JSON while preserving the Markdown report.
func clearJSONFixtures(outputDir string) error {
	entries, err := os.ReadDir(outputDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		if err := os.Remove(filepath.Join(outputDir, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

// prepareRepo clones or refreshes the reusable cel-policy checkout at the configured revision.
func prepareRepo(cfg syncConfig) (string, error) {
	if _, err := os.Stat(filepath.Join(cfg.Workdir, ".git")); err != nil {
		if !os.IsNotExist(err) {
			return "", err
		}
		if err := os.MkdirAll(filepath.Dir(cfg.Workdir), 0o755); err != nil {
			return "", err
		}
		if err := runCommand(commandOptions{
			Name: "git",
			Args: []string{"clone", cfg.RepoURL, cfg.Workdir},
		}); err != nil {
			return "", err
		}
	} else if err := runCommand(commandOptions{
		Workdir: cfg.Workdir,
		Name:    "git",
		Args:    []string{"fetch", "--tags", "--force", "origin"},
	}); err != nil {
		return "", err
	}
	if err := runCommand(commandOptions{
		Workdir: cfg.Workdir,
		Name:    "git",
		Args:    []string{"checkout", "--force", cfg.Ref},
	}); err != nil {
		return "", err
	}
	if err := runCommand(commandOptions{
		Workdir: cfg.Workdir,
		Name:    "git",
		Args:    []string{"clean", "-fdx"},
	}); err != nil {
		return "", err
	}
	return cfg.Workdir, nil
}

// runCommand executes one synchronization subprocess and includes captured output on failure.
func runCommand(options commandOptions) error {
	cmd := exec.Command(options.Name, options.Args...)
	cmd.Dir = options.Workdir
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if output, err := cmd.Output(); err != nil {
		return fmt.Errorf("%s %s failed: %w\n%s%s", options.Name, strings.Join(options.Args, " "), err, string(output), stderr.String())
	}
	return nil
}

package main

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestSyncFixturesCopiesFilesAndClearsStaleOutput(t *testing.T) {
	inputDir := filepath.Join(t.TempDir(), "input")
	outputDir := filepath.Join(t.TempDir(), "output")

	if err := os.MkdirAll(inputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(inputDir) failed: %v", err)
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(outputDir) failed: %v", err)
	}

	writeFile(t, filepath.Join(inputDir, "b.yaml"), "b: 2\n")
	writeFile(t, filepath.Join(inputDir, "a.json"), "{\n  \"a\": 1\n}\n")
	writeFile(t, filepath.Join(outputDir, "stale.txt"), "stale\n")
	if err := os.MkdirAll(filepath.Join(outputDir, "nested"), 0o755); err != nil {
		t.Fatalf("os.MkdirAll(outputDir/nested) failed: %v", err)
	}
	writeFile(t, filepath.Join(outputDir, "nested", "stale.txt"), "stale\n")

	if err := syncFixtures(inputDir, outputDir); err != nil {
		t.Fatalf("syncFixtures() failed: %v", err)
	}

	entries, err := os.ReadDir(outputDir)
	if err != nil {
		t.Fatalf("os.ReadDir(outputDir) failed: %v", err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	if !slices.Equal(names, []string{"a.json", "b.yaml"}) {
		t.Fatalf("output entries = %v, want [a.json b.yaml]", names)
	}

	assertFileContent(t, filepath.Join(outputDir, "a.json"), "{\n  \"a\": 1\n}\n")
	assertFileContent(t, filepath.Join(outputDir, "b.yaml"), "b: 2\n")
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("os.MkdirAll(%q) failed: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("os.WriteFile(%q) failed: %v", path, err)
	}
}

func assertFileContent(t *testing.T, path, want string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("os.ReadFile(%q) failed: %v", path, err)
	}
	if string(got) != want {
		t.Fatalf("%s content = %q, want %q", path, string(got), want)
	}
}

func TestSyncTargetsIncludesAllCurrentFixtureBuckets(t *testing.T) {
	got := syncTargets()
	want := []syncTarget{
		{RepoSubdir: "common/env/testdata", OutputDir: "./testdata/cel-go-files/common/env/testdata"},
		{RepoSubdir: "cel/testdata", OutputDir: "./testdata/cel-go-files/cel/testdata"},
	}
	if !slices.Equal(got, want) {
		t.Fatalf("syncTargets() = %#v, want %#v", got, want)
	}
}

func TestShouldCopyFile(t *testing.T) {
	if shouldCopyFile("BUILD.bazel") {
		t.Fatal("shouldCopyFile(BUILD.bazel) = true, want false")
	}
	if !shouldCopyFile("team.fds") {
		t.Fatal("shouldCopyFile(team.fds) = false, want true")
	}
}

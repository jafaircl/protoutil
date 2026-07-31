package main

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

const (
	defaultRepoURL = "https://github.com/google/cel-go.git"
	defaultRef     = "v0.30.0"
	defaultWorkdir = "./.tmp/cel-go-upstream"
)

type syncTarget struct {
	RepoSubdir string
	OutputDir  string
}

type syncConfig struct {
	RepoURL string
	Ref     string
	Workdir string
}

func main() {
	cfg := syncConfig{}
	flag.StringVar(&cfg.RepoURL, "repo", defaultRepoURL, "git repository URL or path for cel-go")
	flag.StringVar(&cfg.Ref, "ref", defaultRef, "git tag, branch, or commit to sync")
	flag.StringVar(&cfg.Workdir, "workdir", defaultWorkdir, "reusable clone directory")
	flag.Parse()

	if err := run(cfg); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(cfg syncConfig) error {
	repoRoot, err := prepareRepo(cfg.RepoURL, cfg.Ref, cfg.Workdir)
	if err != nil {
		return err
	}

	for _, target := range syncTargets() {
		if err := syncFixtures(filepath.Join(repoRoot, filepath.FromSlash(target.RepoSubdir)), target.OutputDir); err != nil {
			return err
		}
	}
	return nil
}

func syncTargets() []syncTarget {
	return []syncTarget{
		{
			RepoSubdir: "common/env/testdata",
			OutputDir:  "./testdata/cel-go-files/common/env/testdata",
		},
		{
			RepoSubdir: "cel/testdata",
			OutputDir:  "./testdata/cel-go-files/cel/testdata",
		},
	}
}

func syncFixtures(inputDir, outputDir string) error {
	entries, err := os.ReadDir(inputDir)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	if err := clearFiles(outputDir); err != nil {
		return err
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() || !shouldCopyFile(entry.Name()) {
			continue
		}

		srcPath := filepath.Join(inputDir, entry.Name())
		data, err := os.ReadFile(srcPath)
		if err != nil {
			return err
		}

		dstPath := filepath.Join(outputDir, entry.Name())
		if err := os.WriteFile(dstPath, data, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func shouldCopyFile(name string) bool {
	return name != "BUILD.bazel"
}

func clearFiles(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			if err := os.RemoveAll(filepath.Join(dir, entry.Name())); err != nil {
				return err
			}
			continue
		}
		if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

func prepareRepo(repoURL, ref, workdir string) (string, error) {
	if _, err := os.Stat(filepath.Join(workdir, ".git")); err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}
		if err := cloneRepo(repoURL, workdir); err != nil {
			return "", err
		}
	} else {
		if err := runGit(workdir, "fetch", "--tags", "--force", "origin"); err != nil {
			return "", err
		}
	}
	if err := checkoutRepo(workdir, ref); err != nil {
		return "", err
	}
	return workdir, nil
}

func cloneRepo(repoURL, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
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

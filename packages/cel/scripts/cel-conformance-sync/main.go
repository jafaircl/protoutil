package main

import (
	"bytes"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/encoding/prototext"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

const (
	defaultRepoURL     = "https://github.com/cel-expr/cel-spec.git"
	defaultRef         = "v0.25.3"
	defaultRepoSubdir  = "tests/simple/testdata"
	defaultProtoDir    = "../testing"
	defaultOutputDir   = "./testdata/conformance"
	defaultMessageName = "cel.expr.conformance.test.SimpleTestFile"
	defaultWorkdir     = "./.tmp/cel-spec-upstream"
	outputFileSuffix   = ".textproto.json"
	// The conformance wrapper schema lives in @protoutil/testing since the testing schemas were
	// split into their own package.
	wrapperProtoPath = "src/proto/protoutil/cel/v1/conformance.proto"
)

type syncConfig struct {
	RepoURL     string
	Ref         string
	RepoSubdir  string
	ProtoDir    string
	OutputDir   string
	MessageName string
	Workdir     string
}

func main() {
	cfg := syncConfig{}
	flag.StringVar(&cfg.RepoURL, "repo", defaultRepoURL, "git repository URL or path for cel-spec fixtures")
	flag.StringVar(&cfg.Ref, "ref", defaultRef, "git tag, branch, or commit to sync")
	flag.StringVar(&cfg.RepoSubdir, "fixtures-subdir", defaultRepoSubdir, "fixture directory within the cloned repo")
	flag.StringVar(&cfg.ProtoDir, "proto", defaultProtoDir, "CEL package root used for Buf descriptor builds")
	flag.StringVar(&cfg.OutputDir, "out", defaultOutputDir, "directory for canonical JSON fixtures")
	flag.StringVar(&cfg.MessageName, "message", defaultMessageName, "fully-qualified fixture message name")
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
	fixturesDir := filepath.Join(repoRoot, filepath.FromSlash(cfg.RepoSubdir))
	return syncFixtures(fixturesDir, cfg.OutputDir, cfg.ProtoDir, cfg.MessageName)
}

func syncFixtures(fixturesDir, outputDir, protoDir, messageName string) error {
	files, resolver, err := loadDescriptors(protoDir)
	if err != nil {
		return err
	}
	desc, err := files.FindDescriptorByName(protoreflect.FullName(messageName))
	if err != nil {
		return err
	}
	messageDesc, ok := desc.(protoreflect.MessageDescriptor)
	if !ok {
		return fmt.Errorf("%s is not a message", messageName)
	}

	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	if err := clearJSONFixtures(outputDir); err != nil {
		return err
	}

	entries, err := os.ReadDir(fixturesDir)
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".textproto") {
			continue
		}

		inputPath := filepath.Join(fixturesDir, entry.Name())
		input, err := os.ReadFile(inputPath)
		if err != nil {
			return err
		}

		msg := dynamicpb.NewMessage(messageDesc)
		if err := (prototext.UnmarshalOptions{Resolver: resolver}).Unmarshal(input, msg); err != nil {
			return fmt.Errorf("unmarshal %s: %w", inputPath, err)
		}
		jsonBytes, err := protojson.MarshalOptions{
			Multiline:       true,
			Indent:          "  ",
			EmitUnpopulated: false,
			UseProtoNames:   false,
			Resolver:        resolver,
		}.Marshal(msg)
		if err != nil {
			return err
		}

		outputPath := filepath.Join(outputDir, strings.TrimSuffix(entry.Name(), ".textproto")+outputFileSuffix)
		if err := os.WriteFile(outputPath, append(jsonBytes, '\n'), 0o644); err != nil {
			return err
		}
	}
	return nil
}

func clearJSONFixtures(outputDir string) error {
	entries, err := os.ReadDir(outputDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), outputFileSuffix) {
			continue
		}
		if err := os.Remove(filepath.Join(outputDir, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

func prepareRepo(repoURL, ref, workdir string) (string, error) {
	if _, err := os.Stat(filepath.Join(workdir, ".git")); err != nil {
		if !os.IsNotExist(err) {
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

func loadDescriptors(protoDir string) (*protoregistry.Files, *protoregistry.Types, error) {
	bufPath, err := resolveBufBinary()
	if err != nil {
		return nil, nil, err
	}
	cmd := exec.Command(bufPath, "build", ".", "--path", wrapperProtoPath, "-o", "-")
	cmd.Dir = protoDir
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, nil, fmt.Errorf("buf build failed: %w\n%s", err, stderr.String())
	}
	set := &descriptorpb.FileDescriptorSet{}
	if err := proto.Unmarshal(out, set); err != nil {
		return nil, nil, err
	}
	files, err := protodesc.NewFiles(set)
	if err != nil {
		return nil, nil, err
	}
	types := new(protoregistry.Types)
	if err := registerDynamicTypes(files, types); err != nil {
		return nil, nil, err
	}
	return files, types, nil
}

func resolveBufBinary() (string, error) {
	if path, err := exec.LookPath("buf"); err == nil {
		return path, nil
	}

	candidates := []string{
		"/opt/homebrew/bin/buf",
		"/usr/local/bin/buf",
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}

	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for dir := cwd; ; dir = filepath.Dir(dir) {
		candidate := filepath.Join(dir, "node_modules", ".bin", "buf")
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}
	return "", fmt.Errorf("buf not found in PATH, standard install locations, or repo-local node_modules/.bin")
}

func registerDynamicTypes(files *protoregistry.Files, types *protoregistry.Types) error {
	var registerMessage func(messages protoreflect.MessageDescriptors) error
	var registerExtensions func(extensions protoreflect.ExtensionDescriptors) error
	registerMessage = func(messages protoreflect.MessageDescriptors) error {
		for i := 0; i < messages.Len(); i++ {
			message := messages.Get(i)
			if err := types.RegisterMessage(dynamicpb.NewMessageType(message)); err != nil && err != protoregistry.NotFound {
				if !strings.Contains(err.Error(), "already registered") {
					return err
				}
			}
			if err := registerExtensions(message.Extensions()); err != nil {
				return err
			}
			if err := registerMessage(message.Messages()); err != nil {
				return err
			}
		}
		return nil
	}
	registerExtensions = func(extensions protoreflect.ExtensionDescriptors) error {
		for i := 0; i < extensions.Len(); i++ {
			extension := extensions.Get(i)
			if err := types.RegisterExtension(dynamicpb.NewExtensionType(extension)); err != nil && err != protoregistry.NotFound {
				if !strings.Contains(err.Error(), "already registered") {
					return err
				}
			}
		}
		return nil
	}

	var walkErr error
	files.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		if err := registerExtensions(file.Extensions()); err != nil {
			walkErr = err
			return false
		}
		if err := registerMessage(file.Messages()); err != nil {
			walkErr = err
			return false
		}
		return true
	})
	return walkErr
}

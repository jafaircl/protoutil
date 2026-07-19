package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"google.golang.org/protobuf/reflect/protoreflect"
)

func TestSyncFixtures(t *testing.T) {
	fixturesDir := t.TempDir()
	outputDir := t.TempDir()
	writeFixture(t, fixturesDir, "sample.textproto", `
name: "sample"
description: "sample conformance file"
section: {
  name: "basic"
  test: {
    name: "literal_true"
    expr: "true"
  }
}
`)
	writeFixture(t, outputDir, "stale.textproto.json", `{"stale":true}`)

	protoRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("filepath.Abs() failed: %v", err)
	}

	err = syncFixtures(
		fixturesDir,
		outputDir,
		protoRoot,
		defaultMessageName,
	)
	if err != nil {
		t.Fatalf("syncFixtures() failed: %v", err)
	}

	outputPath := filepath.Join(outputDir, "sample.textproto.json")
	data, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("os.ReadFile(%q) failed: %v", outputPath, err)
	}
	json := string(data)
	if !strings.Contains(json, `"name":`) || !strings.Contains(json, `"sample"`) {
		t.Fatalf("output missing file name: %s", json)
	}
	if !strings.Contains(json, `"expr":`) || !strings.Contains(json, `"true"`) {
		t.Fatalf("output missing test expr: %s", json)
	}
	if _, err := os.Stat(filepath.Join(outputDir, "stale.textproto.json")); !os.IsNotExist(err) {
		t.Fatalf("stale fixture still exists, err=%v", err)
	}
}

func TestSyncFixturesWithAnyPayload(t *testing.T) {
	fixturesDir := t.TempDir()
	outputDir := t.TempDir()
	writeFixture(t, fixturesDir, "proto3.textproto", `
name: "proto3"
section {
  name: "literal_singular"
  test {
    name: "int64_nocontainer"
    expr: "cel.expr.conformance.proto3.TestAllTypes{single_int64: 17}"
    value {
      object_value {
        [type.googleapis.com/cel.expr.conformance.proto3.TestAllTypes] { single_int64: 17 }
      }
    }
  }
}
`)

	protoRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("filepath.Abs() failed: %v", err)
	}
	err = syncFixtures(fixturesDir, outputDir, protoRoot, defaultMessageName)
	if err != nil {
		t.Fatalf("syncFixtures() failed: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(outputDir, "proto3.textproto.json"))
	if err != nil {
		t.Fatalf("os.ReadFile() failed: %v", err)
	}
	json := string(data)
	if !strings.Contains(json, `"@type"`) || !strings.Contains(json, `cel.expr.conformance.proto3.TestAllTypes`) {
		t.Fatalf("output missing Any type payload: %s", json)
	}
}

func TestLoadDescriptorsResolvesConformanceAnyTypes(t *testing.T) {
	protoRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("filepath.Abs() failed: %v", err)
	}
	_, resolver, err := loadDescriptors(protoRoot)
	if err != nil {
		t.Fatalf("loadDescriptors() failed: %v", err)
	}
	if _, err := resolver.FindMessageByURL("type.googleapis.com/cel.expr.conformance.proto3.TestAllTypes"); err != nil {
		t.Fatalf("FindMessageByURL() failed: %v", err)
	}
	if _, err := resolver.FindMessageByName(protoreflect.FullName("cel.expr.conformance.proto3.TestAllTypes")); err != nil {
		t.Fatalf("FindMessageByName() failed: %v", err)
	}
	if _, err := resolver.FindExtensionByName(protoreflect.FullName("cel.expr.conformance.proto2.int32_ext")); err != nil {
		t.Fatalf("FindExtensionByName() failed: %v", err)
	}
}

func writeFixture(t *testing.T, dir, name, content string) {
	t.Helper()
	fullPath := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("os.MkdirAll(%q) failed: %v", filepath.Dir(fullPath), err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("os.WriteFile(%q) failed: %v", fullPath, err)
	}
}

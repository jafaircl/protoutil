package main

import (
	"bytes"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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

func main() {
	fixtures := flag.String("fixtures", "conformance/fixtures/pubsub", "directory containing .textproto fixtures")
	out := flag.String("out", "conformance/generated/pubsub", "directory for canonical JSON fixtures")
	protoDir := flag.String("proto", "packages/conformance-runner/proto", "directory containing conformance protos")
	message := flag.String("message", "protoutil.conformance.pubsub.v1.Suite", "fully-qualified fixture message")
	flag.Parse()

	files, types, err := loadDescriptors(*protoDir)
	check(err)
	desc, err := files.FindDescriptorByName(protoreflect.FullName(*message))
	check(err)
	messageDesc, ok := desc.(protoreflect.MessageDescriptor)
	if !ok {
		check(fmt.Errorf("%s is not a message", *message))
	}

	check(os.MkdirAll(*out, 0o755))
	entries, err := os.ReadDir(*fixtures)
	check(err)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".textproto") {
			continue
		}
		inputPath := filepath.Join(*fixtures, entry.Name())
		input, err := os.ReadFile(inputPath)
		check(err)

		msg := dynamicpb.NewMessage(messageDesc)
		check(prototext.UnmarshalOptions{Resolver: types}.Unmarshal(input, msg))
		json, err := protojson.MarshalOptions{
			Multiline:       true,
			Indent:          "  ",
			EmitUnpopulated: false,
			UseProtoNames:   false,
		}.Marshal(msg)
		check(err)

		outputPath := filepath.Join(*out, strings.TrimSuffix(entry.Name(), ".textproto")+".json")
		check(os.WriteFile(outputPath, append(json, '\n'), 0o644))
	}
}

func loadDescriptors(protoDir string) (*protoregistry.Files, *dynamicpb.Types, error) {
	cmd := exec.Command("buf", "build", protoDir, "-o", "-")
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
	return files, dynamicpb.NewTypes(files), nil
}

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

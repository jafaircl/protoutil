module github.com/jafaircl/protoutil/cel-benchmark

go 1.23.0

require (
	github.com/google/cel-go v0.31.0
	github.com/google/cel-go/policy v0.0.0
	go.yaml.in/yaml/v3 v3.0.4
)

require (
	cel.dev/expr v0.25.1 // indirect
	github.com/antlr4-go/antlr/v4 v4.13.1 // indirect
	golang.org/x/exp v0.0.0-20240823005443-9b4947da3948 // indirect
	golang.org/x/text v0.22.0 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20250311190419-81fb87f6b8bf // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20250311190419-81fb87f6b8bf // indirect
	google.golang.org/protobuf v1.36.10 // indirect
)

replace github.com/google/cel-go => ../../.tmp/cel-go-upstream

replace github.com/google/cel-go/policy => ../../.tmp/cel-go-upstream/policy

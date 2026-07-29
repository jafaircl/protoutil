# cel-go Coverage Ledger

Generated recursively from `.tmp/cel-go-upstream/**/*_test.go` by:

```sh
node scripts/cel-coverage-ledger.mjs
```

An entry is **covered** when its exact upstream key appears in a local `describe`, `it`, `test`,
or synced-case declaration under `src`. This is a structural tracking signal; subsystem
completion still requires reviewing assertions and implementation against the upstream source.

| Kind | Covered | TODO | Skipped | Missing | Total | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tests | 773 | 24 | 0 | 39 | 836 | 92.5% |
| Examples | 3 | 0 | 0 | 3 | 6 | 50.0% |

## Package summary

| Upstream package | Covered | TODO | Skipped | Missing | Total | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `cel` | 156 | 0 | 0 | 0 | 156 | 100.0% |
| `checker` | 12 | 0 | 0 | 0 | 12 | 100.0% |
| `common` | 15 | 0 | 0 | 0 | 15 | 100.0% |
| `common/ast` | 53 | 0 | 0 | 0 | 53 | 100.0% |
| `common/containers` | 9 | 0 | 0 | 0 | 9 | 100.0% |
| `common/decls` | 41 | 2 | 0 | 0 | 43 | 95.3% |
| `common/env` | 26 | 0 | 0 | 0 | 26 | 100.0% |
| `common/runes` | 7 | 0 | 0 | 0 | 7 | 100.0% |
| `common/types` | 258 | 19 | 0 | 0 | 277 | 93.1% |
| `common/types/pb` | 18 | 3 | 0 | 0 | 21 | 85.7% |
| `conformance` | 1 | 0 | 0 | 1 | 2 | 50.0% |
| `conformance/policy` | 0 | 0 | 0 | 2 | 2 | 0.0% |
| `examples` | 0 | 0 | 0 | 3 | 3 | 0.0% |
| `ext` | 85 | 0 | 0 | 0 | 85 | 100.0% |
| `interpreter` | 67 | 0 | 0 | 0 | 67 | 100.0% |
| `parser` | 10 | 0 | 0 | 0 | 10 | 100.0% |
| `policy` | 18 | 0 | 0 | 0 | 18 | 100.0% |
| `repl` | 0 | 0 | 0 | 27 | 27 | 0.0% |
| `repl/parser` | 0 | 0 | 0 | 2 | 2 | 0.0% |
| `tools/celtest` | 0 | 0 | 0 | 4 | 4 | 0.0% |
| `tools/compiler` | 0 | 0 | 0 | 3 | 3 | 0.0% |

## Test functions

### `cel/cel_example_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `Example` | covered | `src/cel/env.spec.ts` |
| `Example_globalOverload` | covered | `src/cel/env.spec.ts` |
| `Example_statefulOverload` | covered | `src/cel/env.spec.ts` |

### `cel/cel_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `Test_ExampleWithBuiltins` | covered | `src/cel/env.spec.ts` |
| `TestEval` | covered | `src/cel/env.spec.ts` |
| `TestAbbrevsCompiled` | covered | `src/cel/env.spec.ts` |
| `TestAbbrevsParsed` | covered | `src/cel/env.spec.ts` |
| `TestAbbrevsDisambiguation` | covered | `src/cel/env.spec.ts` |
| `TestConvertToNativeJSONStructure` | covered | `src/cel/env.spec.ts` |
| `TestCustomEnvError` | covered | `src/cel/env.spec.ts` |
| `TestCustomEnv` | covered | `src/cel/env.spec.ts` |
| `TestCrossTypeNumericComparisons` | covered | `src/cel/env.spec.ts` |
| `TestExtendStdlibFunction` | covered | `src/cel/env.spec.ts` |
| `TestSubsetStdLib` | covered | `src/cel/env.spec.ts` |
| `TestSubsetStdLibError` | covered | `src/cel/env.spec.ts` |
| `TestSubsetStdLibMerge` | covered | `src/cel/env.spec.ts` |
| `TestSubsetStdLibMergeError` | covered | `src/cel/env.spec.ts` |
| `TestCustomTypes` | covered | `src/cel/env.spec.ts` |
| `TestTypeIsolation` | covered | `src/cel/env.spec.ts` |
| `TestDynamicProto` | covered | `src/cel/env.spec.ts` |
| `TestDynamicProtoFileDescriptors` | covered | `src/cel/env.spec.ts` |
| `TestGlobalVars` | covered | `src/cel/env.spec.ts` |
| `TestMacroSubset` | covered | `src/cel/env.spec.ts` |
| `TestCustomMacro` | covered | `src/cel/env.spec.ts` |
| `TestMacroInterop` | covered | `src/cel/env.spec.ts` |
| `TestMacroModern` | covered | `src/cel/env.spec.ts` |
| `TestCustomExistsMacro` | covered | `src/cel/env.spec.ts` |
| `TestAstIsChecked` | covered | `src/cel/env.spec.ts` |
| `TestExhaustiveEval` | covered | `src/cel/program.spec.ts` |
| `TestContextEval` | covered | `src/cel/env.spec.ts` |
| `TestContextEvalUnknowns` | covered | `src/cel/program.spec.ts` |
| `TestEvalRecover` | covered | `src/cel/program.spec.ts` |
| `TestResidualAst` | covered | `src/cel/program.spec.ts` |
| `TestResidualAstComplex` | covered | `src/cel/program.spec.ts` |
| `TestResidualAstMacros` | covered | `src/cel/program.spec.ts` |
| `TestResidualAstNil` | covered | `src/cel/program.spec.ts` |
| `TestEnvExtension` | covered | `src/cel/env.spec.ts` |
| `TestEnvExtensionIsolation` | covered | `src/cel/env.spec.ts` |
| `TestVariadicLogicalOperators` | covered | `src/cel/env.spec.ts` |
| `TestParseError` | covered | `src/cel/env.spec.ts` |
| `TestParseWithMacroTracking` | covered | `src/cel/env.spec.ts` |
| `TestParseAndCheckConcurrently` | covered | `src/cel/env.spec.ts` |
| `TestCustomInterpreterDecorator` | covered | `src/cel/env.spec.ts` |
| `TestCustomInterpreterDecoratorV2` | covered | `src/cel/env.spec.ts` |
| `TestEstimateCostAndRuntimeCost` | covered | `src/cel/env.spec.ts` |
| `TestCostLimit` | covered | `src/cel/env.spec.ts` |
| `TestCostTrackingConsistentAcrossEvals` | covered | `src/cel/env.spec.ts` |
| `TestPartialVars` | covered | `src/cel/program.spec.ts` |
| `TestResidualAstAttributeQualifiers` | covered | `src/cel/program.spec.ts` |
| `TestPartialVarsEnv` | covered | `src/cel/program.spec.ts` |
| `TestPartialVarsExtendedEnv` | covered | `src/cel/program.spec.ts` |
| `TestResidualAstModified` | covered | `src/cel/program.spec.ts` |
| `TestContextProto` | covered | `src/cel/env.spec.ts` |
| `TestContextProtoJSONFieldNames` | covered | `src/cel/env.spec.ts` |
| `TestRegexOptimizer` | covered | `src/cel/env.spec.ts` |
| `TestDefaultUTCTimeZoneDisabled` | covered | `src/cel/env.spec.ts` |
| `TestDefaultUTCTimeZoneExtension` | covered | `src/cel/env.spec.ts` |
| `TestDefaultUTCTimeZoneError` | covered | `src/cel/env.spec.ts` |
| `TestParserRecursionLimit` | covered | `src/cel/env.spec.ts` |
| `TestQuotedFields` | covered | `src/cel/env.spec.ts` |
| `TestDynamicDispatch` | covered | `src/cel/env.spec.ts` |
| `TestOptionalValuesCompile` | covered | `src/cel/env.spec.ts` |
| `TestOptionalValuesEval` | covered | `src/cel/env.spec.ts` |
| `TestOptionalValuesEvalUnknowns` | covered | `src/cel/env.spec.ts` |
| `TestOptionalValuesEvalErrorCases` | covered | `src/cel/env.spec.ts` |
| `TestEnableErrorOnBadPresenceTest` | covered | `src/cel/env.spec.ts` |
| `TestOptionalMacroError` | covered | `src/cel/env.spec.ts` |
| `TestParserExpressionSizeLimit` | covered | `src/cel/env.spec.ts` |
| `TestAstProgramNilValue` | covered | `src/cel/env.spec.ts` |
| `TestJSONFieldNames` | covered | `src/cel/env.spec.ts` |
| `TestJSONFieldNamesInvalidProvider` | covered | `src/cel/env.spec.ts` |
| `TestExpressionSizeLimitEarlyEnforcement` | covered | `src/cel/env.spec.ts` |
| `TestProgramEvalInvalidInput` | covered | `src/cel/env.spec.ts` |
| `TestProgramContextEvalInvalidInput` | covered | `src/cel/env.spec.ts` |
| `TestOptionalOperatorsLegacyEval` | covered | `src/cel/env.spec.ts` |

### `cel/decls_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestFunctionMerge` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionMergeDuplicate` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionMergeDeclarationAndDefinition` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionMergeCollision` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionNoOverloads` | covered | `src/cel/decls.spec.ts` |
| `TestSingletonUnaryBinding` | covered | `src/cel/decls.spec.ts` |
| `TestSingletonUnaryBindingParameterized` | covered | `src/cel/decls.spec.ts` |
| `TestSingletonBinaryBinding` | covered | `src/cel/decls.spec.ts` |
| `TestSingletonFunctionBinding` | covered | `src/cel/decls.spec.ts` |
| `TestUnaryBinding` | covered | `src/cel/decls.spec.ts` |
| `TestBinaryBinding` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionBinding` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionDisableDeclaration` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionDisableDeclarationMerge` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionDisableDeclarationMergeReenable` | covered | `src/cel/decls.spec.ts` |
| `TestExprDeclToDeclaration` | covered | `src/cel/decls.spec.ts` |
| `TestExprDeclToDeclarationInvalid` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionDeclExcludeOverloads` | covered | `src/cel/decls.spec.ts` |
| `TestFunctionDeclIncludeOverloads` | covered | `src/cel/decls.spec.ts` |

### `cel/env_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestAstNil` | covered | `src/cel/env.spec.ts` |
| `TestIssuesNil` | covered | `src/cel/env.spec.ts` |
| `TestIssuesEmpty` | covered | `src/cel/env.spec.ts` |
| `TestErrorAsIssues` | covered | `src/cel/env.spec.ts` |
| `TestIssuesAppendSelf` | covered | `src/cel/env.spec.ts` |
| `TestIssues` | covered | `src/cel/env.spec.ts` |
| `TestFormatCELTypeEquivalence` | covered | `src/cel/env.spec.ts` |
| `TestEnvCheckExtendRace` | covered | `src/cel/env.spec.ts` |
| `TestEnvPartialVarsError` | covered | `src/cel/env.spec.ts` |
| `TestTypeProviderInterop` | covered | `src/cel/env.spec.ts` |
| `TestLibraries` | covered | `src/cel/env.spec.ts` |
| `TestFunctions` | covered | `src/cel/env.spec.ts` |
| `TestEnvToConfig` | covered | `src/cel/env.spec.ts` |
| `TestEnvFromConfig` | covered | `src/cel/env.spec.ts` |
| `TestEnvFromConfigErrors` | covered | `src/cel/env.spec.ts` |
| `TestEnvVariableValidation` | covered | `src/cel/env.spec.ts` |
| `TestCELTypeAdapter` | covered | `src/cel/env.spec.ts` |
| `TestMaybeInteropProvider_Error` | covered | `src/cel/env.spec.ts` |
| `TestMaybeInteropProvider_LegacyTypeProvider` | covered | `src/cel/env.spec.ts` |
| `TestParserErrorRecoveryLimit` | covered | `src/cel/env.spec.ts` |
| `TestEnableHiddenAccumulatorName` | covered | `src/cel/env.spec.ts` |
| `TestDeclareContextProto_Duplicate` | covered | `src/cel/env.spec.ts` |

### `cel/fieldpaths_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestFieldPathsForTestAllTypes` | covered | `src/cel/field-paths.spec.ts` |

### `cel/folding_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestConstantFoldingOptimizer` | covered | `src/cel/folding.spec.ts` |
| `TestConstantFoldingCallsWithSideEffects` | covered | `src/cel/folding.spec.ts` |
| `TestConstantFoldingOptimizerMacroElimination` | covered | `src/cel/folding.spec.ts` |
| `TestConstantFoldingOptimizerWithLimit` | covered | `src/cel/folding.spec.ts` |
| `TestConstantFoldingNormalizeIDs` | covered | `src/cel/folding.spec.ts` |

### `cel/inlining_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestInliningOptimizerNoopShadow` | covered | `src/cel/inlining.spec.ts` |
| `TestInliningOptimizerPresenceTests` | covered | `src/cel/inlining.spec.ts` |
| `TestInliningOptimizer` | covered | `src/cel/inlining.spec.ts` |
| `TestInliningOptimizerMultiStage` | covered | `src/cel/inlining.spec.ts` |

### `cel/io_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestRefValueToValueRoundTrip` | covered | `src/cel/io.spec.ts` |
| `TestAstToProto` | covered | `src/cel/io.spec.ts` |
| `TestAstToString` | covered | `src/cel/io.spec.ts` |
| `TestExprToString` | covered | `src/cel/io.spec.ts` |
| `TestRefValToExprValue` | covered | `src/cel/io.spec.ts` |
| `TestAstToStringNil` | covered | `src/cel/io.spec.ts` |
| `TestAstToCheckedExprNil` | covered | `src/cel/io.spec.ts` |
| `TestAstToParsedExprNil` | covered | `src/cel/io.spec.ts` |
| `TestCheckedExprToAstConstantExpr` | covered | `src/cel/io.spec.ts` |
| `TestCheckedExprToAstMissingInfo` | covered | `src/cel/io.spec.ts` |
| `TestRefValueToValue_Error` | covered | `src/cel/io.spec.ts` |
| `TestExprValueAsAlphaProto` | covered | `src/cel/io.spec.ts` |
| `TestRefValToExprValue_Wrappers` | covered | `src/cel/io.spec.ts` |

### `cel/macro_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestGlobalVarArgMacro` | covered | `src/cel/macro.spec.ts` |
| `TestReceiverVarArgMacro` | covered | `src/cel/macro.spec.ts` |
| `TestDocumentation` | covered | `src/cel/macro.spec.ts` |

### `cel/optimizer_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestStaticOptimizerUpdateExpr` | covered | `src/cel/optimizer.spec.ts` |
| `TestStaticOptimizerNewAST` | covered | `src/cel/optimizer.spec.ts` |
| `TestOptimizeWithSource` | covered | `src/cel/optimizer.spec.ts` |
| `TestStaticOptimizerNilAST` | covered | `src/cel/optimizer.spec.ts` |

### `cel/prompt_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestPromptTemplate` | covered | `src/cel/prompt.spec.ts` |
| `TestPromptTemplateFieldPaths` | covered | `src/cel/prompt.spec.ts` |
| `TestRenderSanitizesTemplateDirectives` | covered | `src/cel/prompt.spec.ts` |

### `cel/validator_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestValidateDurationLiterals` | covered | `src/cel/validator.spec.ts` |
| `TestValidateTimestampLiterals` | covered | `src/cel/validator.spec.ts` |
| `TestValidateRegexLiterals` | covered | `src/cel/validator.spec.ts` |
| `TestValidateHomogeneousAggregateLiterals` | covered | `src/cel/validator.spec.ts` |
| `TestValidateComprehensionNestingLimit` | covered | `src/cel/validator.spec.ts` |
| `TestExtendedValidations` | covered | `src/cel/validator.spec.ts` |
| `TestValidatorConfig` | covered | `src/cel/validator.spec.ts` |

### `checker/checker_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestCheck` | covered | `src/checker/checker.spec.ts` |
| `TestAddDuplicateDeclarations` | covered | `src/checker/checker.spec.ts` |
| `TestAddEquivalentDeclarations` | covered | `src/checker/checker.spec.ts` |
| `TestCheckErrorData` | covered | `src/checker/checker.spec.ts` |
| `TestCheckInvalidOptSelectMember` | covered | `src/checker/checker.spec.ts` |
| `TestCheckInvalidOptSelectMissingArg` | covered | `src/checker/checker.spec.ts` |
| `TestCheckInvalidLiteral` | covered | `src/checker/checker.spec.ts` |

### `checker/cost_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestCost` | covered | `src/checker/cost.spec.ts` |

### `checker/env_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestOverlappingMacro` | covered | `src/checker/env.spec.ts` |
| `TestCopyDeclarations` | covered | `src/checker/env.spec.ts` |

### `checker/format_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestFormatType` | covered | `src/checker/format.spec.ts` |
| `TestFormatFunctionType` | covered | `src/checker/format.spec.ts` |

### `common/ast/ast_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestASTCopy` | covered | `src/common/ast/ast.spec.ts` |
| `TestASTJsonNames` | covered | `src/common/ast/ast.spec.ts` |
| `TestASTNilSafety` | covered | `src/common/ast/ast.spec.ts` |
| `TestSourceInfo` | covered | `src/common/ast/ast.spec.ts` |
| `TestSourceInfoNilSafety` | covered | `src/common/ast/ast.spec.ts` |
| `TestReferenceInfoEquals` | covered | `src/common/ast/ast.spec.ts` |
| `TestReferenceInfoAddOverload` | covered | `src/common/ast/ast.spec.ts` |
| `TestNewSourceInfoRelative` | covered | `src/common/ast/ast.spec.ts` |
| `TestMaxID` | covered | `src/common/ast/ast.spec.ts` |
| `TestHeights` | covered | `src/common/ast/ast.spec.ts` |
| `TestHasExtension` | covered | `src/common/ast/ast.spec.ts` |
| `TestSourceInfoRenumberIDs` | covered | `src/common/ast/ast.spec.ts` |

### `common/ast/conversion_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestConvertAST` | covered | `src/common/ast/conversion.spec.ts` |
| `TestConvertProtoToEntryExpr` | covered | `src/common/ast/conversion.spec.ts` |
| `TestConvertExpr` | covered | `src/common/ast/conversion.spec.ts` |
| `TestSourceInfoToProto` | covered | `src/common/ast/conversion.spec.ts` |
| `TestReferenceInfoToProtoError` | covered | `src/common/ast/conversion.spec.ts` |
| `TestProtoToReferenceInfoError` | covered | `src/common/ast/conversion.spec.ts` |
| `TestConvertVal` | covered | `src/common/ast/conversion.spec.ts` |
| `TestValToConstantError` | covered | `src/common/ast/conversion.spec.ts` |
| `TestConstantToValError` | covered | `src/common/ast/conversion.spec.ts` |

### `common/ast/expr_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestSetKindCase` | covered | `src/common/ast/expr.spec.ts` |
| `TestCall` | covered | `src/common/ast/expr.spec.ts` |
| `TestMemberCall` | covered | `src/common/ast/expr.spec.ts` |
| `TestCallNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestComprehension` | covered | `src/common/ast/expr.spec.ts` |
| `TestComprehensionNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestIdent` | covered | `src/common/ast/expr.spec.ts` |
| `TestIdentNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestList` | covered | `src/common/ast/expr.spec.ts` |
| `TestListNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestLiteralNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestMap` | covered | `src/common/ast/expr.spec.ts` |
| `TestMapNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestMapEntryNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestSelect` | covered | `src/common/ast/expr.spec.ts` |
| `TestSelectNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestStruct` | covered | `src/common/ast/expr.spec.ts` |
| `TestStructNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestStructFieldNil` | covered | `src/common/ast/expr.spec.ts` |
| `TestRenumberIDs` | covered | `src/common/ast/expr.spec.ts` |

### `common/ast/navigable_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestNavigateAST` | covered | `src/common/ast/navigable.spec.ts` |
| `TestExprVisitor` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableASTNilSafety` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableExpr` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableCallExprMember` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableCallExprGlobal` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableListExpr` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableMapExpr` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableStructExpr` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableComprehensionExpr` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableSelectExpr` | covered | `src/common/ast/navigable.spec.ts` |
| `TestNavigableSelectExpr_TestOnly` | covered | `src/common/ast/navigable.spec.ts` |

### `common/containers/container_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestContainers_ResolveCandidateNames` | covered | `src/common/containers.spec.ts` |
| `TestContainers_ResolveCandidateNames_FullyQualifiedName` | covered | `src/common/containers.spec.ts` |
| `TestContainers_ResolveCandidateNames_EmptyContainer` | covered | `src/common/containers.spec.ts` |
| `TestContainers_Alias` | covered | `src/common/containers.spec.ts` |
| `TestContainers_Abbrevs` | covered | `src/common/containers.spec.ts` |
| `TestContainers_Aliasing_Errors` | covered | `src/common/containers.spec.ts` |
| `TestContainers_Extend_Alias` | covered | `src/common/containers.spec.ts` |
| `TestContainers_Extend_Name` | covered | `src/common/containers.spec.ts` |
| `TestContainers_ToQualifiedName` | covered | `src/common/containers.spec.ts` |

### `common/decls/decls_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestFunctionBindings` | covered | `src/common/decls.spec.ts` |
| `TestFunctionVariableArgBindings` | covered | `src/common/decls.spec.ts` |
| `TestFunctionZeroArityBinding` | covered | `src/common/decls.spec.ts` |
| `TestFunctionSingletonBinding` | covered | `src/common/decls.spec.ts` |
| `TestVariableDocumentation` | covered | `src/common/decls.spec.ts` |
| `TestFunctionDocumentation` | covered | `src/common/decls.spec.ts` |
| `TestFunctionMerge` | covered | `src/common/decls.spec.ts` |
| `TestFunctionMergeWrongName` | covered | `src/common/decls.spec.ts` |
| `TestFunctionMergeOverloadCollision` | covered | `src/common/decls.spec.ts` |
| `TestFunctionMergeOverloadArgCountRedefinition` | covered | `src/common/decls.spec.ts` |
| `TestFunctionMergeOverloadArgTypeRedefinition` | covered | `src/common/decls.spec.ts` |
| `TestFunctionMergeSingletonRedefinition` | covered | `src/common/decls.spec.ts` |
| `TestFunctionAddDuplicateOverloads` | covered | `src/common/decls.spec.ts` |
| `TestFunctionAddDuplicateOverloadsPreservesBinding` | covered | `src/common/decls.spec.ts` |
| `TestFunctionAddCollidingOverloads` | covered | `src/common/decls.spec.ts` |
| `TestFunctionNoOverloads` | covered | `src/common/decls.spec.ts` |
| `TestSingletonOverloadCollision` | covered | `src/common/decls.spec.ts` |
| `TestSingletonOverloadLateBindingCollision` | covered | `src/common/decls.spec.ts` |
| `TestSingletonUnaryBindingRedefinition` | covered | `src/common/decls.spec.ts` |
| `TestSingletonBinaryBindingRedefinition` | covered | `src/common/decls.spec.ts` |
| `TestSingletonFunctionBindingRedefinition` | covered | `src/common/decls.spec.ts` |
| `TestOverloadUnaryBindingRedefinition` | covered | `src/common/decls.spec.ts` |
| `TestOverloadUnaryBindingArgCountMismatch` | covered | `src/common/decls.spec.ts` |
| `TestOverloadBinaryBindingArgCountMismatch` | covered | `src/common/decls.spec.ts` |
| `TestOverloadBinaryBindingRedefinition` | covered | `src/common/decls.spec.ts` |
| `TestOverloadFunctionBindingRedefinition` | covered | `src/common/decls.spec.ts` |
| `TestOverloadFunctionLateBinding` | covered | `src/common/decls.spec.ts` |
| `TestOverloadFunctionMixLateAndNonLateBinding` | covered | `src/common/decls.spec.ts` |
| `TestOverloadFunctionBindingWithLateBinding` | covered | `src/common/decls.spec.ts` |
| `TestOverloadFunctionLateBindingWithBinding` | covered | `src/common/decls.spec.ts` |
| `TestOverloadIsNonStrict` | covered | `src/common/decls.spec.ts` |
| `TestOverloadOperandTrait` | covered | `src/common/decls.spec.ts` |
| `TestFunctionGetTypeParams` | covered | `src/common/decls.spec.ts` |
| `TestFunctionDisableDeclaration` | covered | `src/common/decls.spec.ts` |
| `TestFunctionEnableDeclaration` | covered | `src/common/decls.spec.ts` |
| `TestFunctionDeclToExprDecl` | covered | `src/common/decls.spec.ts` |
| `TestNewVariable` | covered | `src/common/decls.spec.ts` |
| `TestNewConstant` | covered | `src/common/decls.spec.ts` |
| `TestTypeVariable` | covered | `src/common/decls.spec.ts` |
| `TestVariableDeclToExprDecl` | covered | `src/common/decls.spec.ts` |
| `TestVariableDeclToExprDeclInvalid` | covered | `src/common/decls.spec.ts` |
| `TestNilFunction` | todo | `src/common/decls.spec.ts` |
| `TestNilVariable` | todo | `src/common/decls.spec.ts` |

### `common/doc_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestParseDescription` | covered | `src/common/doc.spec.ts` |
| `TestParseDescriptions` | covered | `src/common/doc.spec.ts` |
| `TestNewDoc` | covered | `src/common/doc.spec.ts` |

### `common/env/env_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestConfig` | covered | `src/common/env/env.spec.ts` |
| `TestConfigValidateErrors` | covered | `src/common/env/env.spec.ts` |
| `TestConfigAddVariableDecls` | covered | `src/common/env/env.spec.ts` |
| `TestConfigAddVariableDeclsEmpty` | covered | `src/common/env/env.spec.ts` |
| `TestConfigAddFunctionDecls` | covered | `src/common/env/env.spec.ts` |
| `TestNewImport` | covered | `src/common/env/env.spec.ts` |
| `TestImportValidate` | covered | `src/common/env/env.spec.ts` |
| `TestNewContextVariable` | covered | `src/common/env/env.spec.ts` |
| `TestContextVariableValidate` | covered | `src/common/env/env.spec.ts` |
| `TestVariableGetType` | covered | `src/common/env/env.spec.ts` |
| `TestVariableAsCELVariable` | covered | `src/common/env/env.spec.ts` |
| `TestTypeDescString` | covered | `src/common/env/env.spec.ts` |
| `TestFunctionAsCELFunction` | covered | `src/common/env/env.spec.ts` |
| `TestTypeDescAsCELTypeErrors` | covered | `src/common/env/env.spec.ts` |
| `TestLibrarySubsetValidate` | covered | `src/common/env/env.spec.ts` |
| `TestSubsetFunction` | covered | `src/common/env/env.spec.ts` |
| `TestSubsetMacro` | covered | `src/common/env/env.spec.ts` |
| `TestNewExtension` | covered | `src/common/env/env.spec.ts` |
| `TestExtensionGetVersion` | covered | `src/common/env/env.spec.ts` |
| `TestValidatorValidate` | covered | `src/common/env/env.spec.ts` |
| `TestValidatorConfigValue` | covered | `src/common/env/env.spec.ts` |
| `TestFeatureValidate` | covered | `src/common/env/env.spec.ts` |

### `common/env/io_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestParseTypeDesc` | covered | `src/common/env/io.spec.ts` |
| `TestParseTypeDescErrors` | covered | `src/common/env/io.spec.ts` |
| `TestConfigToYAML` | covered | `src/common/env/io.spec.ts` |
| `TestYAMLRoundTrip` | covered | `src/common/env/io.spec.ts` |

### `common/errors_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestErrors` | covered | `src/common/errors.spec.ts` |
| `TestErrorsReportingLimit` | covered | `src/common/errors.spec.ts` |
| `TestErrorsAppendReportingLimit` | covered | `src/common/errors.spec.ts` |
| `TestErrors_WideAndNarrowCharacters` | covered | `src/common/errors.spec.ts` |
| `TestErrors_WideAndNarrowCharactersWithEmojis` | covered | `src/common/errors.spec.ts` |

### `common/runes/buffer_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestNewBuffer_ASCII` | covered | `src/common/runes/buffer.spec.ts` |
| `TestNewBuffer_Basic` | covered | `src/common/runes/buffer.spec.ts` |
| `TestNewBuffer_Supplemental` | covered | `src/common/runes/buffer.spec.ts` |
| `TestNewBuffer_All` | covered | `src/common/runes/buffer.spec.ts` |
| `TestNewBuffer_Empty` | covered | `src/common/runes/buffer.spec.ts` |
| `TestNewBufferAndLineOffsetsWithLimit_Exceeded` | covered | `src/common/runes/buffer.spec.ts` |
| `TestNewBufferAndLineOffsetsWithLimit_MultibyteWithinLimit` | covered | `src/common/runes/buffer.spec.ts` |

### `common/source_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestStringSource_Description` | covered | `src/common/source.spec.ts` |
| `TestStringSource_LocationOffset` | covered | `src/common/source.spec.ts` |
| `TestStringSource_SnippetMultiline` | covered | `src/common/source.spec.ts` |
| `TestStringSource_SnippetSingleline` | covered | `src/common/source.spec.ts` |
| `TestNewInfoSource_NoPanicOnNil` | covered | `src/common/source.spec.ts` |
| `TestNewTextSourceWithLimit_Exceeded` | covered | `src/common/source.spec.ts` |
| `TestNewTextSourceWithLimit_MultibyteWithinLimit` | covered | `src/common/source.spec.ts` |

### `common/types/bool_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestBoolCompare` | covered | `src/common/types/bool.spec.ts` |
| `TestBoolConvertToNative_Any` | covered | `src/common/types/bool.spec.ts` |
| `TestBoolConvertToNative_Bool` | covered | `src/common/types/bool.spec.ts` |
| `TestBoolConvertToNative_Error` | covered | `src/common/types/bool.spec.ts` |
| `TestBoolConvertToNative_Json` | covered | `src/common/types/bool.spec.ts` |
| `TestBoolConvertToNative_Ptr` | todo | `src/common/types/bool.spec.ts` |
| `TestBoolConvertToNative_Wrapper` | covered | `src/common/types/bool.spec.ts` |
| `TestBoolConvertToType` | covered | `src/common/types/bool.spec.ts` |
| `TestBoolEqual` | covered | `src/common/types/bool.spec.ts` |
| `TestBoolIsZeroValue` | covered | `src/common/types/bool.spec.ts` |
| `TestBoolNegate` | covered | `src/common/types/bool.spec.ts` |
| `TestIsBool` | covered | `src/common/types/bool.spec.ts` |

### `common/types/bytes_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestBytesAdd` | covered | `src/common/types/bytes.spec.ts` |
| `TestBytesCompare` | covered | `src/common/types/bytes.spec.ts` |
| `TestBytesConvertToNative_Any` | covered | `src/common/types/bytes.spec.ts` |
| `TestBytesConvertToNative_ByteSlice` | covered | `src/common/types/bytes.spec.ts` |
| `TestBytesConvertToNative_ByteArray` | todo | `src/common/types/bytes.spec.ts` |
| `TestBytesConvertToNative_ByteArrayError` | todo | `src/common/types/bytes.spec.ts` |
| `TestBytesConvertToNative_Error` | covered | `src/common/types/bytes.spec.ts` |
| `TestBytesConvertToNative_Json` | covered | `src/common/types/bytes.spec.ts` |
| `TestBytesConvertToNative_Wrapper` | covered | `src/common/types/bytes.spec.ts` |
| `TestBytesConvertToType` | covered | `src/common/types/bytes.spec.ts` |
| `TestBytesIsZeroValue` | covered | `src/common/types/bytes.spec.ts` |
| `TestBytesSize` | covered | `src/common/types/bytes.spec.ts` |

### `common/types/double_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestDoubleAdd` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleCompare` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleConvertToNative_Any` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleConvertToNative_Error` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleConvertToNative_Float32` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleConvertToNative_Float64` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleConvertToNative_Json` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleConvertToNative_Ptr_Float32` | todo | `src/common/types/double.spec.ts` |
| `TestDoubleConvertToNative_Ptr_Float64` | todo | `src/common/types/double.spec.ts` |
| `TestDoubleConvertToNative_Wrapper` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleConvertToType` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleDivide` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleEqual` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleIsZeroValue` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleMultiply` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleNegate` | covered | `src/common/types/double.spec.ts` |
| `TestDoubleSubtract` | covered | `src/common/types/double.spec.ts` |

### `common/types/duration_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestDurationOperators` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationCompare` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationConvertToNative` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationConvertToNative_Any` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationConvertToNative_Error` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationConvertToNative_Json` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationConvertToType_Identity` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationNegate` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationGetHours` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationGetMinutes` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationGetSeconds` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationGetMilliseconds` | covered | `src/common/types/duration.spec.ts` |
| `TestDurationIsZeroValue` | covered | `src/common/types/duration.spec.ts` |

### `common/types/int_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestIntAdd` | covered | `src/common/types/int.spec.ts` |
| `TestIntCompare` | covered | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Any` | covered | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Error` | covered | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Int8` | covered | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Int16` | covered | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Int32` | covered | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Int64` | covered | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Json` | covered | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Ptr_Int32` | todo | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Ptr_Int64` | todo | `src/common/types/int.spec.ts` |
| `TestIntConvertToNative_Wrapper` | covered | `src/common/types/int.spec.ts` |
| `TestIntConvertToType` | covered | `src/common/types/int.spec.ts` |
| `TestIntDivide` | covered | `src/common/types/int.spec.ts` |
| `TestIntEqual` | covered | `src/common/types/int.spec.ts` |
| `TestIntIsZeroValue` | covered | `src/common/types/int.spec.ts` |
| `TestIntModulo` | covered | `src/common/types/int.spec.ts` |
| `TestIntMultiply` | covered | `src/common/types/int.spec.ts` |
| `TestIntNegate` | covered | `src/common/types/int.spec.ts` |
| `TestIntSubtract` | covered | `src/common/types/int.spec.ts` |

### `common/types/json_list_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestJsonListValueAdd` | covered | `src/common/types/json-list.spec.ts` |
| `TestJsonListValueContains_SingleElemType` | covered | `src/common/types/json-list.spec.ts` |
| `TestJsonListValueContains_MixedElemType` | covered | `src/common/types/json-list.spec.ts` |
| `TestJsonListValueConvertToNative_Json` | covered | `src/common/types/json-list.spec.ts` |
| `TestJsonListValueConvertToNative_Slice` | covered | `src/common/types/json-list.spec.ts` |
| `TestJsonListValueConvertToNative_Any` | covered | `src/common/types/json-list.spec.ts` |
| `TestJsonListValueConvertToType` | covered | `src/common/types/json-list.spec.ts` |
| `TestJsonListValueEqual` | covered | `src/common/types/json-list.spec.ts` |
| `TestJsonListValueGet_OutOfRange` | covered | `src/common/types/json-list.spec.ts` |
| `TestJsonListValueIterator` | todo | `src/common/types/json-list.spec.ts` |

### `common/types/json_struct_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestJsonStructContains` | covered | `src/common/types/json-struct.spec.ts` |
| `TestJsonStructConvertToNative_Json` | covered | `src/common/types/json-struct.spec.ts` |
| `TestJsonStructConvertToNative_Any` | covered | `src/common/types/json-struct.spec.ts` |
| `TestJsonStructConvertToNative_Map` | covered | `src/common/types/json-struct.spec.ts` |
| `TestJsonStructConvertToType` | covered | `src/common/types/json-struct.spec.ts` |
| `TestJsonStructEqual` | covered | `src/common/types/json-struct.spec.ts` |
| `TestJsonStructGet` | covered | `src/common/types/json-struct.spec.ts` |

### `common/types/list_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestBaseListAdd_Empty` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListAdd_Error` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListContains` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListConvertToNative` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListConvertToNative_Any` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListConvertToNative_Json` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListConvertToType` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListEqual` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListGet` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListString` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListString` | covered | `src/common/types/list.spec.ts` |
| `TestListIsZeroValue` | covered | `src/common/types/list.spec.ts` |
| `TestValueListGet` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListIterator` | covered | `src/common/types/list.spec.ts` |
| `TestValueListValue_Iterator` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListNestedList` | covered | `src/common/types/list.spec.ts` |
| `TestBaseListSize` | covered | `src/common/types/list.spec.ts` |
| `TestMutableListGet` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListAdd` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListConvertToNative_Json` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListConvertToNativeListInterface` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListConvertToType` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListContains` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListContainsNonBool` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListEqual` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListGet` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListIterator` | todo | `src/common/types/list.spec.ts` |
| `TestStringListAdd_Empty` | covered | `src/common/types/list.spec.ts` |
| `TestStringListAdd_Error` | covered | `src/common/types/list.spec.ts` |
| `TestStringListAdd_Heterogenous` | covered | `src/common/types/list.spec.ts` |
| `TestStringListAdd_StringLists` | covered | `src/common/types/list.spec.ts` |
| `TestStringListConvertToNative` | covered | `src/common/types/list.spec.ts` |
| `TestStringListConvertToNative_ListInterface` | covered | `src/common/types/list.spec.ts` |
| `TestStringListConvertToNative_Error` | covered | `src/common/types/list.spec.ts` |
| `TestStringListConvertToNative_Json` | covered | `src/common/types/list.spec.ts` |
| `TestStringListGet_OutOfRange` | covered | `src/common/types/list.spec.ts` |
| `TestValueListAdd` | covered | `src/common/types/list.spec.ts` |
| `TestValueListConvertToNative_Json` | covered | `src/common/types/list.spec.ts` |
| `TestMutableList` | covered | `src/common/types/list.spec.ts` |
| `TestListFold` | covered | `src/common/types/list.spec.ts` |
| `TestConcatListSizeCached` | covered | `src/common/types/list.spec.ts` |

### `common/types/map_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestMapContains` | covered | `src/common/types/map.spec.ts` |
| `TestStringMapContains` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToNative_Any` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToNative_Error` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToNative_Json` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToNative_Struct` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToNative_StructPtr` | todo | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToNative_StructPtrPtr` | todo | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToNative_Struct_InvalidFieldError` | todo | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToNative_Struct_EmptyFieldError` | todo | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToNative_Struct_PrivateFieldError` | todo | `src/common/types/map.spec.ts` |
| `TestStringMapConvertToNative` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapConvertToType` | covered | `src/common/types/map.spec.ts` |
| `TestStringMapConvertToType` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapEqual_True` | covered | `src/common/types/map.spec.ts` |
| `TestStringMapEqual_True` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapEqual_NotTrue` | covered | `src/common/types/map.spec.ts` |
| `TestStringMapEqual_NotTrue` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapGet` | covered | `src/common/types/map.spec.ts` |
| `TestStringIfaceMapGet` | covered | `src/common/types/map.spec.ts` |
| `TestStringMapGet` | covered | `src/common/types/map.spec.ts` |
| `TestRefValMapGet` | covered | `src/common/types/map.spec.ts` |
| `TestMapIsZeroValue` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapIterator` | todo | `src/common/types/map.spec.ts` |
| `TestStringMapIterator` | covered | `src/common/types/map.spec.ts` |
| `TestDynamicMapSize` | covered | `src/common/types/map.spec.ts` |
| `TestStringMapSize` | covered | `src/common/types/map.spec.ts` |
| `TestProtoMap` | covered | `src/common/types/map.spec.ts` |
| `TestProtoMapGet` | covered | `src/common/types/map.spec.ts` |
| `TestProtoMapString` | covered | `src/common/types/map.spec.ts` |
| `TestProtoMapConvertToNative` | covered | `src/common/types/map.spec.ts` |
| `TestProtoMapConvertToNative_NestedProto` | covered | `src/common/types/map.spec.ts` |
| `TestMutableMap` | covered | `src/common/types/map.spec.ts` |
| `TestMapFold` | covered | `src/common/types/map.spec.ts` |
| `TestInsertMapKeyValue_MutableMapper` | covered | `src/common/types/map.spec.ts` |
| `TestInsertMapKeyValue_Mapper` | covered | `src/common/types/map.spec.ts` |

### `common/types/null_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestNullConvertToNative` | covered | `src/common/types/null.spec.ts` |
| `TestNullConvertToType` | covered | `src/common/types/null.spec.ts` |
| `TestNullEqual` | covered | `src/common/types/null.spec.ts` |
| `TestNullIsZeroValue` | covered | `src/common/types/null.spec.ts` |
| `TestNullType` | covered | `src/common/types/null.spec.ts` |
| `TestNullValue` | covered | `src/common/types/null.spec.ts` |

### `common/types/object_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestNewProtoObject` | covered | `src/common/types/object.spec.ts` |
| `TestProtoObjectConvertToNative` | covered | `src/common/types/object.spec.ts` |
| `TestProtoObjectIsSet` | covered | `src/common/types/object.spec.ts` |
| `TestProtoObjectIsZeroValue` | covered | `src/common/types/object.spec.ts` |
| `TestProtoObjectGet` | covered | `src/common/types/object.spec.ts` |
| `TestProtoObjectConvertToType` | covered | `src/common/types/object.spec.ts` |

### `common/types/optional_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestOptionalOptionalOf` | covered | `src/common/types/optional.spec.ts` |
| `TestOptionalOptionalFormat` | covered | `src/common/types/optional.spec.ts` |
| `TestOptionalGetValue` | covered | `src/common/types/optional.spec.ts` |
| `TestOptionalConvertToNative` | covered | `src/common/types/optional.spec.ts` |
| `TestOptionalConvertToType` | covered | `src/common/types/optional.spec.ts` |
| `TestOptionalEqual` | covered | `src/common/types/optional.spec.ts` |
| `TestOptionalType` | covered | `src/common/types/optional.spec.ts` |
| `TestOptionalValue` | covered | `src/common/types/optional.spec.ts` |

### `common/types/pb/equal_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestEqual` | covered | `src/common/types/pb/equal.spec.ts` |

### `common/types/pb/file_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestFileDescriptionGetExtensions` | todo | `src/common/types/pb/file.spec.ts` |
| `TestFileDescriptionJSONFieldNames` | covered | `src/common/types/pb/file.spec.ts` |
| `TestFileDescriptionGetTypes` | todo | `src/common/types/pb/file.spec.ts` |
| `TestFileDescriptionGetEnumNames` | covered | `src/common/types/pb/file.spec.ts` |
| `TestFileDescriptionGetImportedEnumNames` | covered | `src/common/types/pb/file.spec.ts` |

### `common/types/pb/pb_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestDbJSONFieldNames` | covered | `src/common/types/pb/pb.spec.ts` |
| `TestDbCopy` | covered | `src/common/types/pb/pb.spec.ts` |
| `TestProtoReflectRoundTrip` | covered | `src/common/types/pb/pb.spec.ts` |
| `TestMerge` | covered | `src/common/types/pb/pb.spec.ts` |
| `TestMergeError` | covered | `src/common/types/pb/pb.spec.ts` |

### `common/types/pb/type_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestTypeDescription` | covered | `src/common/types/pb/type.spec.ts` |
| `TestTypeDescriptionJSONFieldNames` | covered | `src/common/types/pb/type.spec.ts` |
| `TestTypeDescriptionGroupFields` | covered | `src/common/types/pb/type.spec.ts` |
| `TestTypeDescriptionFieldMap` | covered | `src/common/types/pb/type.spec.ts` |
| `TestTypeDescriptionJSONFieldMap` | covered | `src/common/types/pb/type.spec.ts` |
| `TestFieldDescription` | covered | `src/common/types/pb/type.spec.ts` |
| `TestFieldDescriptionGetFrom` | covered | `src/common/types/pb/type.spec.ts` |
| `TestFieldDescriptionIsSet` | covered | `src/common/types/pb/type.spec.ts` |
| `TestTypeDescriptionMaybeUnwrap` | todo | `src/common/types/pb/type.spec.ts` |
| `TestTypeDescriptionCheckedType` | covered | `src/common/types/pb/type.spec.ts` |

### `common/types/provider_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestRegistryCopy` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryRegisterType` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryRegisterTypeNoConflict` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryRegisterTypeConflict` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryEnumValue` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryFindStructType` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryFindStructFieldNames` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryFindStructFieldType` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryNewValue` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryNewValueErrors` | covered | `src/common/types/provider.spec.ts` |
| `TestRegistryGetters` | covered | `src/common/types/provider.spec.ts` |
| `TestConvertToNative` | covered | `src/common/types/provider.spec.ts` |
| `TestNativeToValue_Any` | covered | `src/common/types/provider.spec.ts` |
| `TestNativeToValue_Json` | covered | `src/common/types/provider.spec.ts` |
| `TestNativeToValue_Wrappers` | covered | `src/common/types/provider.spec.ts` |
| `TestNativeToValue_Primitive` | covered | `src/common/types/provider.spec.ts` |
| `TestUnsupportedConversion` | covered | `src/common/types/provider.spec.ts` |

### `common/types/string_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestStringAdd` | covered | `src/common/types/string.spec.ts` |
| `TestStringCompare` | covered | `src/common/types/string.spec.ts` |
| `TestStringConvertToNative_Any` | covered | `src/common/types/string.spec.ts` |
| `TestStringConvertToNative_Error` | covered | `src/common/types/string.spec.ts` |
| `TestStringConvertToNative_Json` | covered | `src/common/types/string.spec.ts` |
| `TestStringConvertToNative_Ptr` | todo | `src/common/types/string.spec.ts` |
| `TestStringConvertToNative_String` | covered | `src/common/types/string.spec.ts` |
| `TestStringConvertToNative_CustomString` | covered | `src/common/types/string.spec.ts` |
| `TestStringConvertToNative_Wrapper` | covered | `src/common/types/string.spec.ts` |
| `TestStringConvertToType` | covered | `src/common/types/string.spec.ts` |
| `TestStringEqual` | covered | `src/common/types/string.spec.ts` |
| `TestStringIsZeroValue` | covered | `src/common/types/string.spec.ts` |
| `TestStringMatch` | covered | `src/common/types/string.spec.ts` |
| `TestStringContains` | covered | `src/common/types/string.spec.ts` |
| `TestStringEndsWith` | covered | `src/common/types/string.spec.ts` |
| `TestStringStartsWith` | covered | `src/common/types/string.spec.ts` |
| `TestStringSize` | covered | `src/common/types/string.spec.ts` |

### `common/types/timestamp_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestTimestampConvertToType` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampOperators` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampConvertToNative_Any` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampConvertToNative` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampIsZeroValue` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampGetDayOfMonth` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampGetDayOfYear` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampGetFullYear` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampGetMonth` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampGetDayOfWeek` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampGetHours` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampGetMinutes` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampGetSeconds` | covered | `src/common/types/timestamp.spec.ts` |
| `TestTimestampGetMilliseconds` | covered | `src/common/types/timestamp.spec.ts` |

### `common/types/type_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestType_ConvertToType` | covered | `src/common/types/types.spec.ts` |
| `TestType_Type` | covered | `src/common/types/types.spec.ts` |

### `common/types/types_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestTypeString` | todo | `src/common/types/types.spec.ts` |
| `TestTypeIsExactType` | covered | `src/common/types/types.spec.ts` |
| `TestTypeIsEquivalentType` | covered | `src/common/types/types.spec.ts` |
| `TestTypeIsAssignableType` | covered | `src/common/types/types.spec.ts` |
| `TestTypeIsAssignableRuntimeType` | covered | `src/common/types/types.spec.ts` |
| `TestTypeToExprType` | covered | `src/common/types/types.spec.ts` |
| `TestTypeToExprTypeInvalid` | covered | `src/common/types/types.spec.ts` |
| `TestExprTypeToType` | covered | `src/common/types/types.spec.ts` |
| `TestExprTypeToTypeInvalid` | covered | `src/common/types/types.spec.ts` |
| `TestTypeHasTrait` | covered | `src/common/types/types.spec.ts` |
| `TestTypeWithTraits` | covered | `src/common/types/types.spec.ts` |
| `TestTypeConvertToType` | covered | `src/common/types/types.spec.ts` |
| `TestTypeConvertToNative` | covered | `src/common/types/types.spec.ts` |

### `common/types/uint_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestUintAdd` | covered | `src/common/types/uint.spec.ts` |
| `TestUintCompare` | covered | `src/common/types/uint.spec.ts` |
| `TestUintConvertToNative_Any` | covered | `src/common/types/uint.spec.ts` |
| `TestUintConvertToNative_Error` | covered | `src/common/types/uint.spec.ts` |
| `TestUintConvertToNative_Json` | covered | `src/common/types/uint.spec.ts` |
| `TestUintConvertToNative_Uint8` | covered | `src/common/types/uint.spec.ts` |
| `TestUintConvertToNative_Uint16` | covered | `src/common/types/uint.spec.ts` |
| `TestUintConvertToNative_Uint32` | covered | `src/common/types/uint.spec.ts` |
| `TestUintConvertToNative_Ptr_Uint32` | todo | `src/common/types/uint.spec.ts` |
| `TestUintConvertToNative_Ptr_Uint64` | todo | `src/common/types/uint.spec.ts` |
| `TestUintConvertToNative_Wrapper` | covered | `src/common/types/uint.spec.ts` |
| `TestUintConvertToType` | covered | `src/common/types/uint.spec.ts` |
| `TestUintDivide` | covered | `src/common/types/uint.spec.ts` |
| `TestUintEqual` | covered | `src/common/types/uint.spec.ts` |
| `TestUintIsZeroValue` | covered | `src/common/types/uint.spec.ts` |
| `TestUintModulo` | covered | `src/common/types/uint.spec.ts` |
| `TestUintMultiply` | covered | `src/common/types/uint.spec.ts` |
| `TestUintSubtract` | covered | `src/common/types/uint.spec.ts` |

### `common/types/unknown_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestIsUnknown` | covered | `src/common/types/unknown.spec.ts` |
| `TestNewAttribute` | covered | `src/common/types/unknown.spec.ts` |
| `TestAttributeEquals` | covered | `src/common/types/unknown.spec.ts` |
| `TestAttributeString` | covered | `src/common/types/unknown.spec.ts` |
| `TestUnknownContains` | covered | `src/common/types/unknown.spec.ts` |
| `TestUnknownIDs` | covered | `src/common/types/unknown.spec.ts` |
| `TestUnknownString` | covered | `src/common/types/unknown.spec.ts` |
| `TestMaybeMergeUnknowns` | covered | `src/common/types/unknown.spec.ts` |

### `conformance/conformance_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestMain` | missing | `—` |
| `TestConformance` | covered | `src/conformance.spec.ts` |

### `conformance/policy/policy_conformance_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestMain` | missing | `—` |
| `TestConformance` | missing | `—` |

### `examples/example_cel_eval_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `Example_cel_Eval` | missing | `—` |

### `examples/example_cel_member_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `Example_cel_MemberOverload` | missing | `—` |

### `examples/example_cel_overload_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `Example_cel_Overload` | missing | `—` |

### `ext/bindings_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestBindings` | covered | `src/ext/bindings.spec.ts` |
| `TestBindingsNonMatch` | covered | `src/ext/bindings.spec.ts` |
| `TestBindingsInvalidIdent` | covered | `src/ext/bindings.spec.ts` |
| `TestBlockEval` | covered | `src/ext/bindings.spec.ts` |
| `TestBlockEval_BadPlan` | covered | `src/ext/bindings.spec.ts` |
| `TestBlockEval_BadBlock` | covered | `src/ext/bindings.spec.ts` |
| `TestBlockEval_RuntimeErrors` | covered | `src/ext/bindings.spec.ts` |
| `TestDynamicBlockEval` | covered | `src/ext/bindings.spec.ts` |
| `TestConstantBlockEval` | covered | `src/ext/bindings.spec.ts` |

### `ext/comprehensions_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestTwoVarComprehensions` | covered | `src/ext/comprehensions.spec.ts` |
| `TestTwoVarComprehensionsCost` | covered | `src/ext/comprehensions.spec.ts` |
| `TestTwoVarComprehensionsStaticErrors` | covered | `src/ext/comprehensions.spec.ts` |
| `TestTwoVarComprehensionsRuntimeErrors` | covered | `src/ext/comprehensions.spec.ts` |
| `TestTwoVarComprehensionsVersion` | covered | `src/ext/comprehensions.spec.ts` |
| `TestTwoVarComprehensionsUnparse` | covered | `src/ext/comprehensions.spec.ts` |
| `TestTwoVarComprehensionsResidualAST` | covered | `src/ext/comprehensions.spec.ts` |

### `ext/encoders_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestEncoders` | covered | `src/ext/encoders.spec.ts` |
| `TestEncodersVersion` | covered | `src/ext/encoders.spec.ts` |

### `ext/extension_option_factory_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestExtensionOptionFactoryInvalidExtension` | covered | `src/ext/extension-option-factory.spec.ts` |
| `TestExtensionOptionFactoryInvalidExtensionName` | covered | `src/ext/extension-option-factory.spec.ts` |
| `TestExtensionOptionFactoryInvalidExtensionVersion` | covered | `src/ext/extension-option-factory.spec.ts` |
| `TestExtensionOptionFactoryValidBindingsExtension` | covered | `src/ext/extension-option-factory.spec.ts` |
| `TestExtensionOptionFactoryValidBindingsExtensionAlias` | covered | `src/ext/extension-option-factory.spec.ts` |

### `ext/formatting_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestStringFormat` | covered | `src/ext/formatting.spec.ts` |
| `TestStringFormatHeterogeneousLiterals` | covered | `src/ext/formatting.spec.ts` |
| `TestBadLocale` | covered | `src/ext/formatting.spec.ts` |
| `TestLiteralOutput` | covered | `src/ext/formatting.spec.ts` |

### `ext/formatting_v2_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestStringsWithExtensionV2` | covered | `src/ext/formatting-v2.spec.ts` |
| `TestStringFormatV2` | covered | `src/ext/formatting-v2.spec.ts` |
| `TestStringFormatHeterogeneousLiteralsV2` | covered | `src/ext/formatting-v2.spec.ts` |

### `ext/lists_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestLists` | covered | `src/ext/lists.spec.ts` |
| `TestListsRuntimeErrors` | covered | `src/ext/lists.spec.ts` |
| `TestListsVersion` | covered | `src/ext/lists.spec.ts` |
| `TestListsCosts` | covered | `src/ext/lists.spec.ts` |
| `TestGenRangeMaxSize` | covered | `src/ext/lists.spec.ts` |

### `ext/math_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestMath` | covered | `src/ext/math.spec.ts` |
| `TestMathStaticErrors` | covered | `src/ext/math.spec.ts` |
| `TestMathRuntimeErrors` | covered | `src/ext/math.spec.ts` |
| `TestMathNonMatch` | covered | `src/ext/math.spec.ts` |
| `TestMathWithExtension` | covered | `src/ext/math.spec.ts` |
| `TestMathVersions` | covered | `src/ext/math.spec.ts` |

### `ext/native_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestNativeTypes` | covered | `src/ext/native.spec.ts` |
| `TestNativeFindStructFieldNames` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypesStaticErrors` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypesJsonSerialization` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypesRuntimeErrors` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypesErrors` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypesConvertToNative` | covered | `src/ext/native.spec.ts` |
| `TestConvertToTypeErrors` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypesWithOptional` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypesWithCELTypedFields` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypeConvertToType` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypeConvertToNative` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypeHasTrait` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypeValue` | covered | `src/ext/native.spec.ts` |
| `TestNativeStructWithMultipleSameFieldNames` | covered | `src/ext/native.spec.ts` |
| `TestNativeStructEmbedded` | covered | `src/ext/native.spec.ts` |
| `TestNativeNestedStruct` | covered | `src/ext/native.spec.ts` |
| `TestNativeTypesVersion` | covered | `src/ext/native.spec.ts` |
| `TestTypeResolutionRace` | covered | `src/ext/native.spec.ts` |

### `ext/network_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestNetwork_Success` | covered | `src/ext/network.spec.ts` |
| `TestNetwork_RuntimeErrors` | covered | `src/ext/network.spec.ts` |
| `TestNetwork_TypeConversions` | covered | `src/ext/network.spec.ts` |
| `TestNetwork_CompileErrors` | covered | `src/ext/network.spec.ts` |

### `ext/protos_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestProtos` | covered | `src/ext/protos.spec.ts` |
| `TestProtosNonMatch` | covered | `src/ext/protos.spec.ts` |
| `TestProtosParseErrors` | covered | `src/ext/protos.spec.ts` |
| `TestProtosWithExtension` | covered | `src/ext/protos.spec.ts` |
| `TestProtosVersion` | covered | `src/ext/protos.spec.ts` |

### `ext/regex_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestRegex` | covered | `src/ext/regex.spec.ts` |
| `TestRegexStaticErrors` | covered | `src/ext/regex.spec.ts` |
| `TestRegexRuntimeErrors` | covered | `src/ext/regex.spec.ts` |
| `TestRegexEnvCreationErrors` | covered | `src/ext/regex.spec.ts` |
| `TestRegexVersion` | covered | `src/ext/regex.spec.ts` |
| `TestRegexCosts` | covered | `src/ext/regex.spec.ts` |

### `ext/sets_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestSets` | covered | `src/ext/sets.spec.ts` |
| `TestSetsMembershipRewriter` | covered | `src/ext/sets.spec.ts` |
| `TestSetsVersion` | covered | `src/ext/sets.spec.ts` |

### `ext/strings_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestStrings` | covered | `src/ext/strings.spec.ts` |
| `TestStringsVersions` | covered | `src/ext/strings.spec.ts` |
| `TestStringsWithExtension` | covered | `src/ext/strings.spec.ts` |
| `TestQuoteUnquote` | covered | `src/ext/strings.spec.ts` |
| `TestFunctionsForVersions` | covered | `src/ext/strings.spec.ts` |
| `TestStringCostTracking` | covered | `src/ext/strings.spec.ts` |
| `TestStringCostLimitEnforced` | covered | `src/ext/strings.spec.ts` |

### `interpreter/activation_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestActivation` | covered | `src/interpreter/activation.spec.ts` |
| `TestActivation_Resolve` | covered | `src/interpreter/activation.spec.ts` |
| `TestActivation_ResolveLazy` | covered | `src/interpreter/activation.spec.ts` |
| `TestActivation_ResolveLazyAny` | covered | `src/interpreter/activation.spec.ts` |
| `TestHierarchicalActivation` | covered | `src/interpreter/activation.spec.ts` |
| `TestAsPartialActivation` | covered | `src/interpreter/activation.spec.ts` |

### `interpreter/attribute_patterns_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestAttributePattern_UnknownResolution` | covered | `src/interpreter/attribute-patterns.spec.ts` |
| `TestAttributePattern_CrossReference` | covered | `src/interpreter/attribute-patterns.spec.ts` |

### `interpreter/attributes_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestAttributesAbsoluteAttr` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesAbsoluteAttrType` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesAbsoluteAttrError` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesRelativeAttr` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesRelativeAttrOneOf` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesRelativeAttrConditional` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesRelativeAttrRelativeQualifier` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesOneofAttr` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesConditionalAttrTrueBranch` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesConditionalAttrFalseBranch` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesNarrowMapKeyQualifier` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesOptional` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesConditionalAttrErrorUnknown` | covered | `src/interpreter/attributes.spec.ts` |
| `TestResolverCustomQualifier` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributesMissingMsg` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributeMissingMsgUnknownField` | covered | `src/interpreter/attributes.spec.ts` |
| `TestAttributeStateTracking` | covered | `src/interpreter/attributes.spec.ts` |
| `TestConditionalAttributeQualify` | covered | `src/interpreter/attributes.spec.ts` |
| `TestQualifyIfPresent` | covered | `src/interpreter/attributes.spec.ts` |

### `interpreter/frame_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestFrameCheckInterrupt` | covered | `src/interpreter/frame.spec.ts` |
| `TestFrameResolveName` | covered | `src/interpreter/frame.spec.ts` |
| `TestFrameParent` | covered | `src/interpreter/frame.spec.ts` |
| `TestFrameUnwrap` | covered | `src/interpreter/frame.spec.ts` |
| `TestFrameAsPartialActivation` | covered | `src/interpreter/frame.spec.ts` |
| `TestFramePushPop` | covered | `src/interpreter/frame.spec.ts` |
| `TestFrameClose` | covered | `src/interpreter/frame.spec.ts` |
| `TestFrameLifecycleAndPooling` | covered | `src/interpreter/frame.spec.ts` |
| `TestFrameSetContext` | covered | `src/interpreter/frame.spec.ts` |
| `TestFrameSetContextTwiceError` | covered | `src/interpreter/frame.spec.ts` |
| `TestFrameSetContextChildError` | covered | `src/interpreter/frame.spec.ts` |
| `TestNewExecutionFrameInvalidInput` | covered | `src/interpreter/frame.spec.ts` |
| `TestFramePopBaseFrame` | covered | `src/interpreter/frame.spec.ts` |
| `TestLazyVariableResolution` | covered | `src/interpreter/frame.spec.ts` |

### `interpreter/interpreter_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestInterpreter` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_ProtoAttributeOpt` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_LogicalAndMissingType` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_ExhaustiveConditionalExpr` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_InterruptableEval` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_ExhaustiveLogicalOrEquals` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_SetProto2PrimitiveFields` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_MissingIdentInSelect` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_TypeConversionOpt` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_PlanOptionalElements` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_PlanListComprehensionTwoVar` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpreter_PlanMapComprehensionTwoVar` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterruptErrorIs` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestFolderActivation` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestEvalWatchConstructor` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestCustomDecorator` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestCostTrackerActualCost` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestV2Adapter` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestInterpretableArgs` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestNewCall` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestExhaustiveOperatorsLegacyEval` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestFindFrame` | covered | `src/interpreter/interpreter.spec.ts` |
| `TestObservableInterpretable` | covered | `src/interpreter/interpreter.spec.ts` |

### `interpreter/prune_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestPrune` | covered | `src/interpreter/prune.spec.ts` |

### `interpreter/runtimecost_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestTrackCostAdvanced` | covered | `src/interpreter/runtime-cost.spec.ts` |
| `TestRuntimeCost` | covered | `src/interpreter/runtime-cost.spec.ts` |

### `parser/helper_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestExprHelperCopy` | covered | `src/parser/helper.spec.ts` |

### `parser/macro_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestReceiverVarArgMacro` | covered | `src/parser/macro.spec.ts` |
| `TestDocumentation` | covered | `src/parser/macro.spec.ts` |

### `parser/parser_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestParse` | covered | `src/parser/parser.spec.ts` |
| `TestExpressionSizeCodePointLimit` | covered | `src/parser/parser.spec.ts` |
| `TestParserOptionErrors` | covered | `src/parser/parser.spec.ts` |
| `TestParseErrorData` | covered | `src/parser/parser.spec.ts` |

### `parser/unescape_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestUnescape` | covered | `src/parser/unescape.spec.ts` |

### `parser/unparser_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestUnparse` | covered | `src/parser/unparser.spec.ts` |
| `TestUnparseErrors` | covered | `src/parser/unparser.spec.ts` |

### `policy/compiler_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestCompile` | covered | `src/policy/compiler.spec.ts` |
| `TestRuleComposerError` | covered | `src/policy/compiler.spec.ts` |
| `TestRuleComposerUnnest` | covered | `src/policy/compiler.spec.ts` |
| `TestCompileError` | covered | `src/policy/compiler.spec.ts` |
| `TestCompiledRuleHasOptionalOutput` | covered | `src/policy/compiler.spec.ts` |
| `TestMaxNestedExpressions_Error` | covered | `src/policy/compiler.spec.ts` |
| `TestWhitespaceHanlding` | covered | `src/policy/compiler.spec.ts` |
| `TestWhitespaceHandlingErrorPresentation` | covered | `src/policy/compiler.spec.ts` |

### `policy/composer_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestCompose_SourceInfo` | covered | `src/policy/composer.spec.ts` |
| `TestCompose_Unnest` | covered | `src/policy/composer.spec.ts` |

### `policy/config_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestConfig` | covered | `src/policy/config.spec.ts` |
| `TestConfigErrors` | covered | `src/policy/config.spec.ts` |

### `policy/parser_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestParse` | covered | `src/policy/parser.spec.ts` |
| `TestParseError` | covered | `src/policy/parser.spec.ts` |
| `TestGetExplanationOutputPolicy` | covered | `src/policy/parser.spec.ts` |
| `TestCustomTagVisitor` | covered | `src/policy/parser.spec.ts` |
| `TestSimpleVariables` | covered | `src/policy/parser.spec.ts` |

### `policy/yaml_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestYAMLHelper` | covered | `src/policy/yaml.spec.ts` |

### `repl/commands_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestParse` | missing | `—` |
| `TestParseErrors` | missing | `—` |

### `repl/evaluator_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestEvalSimple` | missing | `—` |
| `TestEvalSingleLetVar` | missing | `—` |
| `TestEvalMultiLet` | missing | `—` |
| `TestEvalError` | missing | `—` |
| `TestLetError` | missing | `—` |
| `TestLetTypeHintError` | missing | `—` |
| `TestDeclareError` | missing | `—` |
| `TestDelError` | missing | `—` |
| `TestAddLetFn` | missing | `—` |
| `TestAddLetFnComposed` | missing | `—` |
| `TestAddLetFnErrorOnTypeChange` | missing | `—` |
| `TestAddLetFnErrorTypeMismatch` | missing | `—` |
| `TestAddLetFnErrorBadExpr` | missing | `—` |
| `TestAddDeclFn` | missing | `—` |
| `TestAddDeclFnError` | missing | `—` |
| `TestDelLetFn` | missing | `—` |
| `TestDelLetFnError` | missing | `—` |
| `TestInstanceFunction` | missing | `—` |
| `TestSetOption` | missing | `—` |
| `TestSetOptionError` | missing | `—` |
| `TestProcess` | missing | `—` |
| `TestProcessOptionError` | missing | `—` |

### `repl/parser/commands_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestAccept` | missing | `—` |
| `TestReject` | missing | `—` |

### `repl/typefmt_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestUnparseType` | missing | `—` |
| `TestParseType` | missing | `—` |
| `TestParseTypeErrors` | missing | `—` |

### `tools/celtest/test_coverage_reporter_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestCoverageStats` | missing | `—` |

### `tools/celtest/test_runner_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestTriggerTestsWithRunnerOptions` | missing | `—` |
| `TestTriggerTests` | missing | `—` |
| `TestCustomTestSuiteParser` | missing | `—` |

### `tools/compiler/compiler_test.go`

| Upstream function | Status | Canonical spec |
| --- | --- | --- |
| `TestEnvironmentFileCompareTextprotoAndYAML` | missing | `—` |
| `TestFileExpressionCustomPolicyParser` | missing | `—` |
| `TestRawExpressionCreateAst` | missing | `—` |


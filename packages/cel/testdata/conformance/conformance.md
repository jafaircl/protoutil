# CEL Conformance Report

Generated from the synchronized fixtures in `testdata/conformance/*.textproto.json`.

## Summary

| Metric | Count |
| --- | ---: |
| Total cases | 2395 |
| Conformant | 2395 |
| Non-conformant | 0 |
| Skipped | 59 |
| Conformance | 100.0% |

## Skipped cases

| Case | Reason |
| --- | --- |
| `enums/strong_proto2/literal_global` | `skipped by cel-go` |
| `enums/strong_proto2/literal_nested` | `skipped by cel-go` |
| `enums/strong_proto2/literal_zero` | `skipped by cel-go` |
| `enums/strong_proto2/comparison_true` | `skipped by cel-go` |
| `enums/strong_proto2/comparison_false` | `skipped by cel-go` |
| `enums/strong_proto2/type_global` | `skipped by cel-go` |
| `enums/strong_proto2/type_nested` | `skipped by cel-go` |
| `enums/strong_proto2/select_default` | `skipped by cel-go` |
| `enums/strong_proto2/field_type` | `skipped by cel-go` |
| `enums/strong_proto2/assign_standalone_name` | `skipped by cel-go` |
| `enums/strong_proto2/assign_standalone_int` | `skipped by cel-go` |
| `enums/strong_proto2/convert_symbol_to_int` | `skipped by cel-go` |
| `enums/strong_proto2/convert_unnamed_to_int` | `skipped by cel-go` |
| `enums/strong_proto2/convert_int_inrange` | `skipped by cel-go` |
| `enums/strong_proto2/convert_int_big` | `skipped by cel-go` |
| `enums/strong_proto2/convert_int_neg` | `skipped by cel-go` |
| `enums/strong_proto2/convert_int_too_big` | `skipped by cel-go` |
| `enums/strong_proto2/convert_int_too_neg` | `skipped by cel-go` |
| `enums/strong_proto2/convert_string` | `skipped by cel-go` |
| `enums/strong_proto2/convert_string_bad` | `skipped by cel-go` |
| `enums/strong_proto3/literal_global` | `skipped by cel-go` |
| `enums/strong_proto3/literal_nested` | `skipped by cel-go` |
| `enums/strong_proto3/literal_zero` | `skipped by cel-go` |
| `enums/strong_proto3/comparison_true` | `skipped by cel-go` |
| `enums/strong_proto3/comparison_false` | `skipped by cel-go` |
| `enums/strong_proto3/type_global` | `skipped by cel-go` |
| `enums/strong_proto3/type_nested` | `skipped by cel-go` |
| `enums/strong_proto3/select_default` | `skipped by cel-go` |
| `enums/strong_proto3/select` | `skipped by cel-go` |
| `enums/strong_proto3/select_big` | `skipped by cel-go` |
| `enums/strong_proto3/select_neg` | `skipped by cel-go` |
| `enums/strong_proto3/field_type` | `skipped by cel-go` |
| `enums/strong_proto3/assign_standalone_name` | `skipped by cel-go` |
| `enums/strong_proto3/assign_standalone_int` | `skipped by cel-go` |
| `enums/strong_proto3/assign_standalone_int_big` | `skipped by cel-go` |
| `enums/strong_proto3/assign_standalone_int_neg` | `skipped by cel-go` |
| `enums/strong_proto3/convert_symbol_to_int` | `skipped by cel-go` |
| `enums/strong_proto3/convert_unnamed_to_int` | `skipped by cel-go` |
| `enums/strong_proto3/convert_unnamed_to_int_select` | `skipped by cel-go` |
| `enums/strong_proto3/convert_int_inrange` | `skipped by cel-go` |
| `enums/strong_proto3/convert_int_big` | `skipped by cel-go` |
| `enums/strong_proto3/convert_int_neg` | `skipped by cel-go` |
| `enums/strong_proto3/convert_int_too_big` | `skipped by cel-go` |
| `enums/strong_proto3/convert_int_too_neg` | `skipped by cel-go` |
| `enums/strong_proto3/convert_string` | `skipped by cel-go` |
| `enums/strong_proto3/convert_string_bad` | `skipped by cel-go` |
| `fields/qualified_identifier_resolution/map_key_float` | `skipped by cel-go` |
| `fields/qualified_identifier_resolution/map_key_null` | `skipped by cel-go` |
| `fields/qualified_identifier_resolution/map_value_repeat_key` | `skipped by cel-go` |
| `fields/qualified_identifier_resolution/map_value_repeat_key_heterogeneous` | `skipped by cel-go` |
| `optionals/optionals/map_optional_select_has` | `skipped by cel-go` |
| `string_ext/value_errors/indexof_out_of_range` | `skipped by cel-go` |
| `string_ext/value_errors/lastindexof_out_of_range` | `skipped by cel-go` |
| `timestamps/duration_converters/get_milliseconds` | `skipped by cel-go` |
| `type_deductions/wrappers/wrapper_promotion_2` | `skipped by cel-go` |
| `type_deductions/legacy_nullable_types/null_assignable_to_message_parameter_candidate` | `skipped by cel-go` |
| `type_deductions/legacy_nullable_types/null_assignable_to_duration_parameter_candidate` | `skipped by cel-go` |
| `type_deductions/legacy_nullable_types/null_assignable_to_timestamp_parameter_candidate` | `skipped by cel-go` |
| `type_deductions/legacy_nullable_types/null_assignable_to_abstract_parameter_candidate` | `skipped by cel-go` |

## Failure categories

| Category | Cases |
| --- | ---: |

## Conformance profiles

| Profile | Conformant | Non-conformant | Total | Conformance |
| --- | ---: | ---: | ---: | ---: |
| Core | 1800 | 0 | 1800 | 100.0% |
| Extension-dependent | 595 | 0 | 595 | 100.0% |

## Suite results

| Suite | Conformant | Non-conformant | Total | Conformance |
| --- | ---: | ---: | ---: | ---: |
| `basic` | 43 | 0 | 43 | 100.0% |
| `bindings_ext` | 8 | 0 | 8 | 100.0% |
| `block_ext` | 37 | 0 | 37 | 100.0% |
| `comparisons` | 406 | 0 | 406 | 100.0% |
| `conversions` | 109 | 0 | 109 | 100.0% |
| `dynamic` | 226 | 0 | 226 | 100.0% |
| `encoders_ext` | 4 | 0 | 4 | 100.0% |
| `enums` | 39 | 0 | 39 | 100.0% |
| `fields` | 56 | 0 | 56 | 100.0% |
| `fp_math` | 30 | 0 | 30 | 100.0% |
| `integer_math` | 64 | 0 | 64 | 100.0% |
| `lists` | 39 | 0 | 39 | 100.0% |
| `logic` | 30 | 0 | 30 | 100.0% |
| `macros` | 44 | 0 | 44 | 100.0% |
| `macros2` | 46 | 0 | 46 | 100.0% |
| `math_ext` | 199 | 0 | 199 | 100.0% |
| `namespace` | 14 | 0 | 14 | 100.0% |
| `network_ext` | 69 | 0 | 69 | 100.0% |
| `optionals` | 69 | 0 | 69 | 100.0% |
| `parse` | 219 | 0 | 219 | 100.0% |
| `plumbing` | 5 | 0 | 5 | 100.0% |
| `proto2` | 118 | 0 | 118 | 100.0% |
| `proto2_ext` | 18 | 0 | 18 | 100.0% |
| `proto3` | 85 | 0 | 85 | 100.0% |
| `string` | 51 | 0 | 51 | 100.0% |
| `string_ext` | 214 | 0 | 214 | 100.0% |
| `timestamps` | 75 | 0 | 75 | 100.0% |
| `type_deductions` | 42 | 0 | 42 | 100.0% |
| `wrappers` | 36 | 0 | 36 | 100.0% |

## Non-conformant cases

| Case | Failure category |
| --- | --- |
| _None_ | — |

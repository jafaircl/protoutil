# CEL Policy Conformance Report

Generated from the synchronized fixtures in `testdata/policy/*.json`.

Pinned cel-policy revision: `c531abcf97d3bd910b8ac9a106eda42ce9d1bec9`.

## Summary

| Metric | Count |
| --- | ---: |
| Fixture suites | 37 |
| Total cases | 77 |
| Conformant | 77 |
| Non-conformant | 0 |
| Conformance | 100.0% |

## Failure categories

| Category | Cases |
| --- | ---: |
| _None_ | 0 |

## Suite results

| Suite | Conformant | Non-conformant | Total | Conformance |
| --- | ---: | ---: | ---: | ---: |
| `aggregate` | 4 | 0 | 4 | 100.0% |
| `aggregate_explicit_list_output` | 1 | 0 | 1 | 100.0% |
| `aggregate_explicit_optional_none` | 1 | 0 | 1 | 100.0% |
| `aggregate_nested_explicit_list_double_wrapping` | 1 | 0 | 1 | 100.0% |
| `aggregate_shadowed_variables` | 1 | 0 | 1 | 100.0% |
| `compile_errors/aggregate_false_condition` | 1 | 0 | 1 | 100.0% |
| `compile_errors/aggregate_heterogeneous_outputs` | 1 | 0 | 1 | 100.0% |
| `compile_errors/aggregate_nested_mixed_semantics` | 1 | 0 | 1 | 100.0% |
| `compile_errors/aggregate_subrule_heterogeneous_outputs` | 1 | 0 | 1 | 100.0% |
| `compile_errors/aggregate_unreachable_in_nested_first_match` | 1 | 0 | 1 | 100.0% |
| `compile_errors/compose_conflicting_output` | 1 | 0 | 1 | 100.0% |
| `compile_errors/compose_conflicting_subrule` | 1 | 0 | 1 | 100.0% |
| `compile_errors/duplicate_variable` | 1 | 0 | 1 | 100.0% |
| `compile_errors/import` | 1 | 0 | 1 | 100.0% |
| `compile_errors/incompatible_outputs` | 1 | 0 | 1 | 100.0% |
| `compile_errors/syntax` | 1 | 0 | 1 | 100.0% |
| `compile_errors/undeclared_reference` | 1 | 0 | 1 | 100.0% |
| `compile_errors/unreachable` | 1 | 0 | 1 | 100.0% |
| `compile_errors/unreachable_under_unconditional_aggregate_subrule` | 1 | 0 | 1 | 100.0% |
| `context_pb` | 2 | 0 | 2 | 100.0% |
| `first_match_nested_aggregate` | 3 | 0 | 3 | 100.0% |
| `k8s` | 1 | 0 | 1 | 100.0% |
| `limits` | 4 | 0 | 4 | 100.0% |
| `nested_rule` | 3 | 0 | 3 | 100.0% |
| `nested_rule2` | 4 | 0 | 4 | 100.0% |
| `nested_rule3` | 4 | 0 | 4 | 100.0% |
| `nested_rule4` | 2 | 0 | 2 | 100.0% |
| `nested_rule5` | 4 | 0 | 4 | 100.0% |
| `nested_rule6` | 1 | 0 | 1 | 100.0% |
| `nested_rule7` | 4 | 0 | 4 | 100.0% |
| `nested_rules_variable_shadowing` | 3 | 0 | 3 | 100.0% |
| `pb` | 2 | 0 | 2 | 100.0% |
| `required_labels` | 4 | 0 | 4 | 100.0% |
| `restricted_destinations` | 4 | 0 | 4 | 100.0% |
| `unconditional_rules` | 4 | 0 | 4 | 100.0% |
| `unnest` | 5 | 0 | 5 | 100.0% |
| `variable_type_propagation` | 1 | 0 | 1 | 100.0% |

## Non-conformant cases

| Case | Failure category | Detail |
| --- | --- | --- |
| _None_ | — | — |

# CEL Conformance Report

Generated from the synchronized fixtures in `testdata/conformance/*.textproto.json`.

## Summary

| Metric | Count |
| --- | ---: |
| Total cases | 2505 |
| Conformant | 2505 |
| Non-conformant | 0 |
| Skipped | 3 |
| Conformance | 100.0% |

## Skipped cases

| Case | Reason |
| --- | --- |
| `string_ext/value_errors/indexof_out_of_range` | `upstream fixture expects an error; cel-go returns -1` |
| `string_ext/value_errors/lastindexof_out_of_range` | `upstream fixture expects an error; cel-go returns -1` |
| `timestamps/duration_converters/get_milliseconds` | `upstream fixture expects fractional milliseconds; cel-go returns total milliseconds` |

## Failure categories

| Category | Cases |
| --- | ---: |

## Conformance profiles

| Profile | Conformant | Non-conformant | Total | Conformance |
| --- | ---: | ---: | ---: | ---: |
| Core | 1858 | 0 | 1858 | 100.0% |
| Extension-dependent | 647 | 0 | 647 | 100.0% |

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
| `enums` | 85 | 0 | 85 | 100.0% |
| `fields` | 60 | 0 | 60 | 100.0% |
| `fp_math` | 30 | 0 | 30 | 100.0% |
| `integer_math` | 64 | 0 | 64 | 100.0% |
| `lists` | 39 | 0 | 39 | 100.0% |
| `lists_ext` | 52 | 0 | 52 | 100.0% |
| `logic` | 30 | 0 | 30 | 100.0% |
| `macros` | 44 | 0 | 44 | 100.0% |
| `macros2` | 46 | 0 | 46 | 100.0% |
| `math_ext` | 199 | 0 | 199 | 100.0% |
| `namespace` | 14 | 0 | 14 | 100.0% |
| `network_ext` | 69 | 0 | 69 | 100.0% |
| `optionals` | 70 | 0 | 70 | 100.0% |
| `parse` | 219 | 0 | 219 | 100.0% |
| `plumbing` | 5 | 0 | 5 | 100.0% |
| `proto2` | 118 | 0 | 118 | 100.0% |
| `proto2_ext` | 18 | 0 | 18 | 100.0% |
| `proto3` | 85 | 0 | 85 | 100.0% |
| `string` | 51 | 0 | 51 | 100.0% |
| `string_ext` | 214 | 0 | 214 | 100.0% |
| `timestamps` | 77 | 0 | 77 | 100.0% |
| `type_deductions` | 47 | 0 | 47 | 100.0% |
| `wrappers` | 36 | 0 | 36 | 100.0% |

## Non-conformant cases

| Case | Failure category |
| --- | --- |
| _None_ | — |

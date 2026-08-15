# ANSI SQL profile, major version 1

Status: Draft

This document is the profile contract required by `SPEC.md` section 9.

This is the baseline profile. `SPEC.md` section 9.6 requires every conforming implementation to provide it, and forbids changing its fragment, output type, or emitted output. A dialect whose target differs from ISO/IEC 9075 extends this profile under section 9.7 instead of modifying it.

Profile name: `protoutil.celql.ansisql`
Major version: `1`
Output type: `protoutil.celql.ansisql.v1.AnsiSqlPredicate`

The target language is the SQL defined by ISO/IEC 9075. The profile emits a search condition only. It emits no other query part.

## 1. Supported input domain

Supported CEL types: `bool`, `int`, `uint`, `double`, `string`, `bytes`, `null_type`, `google.protobuf.Timestamp`, `google.protobuf.Duration`.

Timestamps and durations are supported because a date or interval bound appears in most real filters, and ISO/IEC 9075 has datetime and interval types that carry them.

The profile does not support `optional_type`. Section 6.1.1 of `SPEC.md` applies.

The profile supports the `exists` comprehension form in the restricted shape defined in section 6. It supports no other comprehension form.

The profile declares `REGEX_SUPPORT_NONE`. ISO/IEC 9075 defines no operator with RE2 syntax and RE2 matching semantics, so the profile MUST reject `matches_string` rather than approximate it.

Null behavior is `NULL_SEMANTICS_DISTINCT_NULL`. SQL `NULL` carries CEL `null`.

Absence behavior is `ABSENCE_SEMANTICS_REJECTED`. SQL does not distinguish an absent column from a null column, so the profile MUST reject the lowered `has()` form, which is a `select_expr` whose `test_only` field is true. The applicable error code is `unsupported expression`.

### 1.1 Three-valued logic

A SQL search condition evaluates to true, false, or unknown, and a row is selected only when the condition is true. CEL has no unknown. This difference decides several emission rules below, so the correspondence is stated once here.

CEL error propagation through logical operators matches SQL unknown propagation exactly:

| CEL | Result | SQL | Result |
| --- | --- | --- | --- |
| `error \|\| true` | `true` | `UNKNOWN OR TRUE` | `TRUE` |
| `error \|\| false` | error | `UNKNOWN OR FALSE` | `UNKNOWN` |
| `error && true` | error | `UNKNOWN AND TRUE` | `UNKNOWN` |
| `error && false` | `false` | `UNKNOWN AND FALSE` | `FALSE` |
| `!error` | error | `NOT UNKNOWN` | `UNKNOWN` |

A CEL error and a SQL unknown both fail to select a row, and both propagate the same way. An operation whose CEL result is an error on a null operand MAY therefore emit the plain SQL operator, because the two systems agree for every combination.

CEL equality behaves differently. CEL equality is total: `null == 'x'` is `false` and `null != 'x'` is `true`, never an error. SQL `=` and `<>` yield unknown when either operand is null.

Left unhandled, that difference silently narrows the selected rows. For a null column `c`, CEL `c != 'x'` is `true` and selects the row, while `"c" <> ?` is unknown and does not. `SPEC.md` section 17 forbids that narrowing.

The profile therefore MUST emit a total condition for every equality comparison, using the rules in section 5.2.

An operation whose CEL result is an error on a null operand MUST NOT receive a null guard, because a guard would turn a non-selecting unknown into a selecting or non-selecting definite value and would change the result under negation.

### 1.2 Standard features this profile requires

The profile depends on two ISO/IEC 9075 features beyond the core:

| Feature | Used for | Consequence if absent |
| --- | --- | --- |
| T151, `DISTINCT` predicate | every equality comparison, section 5.2 | the target needs an extending profile that substitutes a total equality form |
| T031, `BOOLEAN` data type | Boolean columns, section 5.5 | the target needs an extending profile, or a schema whose Boolean columns are not exposed to CEL as `bool` |

A target that lacks either feature MUST use an extending profile. It MUST NOT substitute a non-total form such as plain `=`, because that reintroduces the row loss described in section 1.1.

### 1.3 Expression forms this profile cannot accept

These forms are outside core ISO/IEC 9075 rather than outside CEL. They are listed here so a caller knows to select an extending profile rather than rewrite the expression.

| Form | Reason | Where it belongs |
| --- | --- | --- |
| `field.exists(x, ...)` over an array-valued column | core SQL has no array-valued column, so there is nothing to iterate | a profile for a target with arrays |
| `value in array_column` | same reason | a profile for a target with arrays |
| `field.matches(re)` | no operator with RE2 syntax and RE2 matching semantics | a profile for a target with a compatible engine |
| `has(field)` | SQL does not distinguish an absent column from a null column | no target distinguishes them; restructure the expression |

The comprehension support in section 6 covers `exists` over a list literal, which is a membership test. It does not cover iteration over stored data.

## 2. Query field paths

A query field path comes from an `ident_expr`, or from a `select_expr` chain whose innermost operand is an `ident_expr`.

A CEL identifier name may be qualified. The profile MUST split the identifier name on `.` into components, then append one component for each `field` in the chain, outermost last.

Each component MUST be non-empty and MUST contain no U+0000. No other restriction applies, because delimiting removes the need for one.

The profile MUST emit each component as a delimited identifier: a leading `"`, the component with every `"` replaced by `""`, then a trailing `"`. It MUST join components with `.`.

Delimiting is why the profile accepts a component that matches a reserved word or contains a space: `SELECT` emits as `"SELECT"`, which ISO/IEC 9075 treats as an identifier rather than a keyword.

The profile MUST reject a path it cannot delimit with `unresolved query field path`, reported at the `ident_expr` or the outermost `select_expr`.

## 3. Parameters

The profile declares `PARAMETER_STYLE_POSITIONAL`, because ISO/IEC 9075 dynamic parameter markers are unnumbered.

The profile MUST emit `?` for each value and MUST append one `AnsiSqlParameter` in the same order.

The profile MUST NOT deduplicate equal values. Two occurrences produce two markers and two entries, because a caller binds by position.

`ParameterComposition.supports_start_position` and `supports_name_prefix` are both false. Unnumbered markers compose by position without renumbering, so no start position is required.

Each parameter's `cel_type` is the CEL type of the source value. Each parameter's `value` uses the matching `cel.expr.Value` field:

| CEL type | `cel.expr.Value` field |
| --- | --- |
| `bool` | `bool_value` |
| `int` | `int64_value` |
| `uint` | `uint64_value` |
| `double` | `double_value` |
| `string` | `string_value` |
| `bytes` | `bytes_value` |
| `google.protobuf.Timestamp` | `object_value`, holding a `google.protobuf.Timestamp` |
| `google.protobuf.Duration` | `object_value`, holding a `google.protobuf.Duration` |

CEL `null` never becomes a parameter. Section 5 defines its emission.

## 4. Value range

Exact numeric types in ISO/IEC 9075 are signed. A `uint` value greater than 2^63-1 has no portable representation, and binding it would change comparison behavior.

The profile MUST reject a `uint` constant greater than 2^63-1 with `unsafe translation`, reported at the constant node.

A `uint` value at or below 2^63-1 is supported.

## 5. Operations

`L` and `R` are the emitted operands. `P` is a query field path.

| Overload id | Emission |
| --- | --- |
| `logical_and` | `(L AND R)` |
| `logical_or` | `(L OR R)` |
| `logical_not` | `(NOT L)` |
| `equals` | `L = R`, or `L IS NOT DISTINCT FROM R` under section 5.2 |
| `not_equals` | `L IS DISTINCT FROM R` |
| `less_int64`, `less_uint64`, `less_double`, `less_string` | `L < R` |
| `less_equals_int64`, `less_equals_uint64`, `less_equals_double`, `less_equals_string` | `L <= R` |
| `greater_int64`, `greater_uint64`, `greater_double`, `greater_string` | `L > R` |
| `greater_equals_int64`, `greater_equals_uint64`, `greater_equals_double`, `greater_equals_string` | `L >= R` |
| `less_timestamp`, `less_duration` | `L < R` |
| `less_equals_timestamp`, `less_equals_duration` | `L <= R` |
| `greater_timestamp`, `greater_duration` | `L > R` |
| `greater_equals_timestamp`, `greater_equals_duration` | `L >= R` |
| `starts_with_string` | `P LIKE ? ESCAPE '\'` |
| `ends_with_string` | `P LIKE ? ESCAPE '\'` |
| `contains_string` | `P LIKE ? ESCAPE '\'` |
| `in_list` | `(P IS NOT NULL AND P IN (?, ?, ...))` |
| `string_to_timestamp` | folds to a timestamp constant |
| `string_to_duration` | folds to a duration constant |

Every operation not listed above is rejected with `unsupported overload`.

### 5.1 Operand shapes

Each comparison accepts these combinations, where `C` is a constant:

| Shapes | Accepted |
| --- | --- |
| P, C | yes |
| C, P | yes |
| P, P | yes |
| C, C | no, rejected with `unsupported overload` |

A comparison between two paths whose CEL types differ is rejected with `unsupported overload`.

A logical operator accepts a translated expression or a Boolean query field path at each operand position. Section 5.5 defines the Boolean path emission.

A bare Boolean constant in an operand position is rejected with `unsupported expression`. The profile declares no folding under `SPEC.md` section 10.1, and a constant operand carries no reference to the record, so accepting it would require emitting a literal truth value that ISO/IEC 9075 expresses only through the optional `BOOLEAN` type. A Boolean constant reaches this profile usefully only as the whole expression, which section 7 resolves to `match_all` or `match_none`.

### 5.2 Equality and null

CEL equality is total. SQL `=` and `<>` are not, as section 1.1 explains.

`L IS NOT DISTINCT FROM R` is true when both operands are null, true when both are non-null and equal, and false otherwise. That is exactly CEL equality. `L IS DISTINCT FROM R` is its complement. Neither yields unknown, so both remain correct under negation.

This uses ISO/IEC 9075 feature T151. A target that lacks T151 requires an extending profile that substitutes an equivalent total form, such as `IS` in SQLite or `<=>` in MySQL.

WHEN the operands are one query field path and one constant that is not `null`, and no negation encloses the comparison, the profile MUST emit `L = R` for `equals`. Both forms select the same records there: they differ only when the compared value is null, which the null rules below already emit separately. Plain equality keeps an ordinary index usable, which the distinct predicate does not.

The profile MUST NOT emit `=` for `equals` under any of the following, because the two forms then select different records:

- a negation encloses the comparison, where `=` yields unknown for a null field and negated unknown stays unknown, while CEL selects that field;
- both operands are query field paths, where either value may be null.

The profile MUST NOT emit `<>` for `not_equals` in any position, because CEL selects a null field whose value differs from the constant and `<>` yields unknown for that field.

WHEN one operand is a CEL `null` constant and the other is a query field path, the profile MUST emit the shorter equivalent form:

| Form | Emission |
| --- | --- |
| `equals` | `P IS NULL` |
| `not_equals` | `P IS NOT NULL` |

`P IS NULL` and `P IS NOT DISTINCT FROM NULL` select the same rows. The profile emits the shorter form because it needs no optional feature and reads more directly.

`equals` between two `null` constants is a constant-to-constant comparison and is rejected.

### 5.2.1 Ordering comparisons carry no null guard

An ordering comparison on a null operand is a CEL error, not `false`. Section 1.1 shows that a CEL error and a SQL unknown propagate identically, so `L < R` already agrees with CEL for every operand combination, including under negation.

The profile MUST NOT add a null guard to an ordering comparison. A guard would convert unknown into a definite value and would change the result of an enclosing negation, turning agreement into divergence.

The same reasoning applies to the pattern operations in section 5.3, which are also CEL errors on a null operand.

### 5.3 Pattern operations

`esc(v)` prefixes each occurrence of `\`, `%`, and `_` in `v` with a single `\`.

| Overload id | Bound value |
| --- | --- |
| `starts_with_string` | `esc(v) + "%"` |
| `ends_with_string` | `"%" + esc(v)` |
| `contains_string` | `"%" + esc(v) + "%"` |

The wildcard is appended after escaping, so an appended wildcard is never escaped.

The second operand MUST be a `string` constant. Any other operand shape is rejected with `unsupported overload`.

Escaping is required in addition to binding. A bound parameter is still read as a pattern by `LIKE`, so an unescaped `%` in data would match arbitrary text.

### 5.4 Membership

`in_list` accepts a query field path and a list literal whose elements are all constants of the path's CEL type.

The profile MUST emit one marker per element and MUST append one parameter per element, in element order.

CEL membership is total: `null in ['a']` is `false`, never an error. SQL `NULL IN ('a')` is unknown. The profile MUST therefore guard the test with `P IS NOT NULL`, which makes the condition false rather than unknown for a null column and keeps the result correct under negation.

An empty list is rejected with `unsupported expression`, because ISO/IEC 9075 does not permit an empty parenthesized list.

### 5.5 Boolean columns

A query field path of CEL type `bool` may appear as the whole expression or as an operand of a logical operator. The profile MUST emit:

```text
P = TRUE
```

An authorization rule commonly tests a Boolean flag directly, as in `resource.public`, so refusing this form would reject a large class of realistic input.

The profile MUST NOT emit `P` alone, and MUST NOT emit `P IS TRUE`.

Emitting `P` alone relies on an implicit conversion that ISO/IEC 9075 does not define. `P IS TRUE` is total, and totality is wrong here: CEL treats a null where a Boolean is required as an error, and section 1.1 shows that an error corresponds to unknown, not to false. For a null column, `P IS TRUE` is false, so `NOT (P IS TRUE)` is true and selects a row that CEL does not select. `P = TRUE` is unknown for a null column and propagates the same way the CEL error does.

This form requires feature T031, as section 1.2 records.

### 5.6 Timestamp and duration conversions

`string_to_timestamp` and `string_to_duration` are the resolved overloads of `timestamp(string)` and `duration(string)`.

Each is supported only with a single `string` constant argument. The profile MUST fold that call into a constant of the corresponding type, which then behaves as any other constant operand.

The argument MUST be a valid RFC 3339 timestamp for `string_to_timestamp`, and a valid CEL duration for `string_to_duration`. Otherwise the profile MUST reject the call with `unsupported expression`, reported at the argument node.

With any other argument shape, the profile MUST reject the call with `unsupported overload`. A conversion applied to a column would have to run in the target rather than at translation time, and the resulting semantics are target-specific.

A folded timestamp binds as a `cel.expr.Value` `object_value` holding a `google.protobuf.Timestamp`. A folded duration binds the same way with a `google.protobuf.Duration`.

## 6. Comprehensions

The profile recognizes one comprehension form: the lowered `exists` macro over a list literal of constants, whose loop predicate compares the iteration variable to a query field path with `equals`.

That shape states that a column equals one of a fixed set of values, which SQL expresses directly as a membership test.

A `comprehension_expr` is recognized only when every one of these holds:

1. `iter_var2` is empty;
2. `iter_range` is a `list_expr` whose elements are all constants of one CEL type;
3. `iter_range` has at least one element;
4. `accu_init` is the Boolean constant `false`;
5. `loop_condition` is the standard short-circuit test for `exists`;
6. `loop_step` is a `logical_or` call whose first argument is an `ident_expr` naming `accu_var`, and whose second argument is an `equals` call between an `ident_expr` naming `iter_var` and a query field path of the element type;
7. `result` is an `ident_expr` naming `accu_var`;
8. the comprehension's resolved type is `bool`.

The profile MUST reject a `comprehension_expr` that fails any of these with `unsupported expression`, reported at the comprehension node. It MUST check the conditions together and MUST NOT infer the form from any subset.

The emission is the membership form from section 5.4, with the list elements bound in element order:

```text
(P IS NOT NULL AND P IN (?, ?, ...))
```

An `exists` over a column rather than a list literal is rejected. Core ISO/IEC 9075 has no array-valued column, so there is nothing to iterate. An extending profile for a target with array columns may accept that shape.

## 7. Outcomes

A Boolean constant root yields `match_all` or `match_none`, as `SPEC.md` section 10.1 requires.

The profile declares no other reduction to a constant outcome. Every other accepted expression yields a predicate.

## 8. Limits

Output growth is measured in `OUTPUT_GROWTH_UNIT_CHARACTERS`, counted as Unicode code points of `AnsiSqlPredicate.sql`.

Default limits:

| Limit | Default |
| --- | --- |
| `max_depth` | 32 |
| `max_nodes` | 1000 |
| `max_parameters` | 100 |
| `max_constant_bytes` | 8192 |
| `max_total_constant_bytes` | 65536 |
| `max_comprehension_nesting` | 1 |
| `max_regex_pattern_bytes` | 0 |
| `max_output_growth` | 4096 |

`max_regex_pattern_bytes` is zero because the profile translates no regular expression.

## 9. Conformance comparison

Profile cases compare the exact `AnsiSqlPredicate` message, including the parameter order.

The profile emits one deterministic form for each accepted input, so no canonical form is needed.

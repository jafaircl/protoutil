# @protoutil/celql

Translate a checked CEL expression into a query predicate.

The input is a standard `cel.expr.CheckedExpr`. The output is a predicate of the type declared by the dialect profile you select. A predicate is one Boolean condition, not a complete query.

This package does not parse CEL source text, type-check it, evaluate it, or execute queries. Produce the checked expression with `@protoutil/cel` or any other conforming CEL implementation, then translate it here.

## Usage

```ts
import { AnsiSqlDialect, createTranslator, PostgreSqlDialect } from "@protoutil/celql";

const ansiSql = createTranslator(AnsiSqlDialect);
const postgreSql = createTranslator(PostgreSqlDialect);

const outcome = postgreSql.translate({ checkedExpression });
postgreSql.validate({ checkedExpression });
```

`createTranslator` requires exactly one dialect class. The returned translator uses that dialect for every operation and accepts no per-operation dialect override. Create another translator when you need another dialect. A specified translation rejection throws `CelqlError`; an unexpected dialect exception propagates unchanged.

The package exports `Dialect`, `SqlDialect`, `AnsiSqlDialect`, and `PostgreSqlDialect` for custom dialects. The translator creates a fresh dialect visitor for each operation, so traversal and parameter state cannot leak between requests.

## Status

The translator, ANSI SQL version 1 profile, and PostgreSQL version 1 profile are implemented. The TypeScript runner passes all 149 published conformance cases and their 252 profile expectations. Focused unit tests cover the public API and dialect extension points. A differential suite compares every successful PostgreSQL source expectation with queries executed by PostgreSQL 14. The package publishes:

- `SPEC.md` — the normative translation, security, limit, error, versioning, and conformance contract.
- `profiles/ANSI_SQL_V1.md` — the baseline dialect every implementation must provide.
- `profiles/POSTGRESQL_V1.md` — the PostgreSQL extension contract.
- `proto/protoutil/celql/v1/celql.proto` — the profile reference, resource limits, error model, transport envelope, and machine-readable capability declaration.
- `proto/protoutil/celql/ansisql/v1/ansisql.proto` — the baseline profile's output type.
- `proto/protoutil/celql/postgresql/v1/postgresql.proto` — the PostgreSQL profile's configuration and output types.
- `conformance/` — the core, ANSI SQL, and PostgreSQL suites.
- `TEST_STRATEGY.md` — the layers a dialect must pass to be production-ready.

## Dialects

Every conforming implementation provides the **ANSI SQL** baseline profile, targeting the SQL of ISO/IEC 9075. It emits a search condition with `?` parameter markers and delimited identifiers:

```text
("name" IS NOT DISTINCT FROM ? AND "age" > ?)   parameters: ["alice", 21]
```

A dialect whose target differs from ISO/IEC 9075 **extends** the baseline rather than replacing it. An extending profile accepts everything the baseline accepts and selects the same records for those expressions, but emits its own output — different parameter markers, different identifier quoting, or operations the baseline cannot express. Extension is one level deep, so the full contract is always two documents.

### What the baseline accepts

Comparisons on `bool`, `int`, `uint`, `double`, `string`, `bytes`, timestamps, and durations. Boolean columns used directly. `&&`, `||`, `!`. `startsWith`, `endsWith`, `contains`. `in` over a list literal. Equality against `null`. Timestamp and duration conversions over a constant.

That covers the common shapes:

```text
status == "active" && created_at >= timestamp("2024-01-01T00:00:00Z")
resource.public || resource.owner_id == "user-123"
name.startsWith("ali") && role in ["admin", "editor"]
```

### What needs an extending profile

These are limits of core ISO/IEC 9075, not of CEL. The baseline rejects them rather than approximating:

| Form | Why | Provided by |
| --- | --- | --- |
| `tags.exists(t, t == "x")` over an array column | core SQL has no array-valued column | PostgreSQL, MongoDB |
| `"x" in tags` where `tags` is a column | same | PostgreSQL, MongoDB |
| `name.matches("^a.*")` | no operator with RE2 syntax and semantics | PostgreSQL, MongoDB |
| `has(field)` | SQL cannot distinguish an absent column from a null one | nothing; restructure the expression |

If your workload is mostly array membership or regular expressions, the baseline alone will reject most of it. That is the extension model working as intended, but it means the baseline is not sufficient on its own for those workloads.

### PostgreSQL version 1

The PostgreSQL profile targets PostgreSQL 14 or later with UTF-8 server encoding. It accepts the complete ANSI SQL version 1 fragment and emits `$n` placeholders. `PostgreSqlConfiguration.start_position` lets an application compose a predicate after parameters it already owns.

It also accepts equality membership over one-dimensional PostgreSQL array columns, including the equivalent lowered `exists` form, and an ASCII subset shared by CEL's RE2 syntax and PostgreSQL regular expressions. Unsupported regex constructs are rejected instead of being approximated.

Run the complete suite with Docker available:

```sh
pnpm test
```

The PostgreSQL spec starts the Compose service, waits for readiness, and removes it after the suite. Set `CELQL_POSTGRES_IMAGE` before `pnpm test` to execute the same suite against another PostgreSQL image. Each database case compares selected record IDs from the emitted predicate with record IDs selected by CEL evaluation.

## Model

```text
checked CEL expression ──▶ translation ──▶ match_all | match_none | predicate
```

A caller selects one profile explicitly. A translator never infers a profile from the expression and never substitutes another when the selected one rejects an expression.

Translation is atomic. If any reachable part of the expression cannot be translated correctly, the whole translation fails. A partial predicate would silently widen or narrow the matched set, so none is ever returned.

`match_all` and `match_none` are distinct outcomes, not predicates that happen to select everything or nothing. A caller must not run an unrestricted query after `match_none` or after an error.

## Before you translate

Substitute every value that is known independently of the queried record — the current time, the requesting user, configuration, data fetched elsewhere. What remains must be identifiers and selections that map directly onto fields in the target.

## Safety

A value from a CEL constant stays data. It never becomes an identifier, operator, function name, keyword, or raw syntax. A profile that emits textual query syntax binds string and bytes values as parameters and never escapes them into the query text.

Parameter binding alone is not enough where a target operator reads its parameter as a pattern language. A profile that translates through one also escapes the data characters that language would otherwise interpret.

## Adding a dialect

A dialect profile declares a translatable fragment and publishes a `DialectCapabilityProfile`. Every rule that decides acceptance or rejection lives in an enumerated or structured field, so a caller can test whether an expression is translatable before attempting it.

Extend the closest built-in dialect and override only behavior that differs. This example replaces PostgreSQL regular-expression output with an application-defined PostgreSQL function while retaining inherited Boolean traversal, path encoding, parameter binding, limits, and every other PostgreSQL operation:

```ts
import {
  createTranslator,
  type Expr,
  PostgreSqlDialect,
} from "@protoutil/celql";

class AcmePostgreSqlDialect extends PostgreSqlDialect {
  protected override visitCall(expression: Expr, overloadId: string): string {
    if (overloadId !== "matches_string") {
      return super.visitCall(expression, overloadId);
    }

    const [value, pattern] = this.operands(expression);
    if (value === undefined || pattern === undefined) {
      return super.visitCall(expression, overloadId);
    }

    return `acme_matches(${this.visitFieldPath(value)}, ${this.bindConstant(pattern)})`;
  }
}

const acmePostgreSql = createTranslator(AcmePostgreSqlDialect);
const outcome = acmePostgreSql.translate({ checkedExpression });
```

This override changes only the emitted representation of an operation PostgreSQL already declares, so it inherits the PostgreSQL capability declaration. A subclass that accepts a new overload, operand shape, CEL type, or comprehension form must also override the static `capability` declaration and add that supported form.

A profile is complete when it passes the core conformance suite, passes its own profile suite covering every declared capability and its rejection boundary, and agrees with a CEL evaluator under differential execution against the real target. See `TEST_STRATEGY.md`.

## License

MIT

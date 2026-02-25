/** biome-ignore-all lint/suspicious/noExplicitAny: TODO */
/** biome-ignore-all lint/style/noNonNullAssertion: TODO */

import { assert, describe, it } from "vitest";
import { check, outputType, TypeCheckError } from "./checker.js";
import { parse } from "./parser.js";
import {
  BOOL,
  BYTES,
  DOUBLE,
  DYN,
  ERROR,
  func,
  INT64,
  ident,
  listType,
  mapType,
  memberOverload,
  messageType,
  NULL,
  overload,
  STRING,
  TIMESTAMP,
  typeToString,
  UINT64,
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeCase(typeMap: Record<string, any>, id: bigint): string | undefined {
  return typeMap[String(id)]?.typeKind?.case;
}

// ── Literal type inference ────────────────────────────────────────────────────

describe("Literal type inference", () => {
  it("true → BOOL", () => {
    const { expr } = parse("true");
    const { checkedExpr, errors } = check(parse("true"));
    assert.equal(errors.length, 0);
    assert.equal(typeCase(checkedExpr.typeMap, expr!.id), "primitive");
    assert.deepEqual(checkedExpr.typeMap[String(expr!.id)], BOOL);
  });

  it("false → BOOL", () => {
    const { expr } = parse("false");
    const { checkedExpr } = check(parse("false"));
    assert.deepEqual(checkedExpr.typeMap[String(expr!.id)], BOOL);
  });

  it("null → NULL", () => {
    const { expr } = parse("null");
    const { checkedExpr } = check(parse("null"));
    assert.equal(checkedExpr.typeMap[String(expr!.id)]?.typeKind?.case, "null");
  });

  it("42 → INT64", () => {
    const { expr } = parse("42");
    const { checkedExpr } = check(parse("42"));
    assert.deepEqual(checkedExpr.typeMap[String(expr!.id)], INT64);
  });

  it("-42 → INT64", () => {
    const { expr } = parse("-42");
    const { checkedExpr } = check(parse("-42"));
    assert.deepEqual(checkedExpr.typeMap[String(expr!.id)], INT64);
  });

  it("1u → UINT64", () => {
    const { expr } = parse("1u");
    const { checkedExpr } = check(parse("1u"));
    assert.deepEqual(checkedExpr.typeMap[String(expr!.id)], UINT64);
  });

  it("3.14 → DOUBLE", () => {
    const { checkedExpr } = check(parse("3.14"));
    assert.deepEqual(outputType(checkedExpr), DOUBLE);
  });

  it('"hello" → STRING', () => {
    const { checkedExpr } = check(parse('"hello"'));
    assert.deepEqual(outputType(checkedExpr), STRING);
  });

  it("DYN types are omitted from typeMap", () => {
    const parsed = parse("x");
    const { checkedExpr } = check(parsed, [ident("x", DYN)]);
    assert.equal(outputType(checkedExpr), undefined);
  });
});

describe("Ident resolution", () => {
  it("known ident resolves to its declared type", () => {
    const parsed = parse("retries");
    const { checkedExpr, errors } = check(parsed, [ident("retries", INT64)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), INT64);
  });

  it("known ident appears in referenceMap", () => {
    const parsed = parse("retries");
    const { checkedExpr } = check(parsed, [ident("retries", INT64)]);
    const ref = checkedExpr.referenceMap[String(parsed.expr!.id)];
    assert.equal(ref?.name, "retries");
  });

  it("unknown ident produces an error", () => {
    const { errors } = check(parse("unknownIdent"));
    assert.ok(errors.length > 0);
    assert.ok(errors[0].message.includes("unknownIdent"));
  });

  it("unknown ident typed as ERROR", () => {
    const parsed = parse("unknownIdent");
    const { checkedExpr } = check(parsed);
    assert.deepEqual(outputType(checkedExpr), ERROR);
  });

  it("error includes source position", () => {
    const { errors } = check(parse("unknownIdent"));
    assert.ok(errors[0].position !== undefined);
    assert.equal(errors[0].position!.line, 1);
    assert.equal(errors[0].position!.column, 0);
  });

  it("builtin true/false resolve without extra decls", () => {
    const { errors } = check(parse("true"));
    assert.equal(errors.length, 0);
  });
});

describe("Operator type inference", () => {
  it("a < 10 → BOOL", () => {
    const parsed = parse("a < 10");
    const { checkedExpr, errors } = check(parsed, [ident("a", INT64)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("a = b → BOOL", () => {
    const parsed = parse("a = b");
    const { checkedExpr, errors } = check(parsed, [ident("a", STRING), ident("b", STRING)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("a AND b → BOOL", () => {
    const parsed = parse("a AND b");
    const { checkedExpr, errors } = check(parsed, [ident("a", BOOL), ident("b", BOOL)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("a OR b → BOOL", () => {
    const parsed = parse("a OR b");
    const { checkedExpr, errors } = check(parsed, [ident("a", BOOL), ident("b", BOOL)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("NOT a → BOOL", () => {
    const parsed = parse("NOT a");
    const { checkedExpr, errors } = check(parsed, [ident("a", BOOL)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("call appears in referenceMap with overload id", () => {
    const parsed = parse("a < 10");
    const { checkedExpr } = check(parsed, [ident("a", INT64)]);
    const ref = checkedExpr.referenceMap[String(parsed.expr!.id)];
    assert.equal(ref?.name, "_<_");
    assert.ok(ref!.overloadId.length > 0);
    assert.ok(ref!.overloadId.some((id) => id.includes("int64") || id.includes("dyn")));
  });
});

describe("Function calls", () => {
  it("size(s) → INT64", () => {
    const parsed = parse("size(s)");
    const { checkedExpr, errors } = check(parsed, [ident("s", STRING)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), INT64);
  });

  it("unknown function → error", () => {
    const { errors } = check(parse("noSuchFunc(x)"));
    assert.ok(errors.some((e) => e.message.includes("noSuchFunc")));
  });

  it("unknown function → ERROR type", () => {
    const parsed = parse("noSuchFunc(x)");
    const { checkedExpr } = check(parsed);
    assert.deepEqual(outputType(checkedExpr), ERROR);
  });

  it("error has source position", () => {
    const parsed = parse("noSuchFunc(x)");
    const { errors } = check(parsed);
    assert.ok(errors[0].position !== undefined);
    assert.equal(errors[0].position!.line, 1);
  });

  it("custom function decl", () => {
    const parsed = parse("cohort(u)");
    const { checkedExpr, errors } = check(parsed, [
      ident("u", STRING),
      func("cohort", overload("cohort_string", [STRING], BOOL)),
    ]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("timestamp() → TIMESTAMP", () => {
    const parsed = parse('timestamp("2024-01-01T00:00:00Z")');
    const { checkedExpr, errors } = check(parsed);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), TIMESTAMP);
  });
});

describe("Method calls", () => {
  it("s.startsWith('x') → BOOL", () => {
    const parsed = parse("s.startsWith('x')");
    const { checkedExpr, errors } = check(parsed, [ident("s", STRING)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("s.endsWith('x') → BOOL", () => {
    const parsed = parse("s.endsWith('x')");
    const { checkedExpr, errors } = check(parsed, [ident("s", STRING)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("s.contains('x') → BOOL", () => {
    const parsed = parse("s.contains('x')");
    const { checkedExpr, errors } = check(parsed, [ident("s", STRING)]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("custom member overload", () => {
    const parsed = parse("r.cohort('vip')");
    const { checkedExpr, errors } = check(parsed, [
      ident("r", messageType("Request")),
      func("cohort", memberOverload("request_cohort_string", [STRING], BOOL)),
    ]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), BOOL);
  });

  it("method call appears in referenceMap", () => {
    const parsed = parse("s.startsWith('x')");
    const { checkedExpr } = check(parsed, [ident("s", STRING)]);
    const ref = checkedExpr.referenceMap[String(parsed.expr!.id)];
    assert.equal(ref?.name, "startsWith");
    assert.ok(ref!.overloadId.length > 0);
  });
});

describe("Select expressions", () => {
  it("select on map<string, int> → INT64", () => {
    const parsed = parse("m.count");
    const { checkedExpr, errors } = check(parsed, [ident("m", mapType(STRING, INT64))]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), INT64);
  });

  it("select on map<string, string> → STRING", () => {
    const parsed = parse("m.label");
    const { checkedExpr, errors } = check(parsed, [ident("m", mapType(STRING, STRING))]);
    assert.equal(errors.length, 0);
    assert.deepEqual(outputType(checkedExpr), STRING);
  });

  it("select on message type → DYN (no schema)", () => {
    const parsed = parse("r.field");
    const { checkedExpr } = check(parsed, [ident("r", messageType("Request"))]);
    // DYN is omitted from typeMap
    assert.deepEqual(outputType(checkedExpr), undefined);
  });

  it("select on DYN → DYN", () => {
    const parsed = parse("x.field");
    const { checkedExpr } = check(parsed, [ident("x", DYN)]);
    assert.deepEqual(outputType(checkedExpr), undefined);
  });
});

// // ── List and map inference ────────────────────────────────────────────────────

// describe("List and map type inference", () => {
//   it("list of strings → list(STRING)", () => {
//     // Build list expr manually since parser doesn't support list literals
//     const { expr: s1 } = parse('"a"');
//     const { expr: s2 } = parse('"b"');
//     const { sourceInfo } = parse('"a"');
//     const listExpr = {
//       id: 9999n,
//       exprKind: {
//         case: "listExpr" as const,
//         value: { elements: [s1!, s2!], optionalIndices: [] },
//       },
//     };
//     const { checkedExpr } = check({ expr: listExpr as any, sourceInfo });
//     const t = checkedExpr.typeMap["9999"];
//     assert.equal(t?.typeKind?.case, "listType");
//     assert.deepEqual((t?.typeKind as any)?.value?.elemType, STRING);
//   });

//   it("empty list → list(DYN), omitted from typeMap", () => {
//     const { sourceInfo } = parse("true");
//     const listExpr = {
//       id: 9998n,
//       exprKind: {
//         case: "listExpr" as const,
//         value: { elements: [], optionalIndices: [] },
//       },
//     };
//     const { checkedExpr } = check({ expr: listExpr as any, sourceInfo });
//     // list(DYN) — DYN list elem means the list type itself is still stored
//     const t = checkedExpr.typeMap["9998"];
//     assert.equal(t?.typeKind?.case, "listType");
//   });

//   it("map with field keys → map(STRING, INT64)", () => {
//     const { expr: intExpr } = parse("42");
//     const { sourceInfo } = parse("42");
//     const mapExpr = {
//       id: 9997n,
//       exprKind: {
//         case: "structExpr" as const,
//         value: {
//           messageName: "",
//           entries: [
//             {
//               id: 1n,
//               keyKind: { case: "fieldKey" as const, value: "count" },
//               value: intExpr!,
//               optionalEntry: false,
//             },
//           ],
//         },
//       },
//     };
//     const { checkedExpr } = check({ expr: mapExpr as any, sourceInfo });
//     const t = checkedExpr.typeMap["9997"];
//     assert.equal(t?.typeKind?.case, "mapType");
//     assert.deepEqual((t?.typeKind as any)?.value?.keyType, STRING);
//     assert.deepEqual((t?.typeKind as any)?.value?.valueType, INT64);
//   });

//   it("message construction → messageType", () => {
//     const { expr: strExpr } = parse('"v"');
//     const { sourceInfo } = parse('"v"');
//     const msgExpr = {
//       id: 9996n,
//       exprKind: {
//         case: "structExpr" as const,
//         value: {
//           messageName: "my.Proto",
//           entries: [
//             {
//               id: 1n,
//               keyKind: { case: "fieldKey" as const, value: "name" },
//               value: strExpr!,
//               optionalEntry: false,
//             },
//           ],
//         },
//       },
//     };
//     const { checkedExpr } = check({ expr: msgExpr as any, sourceInfo });
//     const t = checkedExpr.typeMap["9996"];
//     assert.equal(t?.typeKind?.case, "messageType");
//     assert.equal((t?.typeKind as any)?.value, "my.Proto");
//   });
// });

// // ── Comprehension ─────────────────────────────────────────────────────────────

// describe("Comprehension type inference", () => {
//   it("result type is inferred from result expr", () => {
//     const { expr: boolExpr } = parse("true");
//     const { sourceInfo } = parse("true");
//     const compExpr = {
//       id: 9995n,
//       exprKind: {
//         case: "comprehensionExpr" as const,
//         value: {
//           iterVar: "x",
//           iterVar2: "",
//           iterRange: boolExpr!,
//           accuVar: "acc",
//           accuInit: boolExpr!,
//           loopCondition: boolExpr!,
//           loopStep: boolExpr!,
//           result: boolExpr!,
//         },
//       },
//     };
//     const { checkedExpr } = check({ expr: compExpr as any, sourceInfo });
//     assert.deepEqual(checkedExpr.typeMap["9995"], BOOL);
//   });
// });

// ── TypeCheckError ────────────────────────────────────────────────────────────

describe("TypeCheckError", () => {
  it("is an instance of Error", () => {
    const { errors } = check(parse("badIdent"));
    assert.ok(errors[0] instanceof Error);
    assert.ok(errors[0] instanceof TypeCheckError);
  });

  it("has exprId as bigint", () => {
    const { errors } = check(parse("badIdent"));
    assert.equal(typeof errors[0].exprId, "bigint");
  });

  it("position has correct offset", () => {
    //  "  badIdent" — starts at offset 2
    const { errors } = check(parse("  badIdent"));
    assert.equal(errors[0].position?.offset, 2);
    assert.equal(errors[0].position?.column, 2);
  });

  it("multi-line: error on line 2 has correct line number", () => {
    // "a\nbadIdent" — badIdent starts at offset 2, line 2
    const { errors } = check(parse("a\nbadIdent"), [ident("a", BOOL)]);
    const err = errors.find((e) => e.message.includes("badIdent"));
    assert.ok(err);
    assert.equal(err!.position?.line, 2);
    assert.equal(err!.position?.column, 0);
  });
});

// ── typeToString ──────────────────────────────────────────────────────────────

describe("typeToString", () => {
  it("BOOL → 'bool'", () => assert.equal(typeToString(BOOL), "bool"));
  it("INT64 → 'int64'", () => assert.equal(typeToString(INT64), "int64"));
  it("UINT64 → 'uint64'", () => assert.equal(typeToString(UINT64), "uint64"));
  it("DOUBLE → 'double'", () => assert.equal(typeToString(DOUBLE), "double"));
  it("STRING → 'string'", () => assert.equal(typeToString(STRING), "string"));
  it("BYTES → 'bytes'", () => assert.equal(typeToString(BYTES), "bytes"));
  it("NULL → 'null'", () => assert.equal(typeToString(NULL), "null"));
  it("DYN → 'dyn'", () => assert.equal(typeToString(DYN), "dyn"));
  it("ERROR → 'error'", () => assert.equal(typeToString(ERROR), "error"));
  it("TIMESTAMP → 'google.protobuf.Timestamp'", () =>
    assert.equal(typeToString(TIMESTAMP), "google.protobuf.Timestamp"));
  it("list(STRING) → 'list(string)'", () =>
    assert.equal(typeToString(listType(STRING)), "list(string)"));
  it("map(STRING, INT64) → 'map(string, int64)'", () =>
    assert.equal(typeToString(mapType(STRING, INT64)), "map(string, int64)"));
  it("messageType → fully qualified name", () =>
    assert.equal(typeToString(messageType("google.type.Date")), "google.type.Date"));
});

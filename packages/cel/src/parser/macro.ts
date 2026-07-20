import { type EntryExpr, type Expr, ExprKind } from "../common/ast/index.js";
import type { Doc } from "../common/doc.js";
import { exampleDoc, macroDoc, multilineDescription } from "../common/doc.js";
import * as operators from "../common/operators.js";
import { type ExprHelper, type Macro, macroKey } from "./options.js";
import { RESERVED_IDS } from "./token.js";

/**
 * MacroConfig carries optional documentation metadata for a macro.
 */
export interface MacroConfig {
  /**
   * Description records the macro documentation text.
   */
  description?: string;
  /**
   * Examples records example snippets for the macro documentation.
   */
  examples?: string[];
}

/** AccumulatorName is the traditional comprehension accumulator identifier. */
export const AccumulatorName = "__result__";
/** HiddenAccumulatorName is the hidden comprehension accumulator identifier. */
export const HiddenAccumulatorName = "@result";

/** extractIdent returns the simple identifier name used by comprehension macros. */
function extractIdent(expr: Expr): string | undefined {
  if (expr.kind() !== 3) {
    return undefined;
  }
  const ident = expr.asIdent();
  if (ident === undefined) {
    return undefined;
  }
  return RESERVED_IDS.has(ident) ? undefined : ident;
}

/** globalMacro creates a macro for a global function call with a fixed arity. */
export function globalMacro(
  functionName: string,
  argCount: number,
  expander: Macro["expander"],
  config: MacroConfig = {},
): Macro {
  return macroValue(functionName, argCount, false, expander, config);
}

/** globalVarArgMacro creates a macro for a global function call with variable arity. */
export function globalVarArgMacro(
  functionName: string,
  expander: Macro["expander"],
  config: MacroConfig = {},
): Macro {
  return macroValue(functionName, "*", false, expander, config);
}

/** receiverMacro creates a macro for a receiver-style call with a fixed arity. */
export function receiverMacro(
  functionName: string,
  argCount: number,
  expander: Macro["expander"],
  config: MacroConfig = {},
): Macro {
  return macroValue(functionName, argCount, true, expander, config);
}

/** receiverVarArgMacro creates a macro for a receiver-style call with a variable arity. */
export function receiverVarArgMacro(
  functionName: string,
  expander: Macro["expander"],
  config: MacroConfig = {},
): Macro {
  return macroValue(functionName, "*", true, expander, config);
}

/** lookupMacro resolves a macro by function name, receiver shape, and arity. */
export function lookupMacro(
  macros: Map<string, Macro>,
  functionName: string,
  receiverStyle: boolean,
  argCount: number,
): Macro | undefined {
  return (
    macros.get(macroKey(functionName, argCount, receiverStyle)) ??
    macros.get(macroKey(functionName, "*", receiverStyle))
  );
}

/** HasMacro expands `has(<operand>.field)` into a presence test select. */
export const HasMacro = globalMacro(operators.Has, 1, (eh, _target, args) => {
  if (args[0]?.kind() !== ExprKind.Select) {
    return eh.error(args[0]?.id() ?? 0, "invalid argument to has() macro");
  }
  const select = args[0].asSelect()!;
  return eh.presenceTest(select.operand(), select.fieldName());
});

/** makeQuantifier expands quantifier macros into their corresponding comprehensions. */
function makeQuantifier(
  kind: "all" | "exists" | "existsOne",
  eh: ExprHelper,
  target: Expr,
  args: Expr[],
): Expr | Error {
  const iterVar = extractIdent(args[0]);
  if (!iterVar) {
    return eh.error(
      args[0]?.id() ?? 0,
      kind === "all" || kind === "exists"
        ? "argument must be a simple name"
        : "argument is not an identifier",
      "stop",
    );
  }
  const accu = eh.accuIdentName();
  if (iterVar === accu || iterVar === AccumulatorName) {
    // CEL reserves the accumulator slot for the comprehension runtime state.
    return eh.error(args[0].id(), "iteration variable overwrites accumulator variable");
  }
  switch (kind) {
    case "all":
      return eh.comprehension(
        target,
        iterVar,
        accu,
        eh.literal(true),
        eh.call(operators.NotStrictlyFalse, eh.accuIdent()),
        eh.call(operators.LogicalAnd, eh.accuIdent(), args[1]!),
        eh.accuIdent(),
      );
    case "exists":
      return eh.comprehension(
        target,
        iterVar,
        accu,
        eh.literal(false),
        eh.call(operators.NotStrictlyFalse, eh.call(operators.LogicalNot, eh.accuIdent())),
        eh.call(operators.LogicalOr, eh.accuIdent(), args[1]!),
        eh.accuIdent(),
      );
    case "existsOne":
      return eh.comprehension(
        target,
        iterVar,
        accu,
        eh.literal(0n),
        eh.literal(true),
        eh.call(
          operators.Conditional,
          args[1]!,
          eh.call(operators.Add, eh.accuIdent(), eh.literal(1n)),
          eh.accuIdent(),
        ),
        eh.call(operators.Equals, eh.accuIdent(), eh.literal(1n)),
      );
  }
}

/** AllMacro expands `range.all(var, predicate)` into a comprehension. */
export const AllMacro = receiverMacro(operators.All, 2, (eh, target, args) =>
  target ? makeQuantifier("all", eh, target, args) : eh.error(0, "missing macro target"),
);
/** ExistsMacro expands `range.exists(var, predicate)` into a comprehension. */
export const ExistsMacro = receiverMacro(operators.Exists, 2, (eh, target, args) =>
  target ? makeQuantifier("exists", eh, target, args) : eh.error(0, "missing macro target"),
);
/** ExistsOneMacro expands `range.exists_one(var, predicate)` into a comprehension. */
export const ExistsOneMacro = receiverMacro(operators.ExistsOne, 2, (eh, target, args) =>
  target ? makeQuantifier("existsOne", eh, target, args) : eh.error(0, "missing macro target"),
);
/** ExistsOneMacroNew expands `range.existsOne(var, predicate)` into a comprehension. */
export const ExistsOneMacroNew = receiverMacro("existsOne", 2, (eh, target, args) =>
  target ? makeQuantifier("existsOne", eh, target, args) : eh.error(0, "missing macro target"),
);

/** makeListAppend wraps a mapped value in a singleton list for list concatenation. */
function makeListAppend(eh: ExprHelper, value: Expr): Expr {
  return eh.list(value);
}

/** MapMacro expands `range.map(var, fn)` into a comprehension. */
export const MapMacro = receiverMacro(operators.Map, 2, (eh, target, args) => {
  const iterVar = extractIdent(args[0]);
  if (!target || !iterVar) {
    return eh.error(args[0]?.id() ?? 0, "argument is not an identifier");
  }
  const accu = eh.accuIdentName();
  if (iterVar === accu || iterVar === AccumulatorName) {
    return eh.error(args[0].id(), "iteration variable overwrites accumulator variable");
  }
  const init = eh.list();
  const condition = eh.literal(true);
  const step = eh.call(operators.Add, eh.accuIdent(), makeListAppend(eh, args[1]!));
  return eh.comprehension(target, iterVar, accu, init, condition, step, eh.accuIdent());
});

/** MapFilterMacro expands `range.map(var, predicate, fn)` into a comprehension. */
export const MapFilterMacro = receiverMacro(operators.Map, 3, (eh, target, args) => {
  const iterVar = extractIdent(args[0]);
  if (!target || !iterVar) {
    return eh.error(args[0]?.id() ?? 0, "argument is not an identifier");
  }
  const accu = eh.accuIdentName();
  if (iterVar === accu || iterVar === AccumulatorName) {
    return eh.error(args[0].id(), "iteration variable overwrites accumulator variable");
  }
  const init = eh.list();
  const condition = eh.literal(true);
  const step = eh.call(operators.Add, eh.accuIdent(), makeListAppend(eh, args[2]!));
  return eh.comprehension(
    target,
    iterVar,
    accu,
    init,
    condition,
    eh.call(operators.Conditional, args[1]!, step, eh.accuIdent()),
    eh.accuIdent(),
  );
});

/** FilterMacro expands `range.filter(var, predicate)` into a comprehension. */
export const FilterMacro = receiverMacro(operators.Filter, 2, (eh, target, args) => {
  const iterVar = extractIdent(args[0]);
  if (!target || !iterVar) {
    return eh.error(args[0]?.id() ?? 0, "argument is not an identifier");
  }
  const accu = eh.accuIdentName();
  if (iterVar === accu || iterVar === AccumulatorName) {
    return eh.error(args[0].id(), "iteration variable overwrites accumulator variable");
  }
  const init = eh.list();
  const condition = eh.literal(true);
  const step = eh.call(operators.Add, eh.accuIdent(), makeListAppend(eh, args[0]!));
  return eh.comprehension(
    target,
    iterVar,
    accu,
    init,
    condition,
    eh.call(operators.Conditional, args[1]!, step, eh.accuIdent()),
    eh.accuIdent(),
  );
});

/** AllMacros contains the full built-in macro set supported by this parser. */
export const AllMacros = [
  HasMacro,
  AllMacro,
  ExistsMacro,
  ExistsOneMacro,
  ExistsOneMacroNew,
  MapMacro,
  MapFilterMacro,
  FilterMacro,
];

/**
 * macroValue creates a macro record with optional documentation metadata.
 */
function macroValue(
  functionName: string,
  argCount: number | "*",
  receiverStyle: boolean,
  expander: Macro["expander"],
  config: MacroConfig,
): Macro {
  return {
    function: functionName,
    argCount,
    receiverStyle,
    expander,
    documentation: (): Doc | undefined => {
      if (!config.description) {
        return undefined;
      }
      return macroDoc(
        functionName,
        multilineDescription(config.description),
        ...(config.examples ?? []).map((example) => exampleDoc(example)),
      );
    },
  };
}

/** macroCopyEntries clones entry expressions for macro copy behavior. */
export function macroCopyEntries(entries: EntryExpr[], clone: (expr: Expr) => Expr): EntryExpr[] {
  return entries.map((entry) => {
    const mapEntry = entry.asMapEntry();
    if (mapEntry) {
      // Preserve the entry wrapper while cloning the nested expressions with fresh parser ids.
      return {
        ...entry,
        asMapEntry: () => ({
          key: () => clone(mapEntry.key()),
          value: () => clone(mapEntry.value()),
          isOptional: () => mapEntry.isOptional(),
        }),
      } as EntryExpr;
    }
    return entry;
  });
}

import type { LibraryAliaser, LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import type { Expr } from "../common/ast/index.js";
import { ExprKind } from "../common/ast/index.js";
import { functionDecl, overload } from "../common/decls.js";
import type { Val } from "../common/types/ref/index.js";
import { DynType, listType, typeParamType } from "../common/types/types.js";
import type { Activation } from "../interpreter/activation.js";
import { type ExecutionFrame, executionFrame } from "../interpreter/frame.js";
import type {
  InterpretableCall,
  InterpretableConstructor,
  InterpretableV2,
} from "../interpreter/interpretable.js";
import { receiverMacro } from "../parser/macro.js";
import type { ExprHelper } from "../parser/options.js";

/** bindMacro is the receiver macro name within the cel namespace. */
const bindMacro = "bind";
/** celNamespace is the namespace matched by the binding macro. */
const celNamespace = "cel";
/** unusedIterVar is the intentionally unused iteration variable in bind comprehensions. */
const unusedIterVar = "#unused";
/** indexPrefix identifies block-local lazy slots. */
const indexPrefix = "@index";

/**
 * BindingsOptions configures the CEL bindings extension.
 */
export interface BindingsOptions {
  /** version selects version zero bind-only behavior or version one block support. */
  readonly version?: number;
}

/**
 * BindingsLibrary describes the singleton CEL bindings library.
 */
export type BindingsLibrary = SingletonLibrary & LibraryAliaser & LibraryVersioner;

/**
 * bindings provides `cel.bind(var, init, expr)` and version-one `cel.@block` evaluation.
 *
 * A binding evaluates its initializer once and exposes it only within the result expression.
 * Blocks expose lazily evaluated list entries through `@indexN` identifiers.
 */
export function bindings(options: BindingsOptions = {}): BindingsLibrary {
  const version = options.version ?? Number.MAX_SAFE_INTEGER;
  const resultType = typeParamType("T");
  return {
    libraryAlias: "bindings",
    libraryName: "cel.lib.ext.cel.bindings",
    libraryVersion: version,
    compileOptions: {
      functions:
        version >= 1
          ? [
              functionDecl("cel.@block", {
                overloads: [
                  overload("cel_block_list", [listType(DynType), resultType], resultType),
                ],
              }),
            ]
          : [],
      macros: {
        custom: [receiverMacro(bindMacro, 3, expandBind)],
      },
    },
    programOptions: {
      decorators: version >= 1 ? [decorateBlock] : [],
    },
  };
}

/**
 * expandBind converts a matching namespaced call into a single-iteration comprehension scope.
 */
function expandBind(
  helper: ExprHelper,
  target: Expr | undefined,
  args: Expr[],
): Expr | Error | undefined {
  if (!target || target.kind() !== ExprKind.Ident || target.asIdent() !== celNamespace) {
    return undefined;
  }
  const variable = args[0]!;
  if (variable.kind() !== ExprKind.Ident) {
    return helper.error(variable.id(), "cel.bind() variable names must be simple identifiers");
  }
  const variableName = variable.asIdent()!;
  return helper.comprehension(
    helper.list(),
    unusedIterVar,
    variableName,
    args[1]!,
    helper.literal(false),
    helper.ident(variableName),
    args[2]!,
  );
}

/**
 * decorateBlock replaces planned `cel.@block` calls with lazy slot evaluation.
 */
function decorateBlock(value: InterpretableV2): InterpretableV2 {
  if (!isInterpretableCall(value) || value.functionName() !== "cel.@block") {
    return value;
  }
  const args = value.args();
  if (args.length !== 2) {
    throw new Error(`cel.@block expects two arguments, but got ${args.length}`);
  }
  const slots = args[0]!;
  if (!isInterpretableConstructor(slots)) {
    throw new Error("cel.@block expects a list constructor as the first argument");
  }
  return blockValue({ expression: args[1]!, slots: slots.initVals() });
}

/**
 * BlockValueOptions contains a planned block's slot and result expressions.
 */
interface BlockValueOptions {
  /** expression is the block result expression. */
  readonly expression: InterpretableV2;
  /** slots contains lazily evaluated slot expressions. */
  readonly slots: readonly InterpretableV2[];
}

/**
 * blockValue creates an interpretable which evaluates block slots at most once.
 */
function blockValue(options: BlockValueOptions): InterpretableV2 {
  // Keep one stack-safe pool per planned block. A nested evaluation acquires another activation,
  // while sequential evaluations reuse the arrays allocated for the block's fixed slot count.
  const activationPool: SlotActivation[] = [];
  /** evaluate executes the block against an existing frame. */
  const evaluate = (frame: ExecutionFrame): Val => {
    const activation = activationPool.pop() ?? new SlotActivation(options.slots);
    activation.configure(frame.activation(), frame);
    const child = frame.push(activation);
    activation.setFrame(child);
    try {
      return options.expression.exec(child);
    } finally {
      child.pop();
      activation.reset();
      activationPool.push(activation);
    }
  };
  return {
    id: () => options.expression.id(),
    exec: evaluate,
    eval: (input) => {
      const frame = executionFrame({ input });
      try {
        return evaluate(frame);
      } finally {
        frame.close();
      }
    },
  };
}

/**
 * SlotActivation resolves lazily computed `@indexN` block variables.
 */
class SlotActivation implements Activation {
  private frameValue?: ExecutionFrame;
  private parentActivation?: Activation;
  private readonly values: Array<Val | undefined>;
  private readonly visited: boolean[];

  /** constructor initializes an empty lazy slot cache. */
  constructor(private readonly slots: readonly InterpretableV2[]) {
    this.values = Array.from({ length: slots.length });
    this.visited = Array.from({ length: slots.length }, () => false);
  }

  /** configure attaches the reusable slot state to one block evaluation. */
  public configure(parent: Activation, frame: ExecutionFrame): void {
    this.parentActivation = parent;
    this.frameValue = frame;
  }

  /** setFrame installs the child frame used while evaluating slot expressions. */
  public setFrame(frame: ExecutionFrame): void {
    this.frameValue = frame;
  }

  /** reset releases evaluation references and clears every cached slot. */
  public reset(): void {
    this.parentActivation = undefined;
    this.frameValue = undefined;
    this.values.fill(undefined);
    this.visited.fill(false);
  }

  /** parent returns the original activation outside the slot scope. */
  public parent(): Activation | undefined {
    return this.parentActivation;
  }

  /** resolveName evaluates and caches valid slot identifiers, then delegates other names. */
  public resolveName(name: string): [unknown, boolean] {
    const index = matchSlot(name, this.slots.length);
    if (index === undefined) {
      return this.parentActivation?.resolveName(name) ?? [undefined, false];
    }
    if (this.visited[index]) {
      return this.values[index] === undefined ? [undefined, false] : [this.values[index], true];
    }
    // Mark the slot before evaluation so a self-reference resolves as not found.
    this.visited[index] = true;
    if (this.frameValue === undefined) {
      return [undefined, false];
    }
    const value = this.slots[index]!.exec(this.frameValue);
    this.values[index] = value;
    return [value, true];
  }
}

/**
 * matchSlot parses a valid in-range block slot identifier.
 */
function matchSlot(name: string, slotCount: number): number | undefined {
  if (!name.startsWith(indexPrefix)) {
    return undefined;
  }
  if (name.length === indexPrefix.length) {
    return undefined;
  }
  let index = 0;
  for (let offset = indexPrefix.length; offset < name.length; offset += 1) {
    const digit = name.charCodeAt(offset) - 48;
    if (digit < 0 || digit > 9) {
      return undefined;
    }
    index = index * 10 + digit;
    // Stop parsing as soon as the identifier cannot refer to a block slot.
    if (index >= slotCount) {
      return undefined;
    }
  }
  return index < slotCount ? index : undefined;
}

/**
 * isInterpretableCall reports whether a planned node exposes function-call metadata.
 */
function isInterpretableCall(value: InterpretableV2): value is InterpretableCall {
  return (
    typeof (value as Partial<InterpretableCall>).functionName === "function" &&
    typeof (value as Partial<InterpretableCall>).args === "function"
  );
}

/**
 * isInterpretableConstructor reports whether a planned node exposes aggregate inputs.
 */
function isInterpretableConstructor(value: InterpretableV2): value is InterpretableConstructor {
  return typeof (value as Partial<InterpretableConstructor>).initVals === "function";
}

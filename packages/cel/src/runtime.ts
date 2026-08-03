import type { DescMessage } from "@bufbuild/protobuf";
import { program as createProgram, type Program } from "./cel/program.js";
import { AST, protoToExpr, protoToSourceInfo, toAst } from "./common/ast/index.js";
import { type Container, defaultContainer } from "./common/containers.js";
import type { FunctionDecl } from "./common/decls.js";
import { standardFunctions } from "./common/stdlib.js";
import { type Registry, registry } from "./common/types/provider.js";
import type { CheckedExpr } from "./gen/cel/expr/checked_pb.js";
import type { ParsedExpr } from "./gen/cel/expr/syntax_pb.js";
import { attributeFactory } from "./interpreter/attributes.js";
import { dispatcher } from "./interpreter/dispatcher.js";
import { interpreter } from "./interpreter/interpreter.js";

/**
 * RuntimeOptions configures planning and evaluation of expressions checked outside this entry
 * point.
 */
export interface RuntimeOptions {
  /** container resolves qualified identifiers retained in a checked expression. */
  container?: Container;

  /** contextProto binds each field of an input protobuf message as a top-level variable. */
  contextProto?: DescMessage;

  /** functions provides custom function bindings referenced by the checked expression. */
  functions?: FunctionDecl[];

  /** jsonFieldNames selects protobuf JSON field names for context-message bindings. */
  jsonFieldNames?: boolean;

  /** registry provides descriptors and adapts native values during evaluation. */
  registry?: Registry;
}

/** RuntimeExpression is a parsed or checked CEL expression ready for planning. */
export type RuntimeExpression = AST | ParsedExpr | CheckedExpr;

/**
 * Runtime plans and evaluates checked CEL expressions without parser or checker support.
 */
export class Runtime {
  private readonly containerValue: Container;
  private readonly contextProtoValue?: DescMessage;
  private readonly functionsValue: FunctionDecl[];
  private readonly jsonFieldNamesValue: boolean;
  private readonly registryValue: Registry;

  /** Constructor configures the runtime's protobuf registry and function bindings. */
  constructor(options: RuntimeOptions = {}) {
    this.containerValue = options.container ?? defaultContainer;
    this.registryValue = options.registry ?? registry();
    this.jsonFieldNamesValue = options.jsonFieldNames ?? this.registryValue.jsonFieldNames();
    if (
      options.jsonFieldNames !== undefined &&
      this.registryValue.jsonFieldNames() !== options.jsonFieldNames
    ) {
      this.registryValue.withJSONFieldNames(options.jsonFieldNames);
    }
    this.contextProtoValue = options.contextProto;
    if (this.contextProtoValue !== undefined) {
      this.registryValue.registerDescriptor(this.contextProtoValue.file);
    }
    this.functionsValue = [...standardFunctions(), ...(options.functions ?? [])];
  }

  /** program plans a parsed or checked expression for repeated evaluation. */
  public program(expression: RuntimeExpression): Program {
    const ast = runtimeAst(expression);
    const functions = dispatcher();
    for (const declaration of this.functionsValue) {
      functions.add({ overloads: declaration.bindings() });
    }
    const planned = interpreter({
      adapter: this.registryValue,
      attrFactory: attributeFactory({
        adapter: this.registryValue,
        containerValue: this.containerValue,
        errorOnBadPresenceTest: false,
        provider: this.registryValue,
      }),
      container: this.containerValue,
      dispatcher: functions,
      provider: this.registryValue,
    }).interpretable({ exprAst: ast });
    return createProgram(planned, {
      adapter: this.registryValue,
      contextProto: this.contextProtoValue,
      hasAsync: this.functionsValue.some((declaration) =>
        declaration.bindings().some((binding) => binding.async !== undefined),
      ),
      jsonFieldNames: this.jsonFieldNamesValue,
    });
  }
}

/**
 * runtime creates an evaluator for CEL expressions that were checked outside the current bundle.
 */
export function runtime(options: RuntimeOptions = {}): Runtime {
  return new Runtime(options);
}

function runtimeAst(expression: RuntimeExpression): AST {
  if (expression instanceof AST) {
    return expression;
  }
  if ("typeMap" in expression) {
    return toAst(expression);
  }
  return new AST(protoToExpr(expression.expr), protoToSourceInfo(expression.sourceInfo));
}

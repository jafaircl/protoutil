import { fromJson } from '@bufbuild/protobuf';
import { AST } from '../common/ast/ast.js';
import { Expr, SourceInfoSchema } from '../protogen-exports/index.js';
import { TestAllTypesSchema } from '../protogen-exports/index_conformance_proto3.js';
import { mapType, StringType, variable } from './decls.js';
import { Env, Issues } from './env.js';
import { astToString } from './io.js';
import { ASTOptimizer, OptimizerContext, StaticOptimizer } from './optimizer.js';
import { enableMacroCallTracking, enableOptionalSyntax, types } from './options.js';

describe('optimizer', () => {
  it('TestStaticOptimizerUpdateExpr', () => {
    const expr = `has(a.b)`;
    const inlined = `[x, y].filter(i, i.size() > 0)[0].z`;

    const e = optimizerEnv();
    const exprAST = e.compile(expr);
    if (exprAST instanceof Issues) {
      throw exprAST.err();
    }

    const inlinedAST = e.compile(inlined);
    if (inlinedAST instanceof Issues) {
      throw inlinedAST.err();
    }
    const opt = new StaticOptimizer(new testOptimizer(inlinedAST.nativeRep()));
    const optAST = opt.optimize(e, exprAST);
    if (optAST instanceof Issues) {
      throw optAST.err();
    }
    const sourceInfo = optAST.nativeRep().sourceInfo();
    const sourceInfoPB = sourceInfo.toProto();
    const wantPb = fromJson(SourceInfoSchema, {
      location: '<input>',
      lineOffsets: [9],
      positions: {
        '2': 4,
        '3': 5,
        '4': 3,
      },
      macroCalls: {
        '1': {
          callExpr: {
            function: 'has',
            args: [
              {
                id: '21',
                selectExpr: {
                  operand: {
                    id: '2',
                    callExpr: {
                      function: '_[_]',
                      args: [
                        {
                          id: '3',
                        },
                        {
                          id: '20',
                          constExpr: {
                            int64Value: '0',
                          },
                        },
                      ],
                    },
                  },
                  field: 'z',
                },
              },
            ],
          },
        },
        '3': {
          callExpr: {
            target: {
              id: '4',
              listExpr: {
                elements: [
                  {
                    id: '5',
                    identExpr: {
                      name: 'x',
                    },
                  },
                  {
                    id: '6',
                    identExpr: {
                      name: 'y',
                    },
                  },
                ],
              },
            },
            function: 'filter',
            args: [
              {
                id: '17',
                identExpr: {
                  name: 'i',
                },
              },
              {
                id: '10',
                callExpr: {
                  function: '_>_',
                  args: [
                    {
                      id: '11',
                      callExpr: {
                        target: {
                          id: '12',
                          identExpr: {
                            name: 'i',
                          },
                        },
                        function: 'size',
                      },
                    },
                    {
                      id: '13',
                      constExpr: {
                        int64Value: '0',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    expect(sourceInfoPB).toEqual(wantPb);
    const optString = astToString(optAST);
    expect(optString).toEqual(`has([x, y].filter(i, i.size() > 0)[0].z)`);
  });

  describe('TestStaticOptimizerNewAST', () => {
    const testCases = [
      `[3, 2, 1]`,
      `[1, 2, 3].all(i, i != 0)`,
      // TODO: this test case relies on the unimplemented `bindings` environment option.
      // `cel.bind(m, {"a": 1, "b": 2}, m.filter(k, m[k] > 1))`,
    ];
    for (const tc of testCases) {
      it(`should optimize ${tc}`, () => {
        const e = optimizerEnv();
        const exprAST = e.compile(tc);
        if (exprAST instanceof Issues) {
          throw exprAST.err();
        }
        const opt = new StaticOptimizer(new identityOptimizer());
        const optAST = opt.optimize(e, exprAST);
        if (optAST instanceof Issues) {
          throw optAST.err();
        }
        const optString = astToString(optAST);
        expect(optString).toEqual(tc);
      });
    }
  });
});

class identityOptimizer implements ASTOptimizer {
  optimize(ctx: OptimizerContext, a: AST): AST {
    // The copy method should effectively update all of the old macro refs with new ones that are
    // identical, but renumbered.
    const main = ctx.optimizerExprFactory.copyASTAndMetadata(a);
    // The new AST call will create a parsed expression which will be type-checked by the static
    // optimizer. The input and output expressions should be identical, though may vary by number
    // though.
    return ctx.optimizerExprFactory.newAST(main);
  }
}

class testOptimizer implements ASTOptimizer {
  constructor(private inlineExpr: AST) {}

  optimize(ctx: OptimizerContext, a: AST): AST {
    const copy = ctx.optimizerExprFactory.copyASTAndMetadata(this.inlineExpr);
    const origID = a.expr().id;
    const [presenceTest, hasMacro] = ctx.optimizerExprFactory.newHasMacro(origID, copy);
    const macroKeys = getMacroKeys(ctx.optimizerExprFactory.macroCalls());
    expect(macroKeys.length).toEqual(2);
    ctx.optimizerExprFactory.updateExpr(a.expr(), presenceTest);
    ctx.optimizerExprFactory.setMacroCall(origID, hasMacro);
    return ctx.optimizerExprFactory.newAST(a.expr());
  }
}

function getMacroKeys(macroCalls: Map<bigint, Expr>): number[] {
  let keys = [];
  for (const k of macroCalls.keys()) {
    keys.push(Number(k));
  }
  keys = keys.sort((a, b) => a - b);
  return keys;
}

function optimizerEnv() {
  const e = new Env(
    types(TestAllTypesSchema),
    enableOptionalSyntax(true),
    enableMacroCallTracking(),
    // ext.Bindings(),
    variable('a', mapType(StringType, StringType)),
    variable('x', mapType(StringType, StringType)),
    variable('y', mapType(StringType, StringType))
  );
  return e;
}

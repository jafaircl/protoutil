import { BoolType, DynType, func, IntType, listType, overload, Type, variable } from './decls.js';
import { Env, Issues } from './env.js';
import { ConstantFoldingOptimizer } from './folding.js';
import { InlineVariable, InliningOptimizer } from './inlining.js';
import { astToString } from './io.js';
import { StaticOptimizer } from './optimizer.js';
import { enableMacroCallTracking, enableOptionalSyntax, EnvOption } from './options.js';

interface varExpr {
  name: string;
  alias?: string;
  t: Type;
  expr?: string;
}

describe('inlining', () => {
  describe('TestInliningOptimizer', () => {
    const testCases: {
      expr: string;
      vars: varExpr[];
      inlined: string;
      folded: string;
    }[] = [
      {
        expr: `a || b`,
        vars: [
          {
            name: 'a',
            t: BoolType,
          },
          {
            name: 'b',
            alias: 'bravo',
            t: BoolType,
            expr: `'hello'.contains('lo')`,
          },
        ],
        inlined: `a || "hello".contains("lo")`,
        folded: `true`,
      },
      {
        expr: `a + [a]`,
        vars: [
          {
            name: 'a',
            alias: 'alpha',
            t: DynType,
            expr: `dyn([1, 2])`,
          },
        ],
        inlined: `cel.bind(alpha, dyn([1, 2]), alpha + [alpha])`,
        folded: `[1, 2, [1, 2]]`,
      },
      {
        expr: `a && (a || b)`,
        vars: [
          {
            name: 'a',
            alias: 'alpha',
            t: BoolType,
            expr: `'hello'.contains('lo')`,
          },
          {
            name: 'b',
            t: BoolType,
          },
        ],
        inlined: `cel.bind(alpha, "hello".contains("lo"), alpha && (alpha || b))`,
        folded: `true`,
      },
      {
        expr: `a && b && a`,
        vars: [
          {
            name: 'a',
            alias: 'alpha',
            t: BoolType,
            expr: `'hello'.contains('lo')`,
          },
          {
            name: 'b',
            t: BoolType,
          },
        ],
        inlined: `cel.bind(alpha, "hello".contains("lo"), alpha && b && alpha)`,
        folded: `cel.bind(alpha, true, alpha && b && alpha)`,
      },
      {
        expr: `(c || d) || (a && (a || b))`,
        vars: [
          {
            name: 'a',
            alias: 'alpha',
            t: BoolType,
            expr: `'hello'.contains('lo')`,
          },
          {
            name: 'b',
            t: BoolType,
          },
          {
            name: 'c',
            t: BoolType,
          },
          {
            name: 'd',
            t: BoolType,
            expr: '!false',
          },
        ],
        inlined: `c || !false || cel.bind(alpha, "hello".contains("lo"), alpha && (alpha || b))`,
        folded: `true`,
      },
      {
        expr: `a && (a || b)`,
        vars: [
          {
            name: 'a',
            t: BoolType,
          },
          {
            name: 'b',
            alias: 'bravo',
            t: BoolType,
            expr: `'hello'.contains('lo')`,
          },
        ],
        inlined: `a && (a || "hello".contains("lo"))`,
        folded: `a`,
      },
      {
        expr: `a && b`,
        vars: [
          {
            name: 'a',
            alias: 'alpha',
            t: BoolType,
            expr: `!'hello'.contains('lo')`,
          },
          {
            name: 'b',
            alias: 'bravo',
            t: BoolType,
          },
        ],
        inlined: `!"hello".contains("lo") && b`,
        folded: `false`,
      },
      {
        expr: `operation.system.consumers + operation.destination_consumers`,
        vars: [
          {
            name: 'operation.system',
            t: DynType,
          },
          {
            name: 'operation.destination_consumers',
            t: listType(IntType),
            expr: `productsToConsumers(operation.destination_products)`,
          },
          {
            name: 'operation.destination_products',
            t: listType(IntType),
            expr: `operation.system.products`,
          },
        ],
        inlined: `operation.system.consumers + productsToConsumers(operation.system.products)`,
        folded: `operation.system.consumers + productsToConsumers(operation.system.products)`,
      },
    ];

    for (const tc of testCases) {
      it(`should inline ${tc.expr}`, () => {
        const opts = [
          enableOptionalSyntax(true),
          enableMacroCallTracking(),
          func(
            'productsToConsumers',
            overload('productsToConsumers_list', [listType(IntType)], listType(IntType))
          ),
        ];
        const varDecls: EnvOption[] = [];
        for (const v of tc.vars) {
          varDecls.push(variable(v.name, v.t));
        }
        const e = new Env(...opts, ...varDecls);
        const inlinedVars: InlineVariable[] = [];
        for (const v of tc.vars) {
          if (!v.expr) {
            continue;
          }
          const _checked = e.compile(v.expr);
          if (_checked instanceof Issues) {
            throw _checked.err();
          }
          if (!v.alias) {
            inlinedVars.push(new InlineVariable(v.name, _checked.nativeRep()));
          } else {
            inlinedVars.push(new InlineVariable(v.name, _checked.nativeRep(), v.alias));
          }
        }
        const checked = e.compile(tc.expr);
        if (checked instanceof Issues) {
          throw checked.err();
        }
        let opt = new StaticOptimizer(new InliningOptimizer(...inlinedVars));
        let optimized = opt.optimize(e, checked);
        if (optimized instanceof Issues) {
          throw optimized.err();
        }
        const inlined = astToString(optimized);
        expect(inlined).toEqual(tc.inlined);
        const folder = new ConstantFoldingOptimizer();
        opt = new StaticOptimizer(folder);
        optimized = opt.optimize(e, optimized);
        if (optimized instanceof Issues) {
          throw optimized.err();
        }
        const folded = astToString(optimized);
        expect(folded).toEqual(tc.folded);
      });
    }
  });
});

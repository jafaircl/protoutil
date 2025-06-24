import { createRegistry } from '@bufbuild/protobuf';
import { Checker } from '../../checker/checker.js';
import { Env } from '../../checker/env.js';
import { AllMacros } from '../../parser/macro.js';
import { enableOptionalSyntax, macros, Parser, populateMacroCalls } from '../../parser/parser.js';
import { TestAllTypesSchema } from '../../protogen-exports/index_conformance_proto3.js';
import { Container } from '../container.js';
import { TextSource } from '../source.js';
import { stdFunctions } from '../stdlib.js';
import { Registry } from '../types/provider.js';
import { maxID } from './ast.js';
import {
  baseVisitor,
  matchDescendants,
  matchSubset,
  NavigableExpr,
  postOrderVisit,
  preOrderVisit,
} from './navigable.js';

describe('Navigable', () => {
  describe('TestNavigateAST', () => {
    const testCases = [
      {
        expr: `'a' == 'b'`,
        descendantCount: 3,
        callCount: 1,
        maxDepth: 1,
        maxID: 4n,
      },
      {
        expr: `'a'.size()`,
        descendantCount: 2,
        callCount: 1,
        maxDepth: 1,
        maxID: 3n,
      },
      {
        expr: `[1, 2, 3]`,
        descendantCount: 4,
        callCount: 0,
        maxDepth: 1,
        maxID: 5n,
      },
      {
        expr: `[1, 2, 3][0]`,
        descendantCount: 6,
        callCount: 1,
        maxDepth: 2,
        maxID: 7n,
      },
      {
        expr: `{1u: 'hello'}`,
        descendantCount: 3,
        callCount: 0,
        maxDepth: 1,
        maxID: 5n,
      },
      {
        expr: `{'hello': 'world'}.hello`,
        descendantCount: 4,
        callCount: 0,
        maxDepth: 2,
        maxID: 6n,
      },
      {
        expr: `type(1) == int`,
        descendantCount: 4,
        callCount: 2,
        maxDepth: 2,
        maxID: 5n,
      },
      {
        expr: `cel.expr.conformance.proto3.TestAllTypes{single_int32: 1}`,
        descendantCount: 2,
        callCount: 0,
        maxDepth: 1,
        maxID: 4n,
      },
      {
        expr: `[true].exists(i, i)`,
        descendantCount: 11, // 2 for iter range, 1 for accu init, 4 for loop condition, 3 for loop step, 1 for result
        callCount: 3, // @not_strictly_false(!result), accu_init || i
        maxDepth: 3,
        maxID: 14n,
      },
    ];

    for (const tc of testCases) {
      it(`should navigate AST: ${tc.expr}`, () => {
        const checked = mustTypeCheck(tc.expr);
        const nav = new NavigableExpr(checked);
        const descendants = matchDescendants(nav, () => true);
        expect(descendants.length).toEqual(tc.descendantCount);
        let maxDepth = 0;
        for (const d of descendants) {
          if (d.depth() > maxDepth) {
            maxDepth = d.depth();
          }
        }
        expect(maxDepth).toEqual(tc.maxDepth);
        expect(maxID(checked)).toEqual(tc.maxID);
        const calls = matchSubset(descendants, (e) => e.expr().exprKind.case === 'callExpr');
        expect(calls.length).toEqual(tc.callCount);
      });
    }
  });

  describe('TestExprVisitor', () => {
    const testCases = [
      {
        // [2] ==, [1] 'a', [3] 'b'
        expr: `'a' == 'b'`,
        preOrderIDs: [2n, 1n, 3n],
        postOrderIDs: [1n, 3n, 2n],
      },
      {
        // [2] size(), [1] 'a'
        expr: `'a'.size()`,
        preOrderIDs: [2n, 1n],
        postOrderIDs: [1n, 2n],
      },
      {
        // [3] ==, [1] type(), [2] 1, [4] int
        expr: `type(1) == int`,
        preOrderIDs: [3n, 1n, 2n, 4n],
        postOrderIDs: [2n, 1n, 4n, 3n],
      },
      {
        // [5] .hello, [1] {}, [3] 'hello', [4] 'world'
        expr: `{'hello': 'world'}.hello`,
        preOrderIDs: [5n, 1n, 3n, 4n],
        postOrderIDs: [3n, 4n, 1n, 5n],
      },
      {
        // [1] TestAllTypes, [3] 1
        expr: `cel.expr.conformance.proto3.TestAllTypes{single_int32: 1}`,
        preOrderIDs: [1n, 3n],
        postOrderIDs: [3n, 1n],
      },
      {
        // [13] comprehension
        // range:    [1] [], [2] true
        // accuInit: [6] result=false
        // loopCond: [9] @not_strictly_false, [8] !, [7] result
        // loopStep: [11] ||, [10] result [5] i
        // result:   [12] result
        expr: `[true].exists(i, i)`,
        preOrderIDs: [13n, 1n, 2n, 6n, 9n, 8n, 7n, 11n, 10n, 5n, 12n],
        postOrderIDs: [2n, 1n, 6n, 7n, 8n, 9n, 10n, 5n, 11n, 12n, 13n],
      },
    ];
    for (const tc of testCases) {
      it(`should visit AST in pre-order: ${tc.expr}`, () => {
        const checked = mustTypeCheck(tc.expr);
        const nav = new NavigableExpr(checked);
        const preOrderIDs: bigint[] = [];
        const postOrderIDs: bigint[] = [];
        preOrderVisit(
          nav.expr(),
          new baseVisitor((e) => {
            preOrderIDs.push(e.id);
          })
        );
        postOrderVisit(
          nav.expr(),
          new baseVisitor((e) => {
            postOrderIDs.push(e.id);
          })
        );
        expect(preOrderIDs).toEqual(tc.preOrderIDs);
        expect(postOrderIDs).toEqual(tc.postOrderIDs);
      });
    }
  });
});

function mustTypeCheck(expr: string) {
  const p = new Parser(macros(...AllMacros), enableOptionalSyntax(true), populateMacroCalls(true));
  const exprSrc = new TextSource(expr);
  const parsed = p.parse(exprSrc);
  if (p.errors.length() > 0) {
    throw new Error(p.errors.toDisplayString());
  }
  const reg = new Registry(undefined, createRegistry(TestAllTypesSchema));
  const env = new Env(new Container(), reg, { crossTypeNumericComparisons: true });
  env.addFunctions(...stdFunctions);
  const c = new Checker(env);
  const checked = c.check(parsed);
  if (c.errors.length() > 0) {
    throw new Error(c.errors.toDisplayString());
  }
  return checked;
}

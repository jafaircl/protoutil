import { create, toJsonString } from '@bufbuild/protobuf';
import { ExprSchema } from '../../protogen-exports/index.js';
import { ACCUMULATOR_VAR } from '../constants.js';
import {
  newBoolProtoExpr,
  newBytesProtoExpr,
  newComprehensionProtoExpr,
  newGlobalCallProtoExpr,
  newIdentProtoExpr,
  newIntProtoExpr,
  newListProtoExpr,
  newMapEntryProtoExpr,
  newMapProtoExpr,
  newMessageFieldProtoExpr,
  newMessageProtoExpr,
  newReceiverCallProtoExpr,
  newSelectProtoExpr,
  newStringProtoExpr,
  newUintProtoExpr,
  unwrapCallProtoExpr,
  unwrapComprehensionProtoExpr,
  unwrapListProtoExpr,
  unwrapMapProtoExpr,
  unwrapReceiverCallProtoExpr,
  unwrapSelectProtoExpr,
} from '../pb/expressions.js';
import { IDGenerator, renumberIDs, setExprKindCase } from './expr.js';

describe('expr', () => {
  describe('TestSetKindCase', () => {
    const testCases = [
      create(ExprSchema, { id: 1n }),
      newGlobalCallProtoExpr(1n, '_==_', [newBoolProtoExpr(2n, true), newBoolProtoExpr(3n, false)]),
      newReceiverCallProtoExpr(1n, 'size', newStringProtoExpr(2n, 'hello'), []),
      newComprehensionProtoExpr(12n, {
        iterRange: newListProtoExpr(1n, [], []),
        iterVar: 'i',
        accuVar: '__result__',
        accuInit: newBoolProtoExpr(5n, false),
        loopCondition: newGlobalCallProtoExpr(8n, '@not_strictly_false', [
          newGlobalCallProtoExpr(7n, '!_', [newIdentProtoExpr(6n, ACCUMULATOR_VAR)]),
        ]),
        loopStep: newGlobalCallProtoExpr(10n, '_||_', [
          newIdentProtoExpr(9n, ACCUMULATOR_VAR),
          newIdentProtoExpr(4n, 'i'),
        ]),
        result: newIdentProtoExpr(11n, ACCUMULATOR_VAR),
      }),
      newIdentProtoExpr(1n, 'a'),
      newBytesProtoExpr(1n, new TextEncoder().encode('hello')),
      newListProtoExpr(1n, [newIdentProtoExpr(2n, 'a'), newIdentProtoExpr(3n, 'b')], []),
      newMapProtoExpr(1n, [
        newMapEntryProtoExpr(
          2n,
          newStringProtoExpr(3n, 'string'),
          newGlobalCallProtoExpr(6n, '_?._', [
            newIdentProtoExpr(4n, 'a'),
            newStringProtoExpr(5n, 'b'),
          ])
        ),
      ]),
      newSelectProtoExpr(2n, newIdentProtoExpr(1n, 'a'), 'b'),
      newMessageProtoExpr(1n, 'custom.StructType', [
        newMessageFieldProtoExpr(2n, 'uint_field', newUintProtoExpr(3n, 42n)),
      ]),
    ];
    for (const tc of testCases) {
      it(`should set kind case for ${toJsonString(ExprSchema, tc)}`, () => {
        const expr = create(ExprSchema);
        setExprKindCase(expr, tc);
        expect(expr.exprKind).toEqual(tc.exprKind);
      });
    }
  });

  describe('TestCall', () => {
    const expr = newGlobalCallProtoExpr(1n, 'size', [newStringProtoExpr(2n, 'hello')]);

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(100n));
      expect(expr.id).toEqual(101n);
      expect(unwrapCallProtoExpr(expr)?.args[0].id).toEqual(102n);
    });
  });

  describe('TestMemberCall', () => {
    const expr = newReceiverCallProtoExpr(1n, 'size', newStringProtoExpr(2n, 'hello'), []);

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(100n));
      expect(expr.id).toEqual(101n);
      expect(unwrapReceiverCallProtoExpr(expr)?.target.id).toEqual(102n);
    });
  });

  describe('TestCallNil', () => {
    const expr = newGlobalCallProtoExpr(1n, '', []);

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(100n));
      expect(expr.id).toEqual(101n);
    });
  });

  describe('TestComprehension', () => {
    const expr = newComprehensionProtoExpr(1n, {
      iterRange: newListProtoExpr(2n, [newIntProtoExpr(3n, 1n), newIntProtoExpr(4n, 2n)]),
      iterVar: 'i',
      accuVar: '__result__',
      accuInit: newBoolProtoExpr(5n, false),
      loopCondition: newBoolProtoExpr(6n, true),
      loopStep: newGlobalCallProtoExpr(7n, '_||_', [
        newIdentProtoExpr(8n, ACCUMULATOR_VAR),
        newGlobalCallProtoExpr(9n, '<', [newIdentProtoExpr(10n, 'i'), newIntProtoExpr(11n, 3n)]),
      ]),
      result: newIdentProtoExpr(12n, ACCUMULATOR_VAR),
    });

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(100n));
      expect(expr.id).toEqual(101n);
      const compre = unwrapComprehensionProtoExpr(expr);
      expect(compre?.iterRange?.id).toEqual(102n);
      expect(compre?.accuInit?.id).toEqual(105n);
      expect(compre?.loopCondition?.id).toEqual(106n);
      expect(compre?.loopStep?.id).toEqual(107n);
      expect(compre?.result?.id).toEqual(112n);
    });
  });

  describe('TestComprehensionNil', () => {
    const expr = newComprehensionProtoExpr(1n, {});

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(100n));
      expect(expr.id).toEqual(101n);
    });
  });

  describe('TestIdent', () => {
    const expr = newIdentProtoExpr(1n, 'a');

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(50n));
      expect(expr.id).toEqual(51n);
    });
  });

  describe('TestIdentNil', () => {
    const expr = newIdentProtoExpr(1n, '');

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(50n));
      expect(expr.id).toEqual(51n);
    });
  });

  describe('TestList', () => {
    const expr = newListProtoExpr(20n, [newBoolProtoExpr(21n, true)], [0]);

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(50n));
      expect(expr.id).toEqual(51n);
      expect(unwrapListProtoExpr(expr)?.elements[0].id).toEqual(52n);
    });
  });

  describe('TestListNil', () => {
    const expr = newListProtoExpr(20n, [], []);

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(50n));
      expect(expr.id).toEqual(51n);
    });
  });

  describe('TestMap', () => {
    const expr = newMapProtoExpr(1n, [
      newMapEntryProtoExpr(2n, newIdentProtoExpr(3n, 'a'), newBoolProtoExpr(4n, true), true),
      newMapEntryProtoExpr(5n, newIdentProtoExpr(6n, 'b'), newBoolProtoExpr(7n, false), false),
    ]);

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(50n));
      expect(expr.id).toEqual(51n);
      const map = unwrapMapProtoExpr(expr);
      expect(map?.entries[0].id).toEqual(52n);
      expect(map?.entries[0].keyKind.value?.id).toEqual(53n);
      expect(map?.entries[0].value?.id).toEqual(54n);
      expect(map?.entries[1].id).toEqual(55n);
      expect(map?.entries[1].keyKind.value?.id).toEqual(56n);
      expect(map?.entries[1].value?.id).toEqual(57n);
    });
  });

  describe('TestMapNil', () => {
    const expr = newMapProtoExpr(1n, []);

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(50n));
      expect(expr.id).toEqual(51n);
    });
  });

  describe('TestSelect', () => {
    const expr = newSelectProtoExpr(2n, newIdentProtoExpr(1n, 'operand'), 'field');

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(20n));
      expect(expr.id).toEqual(21n);
      expect(unwrapSelectProtoExpr(expr)?.operand?.id).toEqual(22n);
    });
  });

  describe('TestSelectNil', () => {
    const expr = newSelectProtoExpr(2n, create(ExprSchema), '');

    it('should renumber ids', () => {
      renumberIDs(expr, testIDGen(20n));
      expect(expr.id).toEqual(21n);
    });
  });
});

function testIDGen(seed: bigint): IDGenerator {
  const seen = new Set<bigint>();
  return (originalID) => {
    if (seen.has(originalID)) {
      return originalID;
    }
    seed++;
    seen.add(originalID);
    return seed;
  };
}

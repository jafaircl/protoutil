import { create } from '@bufbuild/protobuf';
import { CheckedExprSchema } from '../protogen/cel/expr/checked_pb.js';
import { ExprSchema } from '../protogen/cel/expr/syntax_pb.js';
import { AST, CheckedAST, newFunctionReference, newIdentReference, SourceInfo } from './ast.js';
import { checkedExprToAST, toCheckedExprProto } from './conversion.js';
import { LOGICAL_NOT_OVERLOAD } from './overloads.js';
import { BoolProtoType, DynProtoType } from './pb/types.js';
import { InfoSource } from './source.js';
import { BoolRefVal } from './types/bool.js';
import { BoolType, DynType } from './types/types.js';

describe('conversion', () => {
  const astTests = [
    {
      cel: new CheckedAST(
        new AST(create(ExprSchema), new SourceInfo(new InfoSource(), '', '', [], 0, 0)),
        new Map([
          [BigInt(1), BoolType],
          [BigInt(2), DynType],
        ]),
        new Map([
          [BigInt(1), newFunctionReference(LOGICAL_NOT_OVERLOAD)],
          [BigInt(2), newIdentReference('TRUE', BoolRefVal.True)],
        ])
      ),
      pb: create(CheckedExprSchema, {
        expr: {},
        sourceInfo: {},
        typeMap: {
          '1': BoolProtoType,
          '2': DynProtoType,
        },
        referenceMap: {
          '1': {
            overloadId: [LOGICAL_NOT_OVERLOAD],
          },
          '2': {
            name: 'TRUE',
            value: {
              constantKind: {
                case: 'boolValue',
                value: true,
              },
            },
            overloadId: [],
          },
        },
      }),
    },
  ];
  for (const tc of astTests) {
    it('should convert to proto', () => {
      expect(toCheckedExprProto(tc.cel)).toStrictEqual(tc.pb);
    });
    it('should convert to AST', () => {
      expect(checkedExprToAST(tc.pb)).toStrictEqual(tc.cel);
    });
  }

  // TODO: more conversion tests
});

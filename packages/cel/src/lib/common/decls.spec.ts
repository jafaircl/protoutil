import {
  binaryBinding,
  functionBinding,
  FunctionDecl,
  lateFunctionBinding,
  OverloadDecl,
  singletonUnaryBinding,
  unaryBinding,
} from './decls.js';
import { Sizer } from './types/traits/sizer.js';
import { AnyType, BoolType, IntType, newListType, newTypeParamType } from './types/types.js';

describe('decls', () => {
  it('should check', () => {
    expect(true).toBe(true);
  });

  it('function bindings', () => {
    const sizeFunc = new FunctionDecl({
      name: 'size',
      overloads: [
        new OverloadDecl({
          id: 'list_size',
          argTypes: [newListType(newTypeParamType('T'))],
          resultType: IntType,
          isMemberFunction: true,
        }),
      ],
    });
    let bindings = sizeFunc.bindings();
    expect(bindings.length).toEqual(0);

    const sizeFuncDef = new FunctionDecl({
      name: 'size',
      overloads: [
        new OverloadDecl({
          id: 'list_size',
          argTypes: [newListType(newTypeParamType('T'))],
          resultType: IntType,
          isMemberFunction: true,
          unaryOp: (v: unknown) => (v as Sizer).size(),
        }),
      ],
    });
    const sizeMerged = sizeFunc.merge(sizeFuncDef);
    bindings = sizeMerged.bindings();
    expect(bindings.length).toEqual(3);
  });

  describe('TestSingletonOverloadLateBindingCollision', () => {
    it('should fail', () => {
      let fn = new FunctionDecl({
        name: 'id',
        overloads: [
          new OverloadDecl({
            id: 'id_any',
            argTypes: [newTypeParamType('any')],
            resultType: newTypeParamType('any'),
            hasLateBinding: true,
          }),
        ],
      });
      fn = singletonUnaryBinding((arg) => arg)(fn);
      expect(() => fn.bindings()).toThrow('incompatible with late bindings');
    });
  });

  describe('TestOverloadFunctionLateBinding', () => {
    it('should set the late binding property', () => {
      const f = new FunctionDecl({
        name: 'id',
        overloads: [
          new OverloadDecl({
            id: 'id_bool',
            argTypes: [newTypeParamType('bool')],
            resultType: newTypeParamType('any'),
            hasLateBinding: true,
          }),
        ],
      });
      expect(f.overloadDecls().length).toEqual(1);
      expect(f.overloadDecls()[0].hasLateBinding()).toBeTruthy();
    });
  });

  describe('TestOverloadFunctionMixLateAndNonLateBinding', () => {
    it('should throw', () => {
      expect(() => {
        new FunctionDecl({
          name: 'id',
          overloads: [
            new OverloadDecl({
              id: 'id_bool',
              argTypes: [BoolType],
              resultType: AnyType,
              hasLateBinding: true,
            }),
            new OverloadDecl({
              id: 'id_int',
              argTypes: [IntType],
              resultType: AnyType,
            }),
          ],
        });
      }).toThrow('cannot mix late and non-late bindings');
    });
  });

  describe('TestOverloadFunctionBindingWithLateBinding', () => {
    it('should throw', () => {
      let o = new OverloadDecl({
        id: 'id_bool',
        argTypes: [BoolType],
        resultType: AnyType,
        functionOp: (v) => v,
      });
      expect(() => (o = lateFunctionBinding()(o))).toThrow('already has a binding');
    });
  });

  describe('TestOverloadFunctionLateBindingWithBinding', () => {
    it('should throw if trying to add a new binding', () => {
      expect(() => {
        functionBinding((v) => v)(
          new OverloadDecl({
            id: 'id_bool',
            argTypes: [BoolType],
            resultType: AnyType,
            hasLateBinding: true,
          })
        );
      }).toThrow('already has a late binding');
      expect(() => {
        unaryBinding((v) => v)(
          new OverloadDecl({
            id: 'id_bool',
            argTypes: [BoolType],
            resultType: AnyType,
            hasLateBinding: true,
          })
        );
      }).toThrow('already has a late binding');
      expect(() => {
        binaryBinding((v) => v)(
          new OverloadDecl({
            id: 'id_bool',
            argTypes: [BoolType, BoolType],
            resultType: AnyType,
            hasLateBinding: true,
          })
        );
      }).toThrow('already has a late binding');
    });
  });

  // TODO: more decl tests
});

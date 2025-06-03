import { FunctionDecl, OverloadDecl } from './decls.js';
import { Sizer } from './types/traits/sizer.js';
import { IntType, newListType, newTypeParamType } from './types/types.js';

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

  // TODO: more decl tests
});

import { Container } from '../common/container.js';
import { FunctionDecl, OverloadDecl, VariableDecl } from '../common/decls.js';
import { stdFunctions, stdTypes } from '../common/stdlib.js';
import { Registry } from '../common/types/provider.js';
import { BoolType, DynType, TypeType } from '../common/types/types.js';
import { Env } from './env.js';

describe('Env - checker', () => {
  it('overlapping identifier', () => {
    const env = standardCheckerEnv();
    const errs = env.addIdents(new VariableDecl('int', TypeType));
    expect(errs).not.toBeNull();
    expect(errs?.message).toContain('overlapping identifier');
  });

  it('overlapping macro', () => {
    const env = standardCheckerEnv();
    const errs = env.addFunctions(
      new FunctionDecl({
        name: 'has',
        overloads: [
          new OverloadDecl({
            id: 'has',
            isMemberFunction: false,
            argTypes: [DynType],
            resultType: BoolType,
          }),
        ],
      })
    );
    expect(errs).not.toBeNull();
    expect(errs?.message).toEqual(`overlapping macro for name 'has' with 1 args`);
  });
});

function standardCheckerEnv() {
  const container = new Container();
  const provider = new Registry();
  const env = new Env(container, provider);
  env.addIdents(...stdTypes);
  env.addFunctions(...stdFunctions);
  return env;
}

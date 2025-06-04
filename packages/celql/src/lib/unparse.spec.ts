import { Issues } from '@protoutil/cel';
import { DefaultDialect } from './default/dialect.js';
import { DefaultEnv } from './default/env.js';
import { unparse } from './unparse.js';

describe('unparse', () => {
  it('should throw an error if the expression is not checked', () => {
    const env = new DefaultEnv();
    const parsed = env.parse('1 + 1 == 2');
    if (parsed instanceof Issues) {
      throw parsed.err();
    }
    expect(() => unparse(parsed, new DefaultDialect())).toThrow(
      'expression must be checked before unparse'
    );
  });
});

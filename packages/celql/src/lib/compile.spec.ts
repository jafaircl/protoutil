import { Ast } from '@bearclaw/cel';
import { compile } from './compile.js';
import { DefaultEnv } from './default/env.js';
import { formatError } from './test-helpers.js';

describe('compile', () => {
  it('should return a CEL Ast if the expression compiles', () => {
    const env = new DefaultEnv();
    expect(compile('true', env)).toBeInstanceOf(Ast);
  });

  it('should error if the expression does not compile', () => {
    const env = new DefaultEnv();
    expect(() => compile('1 +', env)).toThrow(
      formatError(`ERROR: <input>:1:4: Syntax error: mismatched input '<EOF>' expecting {'[', '{', '(', '.', '-', '!', 'true', 'false', 'null', NUM_FLOAT, NUM_INT, NUM_UINT, STRING, BYTES, IDENTIFIER}
     | 1 +
     | ...^`)
    );
  });

  it('should error if the expression does not evaluate to a boolean', () => {
    const env = new DefaultEnv();
    expect(() => compile('1 + 2', env)).toThrow(
      formatError(`ERROR: <input>:1:3: expression must evaluate to a boolean value
     | 1 + 2
     | ..^`)
    );
  });
});

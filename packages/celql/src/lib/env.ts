import { CustomEnv, eagerlyValidateDeclarations, EnvOption } from '@bearclaw/cel';
import { SqlLib } from './library.js';

let sqlEnv: CustomEnv | null = null;

/**
 * getSqlEnv lazy initializes the SQL CEL environment.
 */
function getSqlEnv() {
  if (!sqlEnv) {
    sqlEnv = new CustomEnv(SqlLib(), eagerlyValidateDeclarations(true));
  }
  return sqlEnv;
}

export class SqlEnv extends CustomEnv {
  constructor(...opts: EnvOption[]) {
    super();
    // Extend the statically configured SQL environment, disabling eager
    // validation to ensure the cost of setup for the environment is still just
    // as cheap as it is in v0.11.x and earlier releases. The user provided
    // options can easily re-enable the eager validation as they are processed
    // after this default option.
    const stdOpts: EnvOption[] = [eagerlyValidateDeclarations(false), ...opts];
    const env = getSqlEnv();
    return env.extend(...stdOpts);
  }
}

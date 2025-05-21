import { CustomEnv, eagerlyValidateDeclarations, EnvOption } from '@bearclaw/cel';
import { SqlLib } from './library.js';

let celqlEnv: CustomEnv | null = null;

/**
 * getCelqlEnv lazy initializes the SQL CEL environment.
 */
function getCelqlEnv() {
  if (!celqlEnv) {
    celqlEnv = new CustomEnv(SqlLib(), eagerlyValidateDeclarations(true));
  }
  return celqlEnv;
}

export class CelqlEnv extends CustomEnv {
  constructor(...opts: EnvOption[]) {
    super();
    // Extend the statically configured SQL environment, disabling eager
    // validation to ensure the cost of setup for the environment is still just
    // as cheap as it is in v0.11.x and earlier releases. The user provided
    // options can easily re-enable the eager validation as they are processed
    // after this default option.
    const stdOpts: EnvOption[] = [eagerlyValidateDeclarations(false), ...opts];
    const env = getCelqlEnv();
    return env.extend(...stdOpts);
  }
}

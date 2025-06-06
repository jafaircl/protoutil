import { CustomEnv, eagerlyValidateDeclarations, EnvOption } from '@protoutil/cel';
import { DefaultLib } from './library.js';

let defaultEnv: CustomEnv | null = null;

/**
 * getDefaultEnv lazy initializes the SQL CEL environment.
 */
function getDefaultEnv() {
  if (!defaultEnv) {
    defaultEnv = new CustomEnv(DefaultLib(), eagerlyValidateDeclarations(true));
  }
  return defaultEnv;
}

export class DefaultEnv extends CustomEnv {
  constructor(...opts: EnvOption[]) {
    super();
    // Extend the statically configured SQL environment, disabling eager
    // validation to ensure the cost of setup for the environment is still just
    // as cheap as it is in v0.11.x and earlier releases. The user provided
    // options can easily re-enable the eager validation as they are processed
    // after this default option.
    const stdOpts: EnvOption[] = [eagerlyValidateDeclarations(false), ...opts];
    const env = getDefaultEnv();
    return env.extend(...stdOpts);
  }
}

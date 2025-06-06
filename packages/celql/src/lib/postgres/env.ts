import { CustomEnv, eagerlyValidateDeclarations, EnvOption } from '@protoutil/cel';
import { PostgresLib } from './library.js';

let postgresEnv: CustomEnv | null = null;

/**
 * getPostgresEnv lazy initializes the PostgreSQL CEL environment.
 */
function getPostgresEnv() {
  if (!postgresEnv) {
    postgresEnv = new CustomEnv(PostgresLib(), eagerlyValidateDeclarations(true));
  }
  return postgresEnv;
}

export class PostgresEnv extends CustomEnv {
  constructor(...opts: EnvOption[]) {
    super();
    // Extend the statically configured SQL environment, disabling eager
    // validation to ensure the cost of setup for the environment is still just
    // as cheap as it is in v0.11.x and earlier releases. The user provided
    // options can easily re-enable the eager validation as they are processed
    // after this default option.
    const stdOpts: EnvOption[] = [eagerlyValidateDeclarations(false), ...opts];
    const env = getPostgresEnv();
    return env.extend(...stdOpts);
  }
}

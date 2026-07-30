import type { EnvOptions } from "../cel/env.js";
import type { Config } from "../common/env/env.js";

/**
 * fromConfig configures a CEL policy environment from a serializable config.
 *
 * The core TypeScript environment resolves all registered declarative extensions
 * through its configuration option maps.
 */
export function fromConfig(config: Config): EnvOptions {
  return { configuration: { config } };
}

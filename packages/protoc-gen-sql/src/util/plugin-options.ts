export type Engine = "postgres" | "mysql" | "sqlite" | "sqlserver";

export type RepeatedStrategy = "json_column" | "array_column";
export type OneofStrategy = "nullable_columns" | "type_column" | "json_column";

export interface PluginOptions {
  engine: Engine;
  repeatedStrategy: RepeatedStrategy;
  oneofStrategy: OneofStrategy;
  // Emit CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS. Default: true.
  // Set to false only if your migration tooling manages existence checks itself.
  ifNotExists: boolean;
  // Emit CREATE SCHEMA IF NOT EXISTS at the top of schema.sql.
  // Only meaningful for postgres and sqlserver. Default: false.
  emitCreateSchema: boolean;
}

export const VALID_ENGINES = new Set<Engine>(["postgres", "mysql", "sqlite", "sqlserver"]);
const VALID_REPEATED_STRATEGIES = new Set<RepeatedStrategy>(["json_column", "array_column"]);
const VALID_ONEOF_STRATEGIES = new Set<OneofStrategy>([
  "nullable_columns",
  "type_column",
  "json_column",
]);

export function parseOptions(rawOptions: { key: string; value: string }[]): PluginOptions {
  const opts: Partial<PluginOptions> = {};

  for (const { key, value } of rawOptions) {
    switch (key) {
      case "engine": {
        if (!VALID_ENGINES.has(value as Engine)) {
          throw new Error(
            `Unknown engine "${value}". Valid engines: ${[...VALID_ENGINES].join(", ")}`,
          );
        }
        opts.engine = value as Engine;
        break;
      }
      case "repeated_strategy": {
        if (!VALID_REPEATED_STRATEGIES.has(value as RepeatedStrategy)) {
          throw new Error(
            `Unknown repeated_strategy "${value}". Valid values: ${[...VALID_REPEATED_STRATEGIES].join(", ")}`,
          );
        }
        opts.repeatedStrategy = value as RepeatedStrategy;
        break;
      }
      case "oneof_strategy": {
        if (!VALID_ONEOF_STRATEGIES.has(value as OneofStrategy)) {
          throw new Error(
            `Unknown oneof_strategy "${value}". Valid values: ${[...VALID_ONEOF_STRATEGIES].join(", ")}`,
          );
        }
        opts.oneofStrategy = value as OneofStrategy;
        break;
      }
      case "if_not_exists": {
        if (value !== "true" && value !== "false") {
          throw new Error(
            `Invalid value "${value}" for if_not_exists. Expected "true" or "false".`,
          );
        }
        opts.ifNotExists = value === "true";
        break;
      }
      case "emit_create_schema": {
        if (value !== "true" && value !== "false") {
          throw new Error(
            `Invalid value "${value}" for emit_create_schema. Expected "true" or "false".`,
          );
        }
        opts.emitCreateSchema = value === "true";
        break;
      }
      default:
        throw new Error(`Unknown plugin option "${key}"`);
    }
  }

  if (!opts.engine) {
    throw new Error(
      `Plugin option "engine" is required. Valid engines: ${[...VALID_ENGINES].join(", ")}`,
    );
  }

  return {
    engine: opts.engine,
    repeatedStrategy: opts.repeatedStrategy ?? "json_column",
    oneofStrategy: opts.oneofStrategy ?? "nullable_columns",
    ifNotExists: opts.ifNotExists ?? true,
    emitCreateSchema: opts.emitCreateSchema ?? false,
  };
}

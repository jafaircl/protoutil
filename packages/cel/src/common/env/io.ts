import { dump, load } from "js-yaml";
import { type Config, hydrateConfig, parseTypeDesc, serializeConfig } from "./env.js";

/**
 * ConfigFromYAML returns a config from YAML source.
 *
 * Adds custom parsing logic for normalizing shorthand for specifying some fields
 * in a YAML document (mainly the type-specifier shorthand).
 */
export function configFromYAML(data: string | Uint8Array): Config {
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return hydrateConfig(JSON.parse(text));
  }
  return hydrateConfig(load(text));
}

/**
 * ConfigToYAML converts a config into its YAML representation using structured type nodes.
 */
export function configToYAML(config: Config): string {
  return dump(serializeConfig(config), {
    noCompatMode: true,
    lineWidth: -1,
    noRefs: true,
  });
}

export { parseTypeDesc };

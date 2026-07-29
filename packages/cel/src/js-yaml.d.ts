/**
 * Minimal browser-safe declarations for the js-yaml surface used by policy parsing.
 */
declare module "js-yaml" {
  /** LoadOptions configures YAML document decoding. */
  export interface LoadOptions {
    /** json permits duplicate mapping keys with the last value winning. */
    json?: boolean;
  }

  /** load decodes one YAML document into JavaScript values. */
  export function load(source: string, options?: LoadOptions): unknown;

  /** DumpOptions configures YAML serialization. */
  export interface DumpOptions {
    /** noCompatMode disables YAML 1.1 compatibility quoting. */
    noCompatMode?: boolean;
    /** lineWidth limits emitted line length, with negative values disabling wrapping. */
    lineWidth?: number;
    /** noRefs disables aliases for repeated object references. */
    noRefs?: boolean;
  }

  /** dump serializes a JavaScript value as YAML. */
  export function dump(value: unknown, options?: DumpOptions): string;
}

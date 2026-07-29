import type { Library } from "../cel/library.js";
import { Extension } from "../common/env/env.js";
import { bindings } from "./bindings.js";
import { twoVarComprehensions } from "./comprehensions.js";
import { encoders } from "./encoders.js";
import { lists } from "./lists.js";
import { math } from "./math.js";
import { regex } from "./regex.js";
import { sets } from "./sets.js";
import { strings } from "./strings.js";

/**
 * extensionOptionFactory converts a serializable extension configuration to a CEL library.
 */
export function extensionOptionFactory(configElement: unknown): [Library | undefined, boolean] {
  if (!(configElement instanceof Extension)) {
    return [undefined, false];
  }
  const name = extensionName(configElement.name);
  if (name === undefined) {
    return [undefined, false];
  }
  let version: number;
  try {
    version = configElement.versionNumber();
  } catch {
    throw new Error(`invalid extension version: ${configElement.name} - ${configElement.version}`);
  }
  switch (name) {
    case "cel.lib.ext.cel.bindings":
      return [bindings({ version }), true];
    case "cel.lib.ext.encoders":
      return [encoders({ version }), true];
    case "cel.lib.ext.lists":
      return [lists({ version }), true];
    case "cel.lib.ext.math":
      return [math({ version }), true];
    case "cel.lib.ext.sets":
      return [sets({ version }), true];
    case "cel.lib.ext.strings":
      return [strings({ version }), true];
    case "cel.lib.ext.comprev2":
      return [twoVarComprehensions({ version }), true];
    case "cel.lib.ext.regex":
      return [regex({ version }), true];
  }
  return [undefined, false];
}

/**
 * extensionName resolves supported short aliases to singleton library names.
 */
function extensionName(name: string): string | undefined {
  switch (name) {
    case "bindings":
      return "cel.lib.ext.cel.bindings";
    case "encoders":
      return "cel.lib.ext.encoders";
    case "lists":
      return "cel.lib.ext.lists";
    case "math":
      return "cel.lib.ext.math";
    case "sets":
      return "cel.lib.ext.sets";
    case "strings":
      return "cel.lib.ext.strings";
    case "two-var-comprehensions":
      return "cel.lib.ext.comprev2";
    case "regex":
      return "cel.lib.ext.regex";
    case "cel.lib.ext.cel.bindings":
    case "cel.lib.ext.encoders":
    case "cel.lib.ext.lists":
    case "cel.lib.ext.math":
    case "cel.lib.ext.sets":
    case "cel.lib.ext.strings":
    case "cel.lib.ext.comprev2":
    case "cel.lib.ext.regex":
      return name;
    default:
      return undefined;
  }
}

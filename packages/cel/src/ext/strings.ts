import type { LibraryAliaser, LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import {
  type AstNode,
  CallEstimate,
  type CostEstimator,
  type FunctionEstimator,
  fixedSizeEstimate,
  sizeEstimate,
} from "../checker/cost.js";
import { functionDecl, memberOverload, overload } from "../common/decls.js";
import { Bool } from "../common/types/bool.js";
import { Bytes } from "../common/types/bytes.js";
import { Double } from "../common/types/double.js";
import { err } from "../common/types/err.js";
import { Int } from "../common/types/int.js";
import { stringList } from "../common/types/list.js";
import { NullValue } from "../common/types/null.js";
import { DefaultTypeAdapter } from "../common/types/provider.js";
import type { Val } from "../common/types/ref/index.js";
import { String as CelString } from "../common/types/string.js";
import type { Lister, Mapper } from "../common/types/traits/index.js";
import {
  DurationType,
  DynType,
  IntType,
  listType,
  StringType,
  TimestampType,
} from "../common/types/types.js";
import { Uint } from "../common/types/uint.js";
import type { FunctionTracker } from "../interpreter/runtime-cost.js";

/** defaultPrecision is used by fixed-point and scientific format clauses. */
const defaultPrecision = 6;
/** stringCostFactor charges one traversal unit per ten Unicode code points. */
const stringCostFactor = 0.1;

/**
 * StringsOptions configures the string manipulation extension library.
 */
export interface StringsOptions {
  /** locale configures legacy formatting before version four. */
  readonly locale?: string;
  /** maxPrecision limits explicit floating-point precision. */
  readonly maxPrecision?: number;
  /** version limits the library to functions introduced at or below this version. */
  readonly version?: number;
}

/** StringsLibrary describes the singleton string extension and serialization metadata. */
export type StringsLibrary = SingletonLibrary & LibraryAliaser & LibraryVersioner;

/**
 * strings configures extended functions for string manipulation.
 *
 * All indices are zero-based Unicode code-point positions. Version one adds
 * formatting and quoting, and version three adds string reversal.
 */
export function strings(options: StringsOptions = {}): StringsLibrary {
  const version = options.version ?? Number.MAX_SAFE_INTEGER;
  if (
    version < 4 &&
    options.locale !== undefined &&
    !["en_US", "fr_FR", "nl_NL"].includes(options.locale)
  ) {
    throw new Error(`failed to parse locale: language: subtag "locale" is well-formed but unknown`);
  }
  const functions = [
    functionDecl("charAt", {
      overloads: [
        memberOverload("string_char_at_int", [StringType, IntType], StringType, {
          binaryBinding: (text, index) => charAt(text, index),
        }),
      ],
    }),
    functionDecl("indexOf", {
      overloads: [
        memberOverload("string_index_of_string", [StringType, StringType], IntType, {
          binaryBinding: (text, search) => indexOf({ offset: new Int(0n), search, text }),
        }),
        memberOverload("string_index_of_string_int", [StringType, StringType, IntType], IntType, {
          functionBinding: (...args) =>
            indexOf({ offset: args[2]!, search: args[1]!, text: args[0]! }),
        }),
      ],
    }),
    functionDecl("lastIndexOf", {
      overloads: [
        memberOverload("string_last_index_of_string", [StringType, StringType], IntType, {
          binaryBinding: lastIndexOf,
        }),
        memberOverload(
          "string_last_index_of_string_int",
          [StringType, StringType, IntType],
          IntType,
          {
            functionBinding: (...args) =>
              lastIndexOf({ offset: args[2]!, search: args[1]!, text: args[0]! }),
          },
        ),
      ],
    }),
    functionDecl("lowerAscii", {
      overloads: [
        memberOverload("string_lower_ascii", [StringType], StringType, {
          unaryBinding: (text) => asciiCase(text, "lower"),
        }),
      ],
    }),
    functionDecl("replace", {
      overloads: [
        memberOverload(
          "string_replace_string_string",
          [StringType, StringType, StringType],
          StringType,
          {
            functionBinding: (...args) =>
              replace({
                limit: -1,
                replacement: args[2]!,
                search: args[1]!,
                text: args[0]!,
              }),
          },
        ),
        memberOverload(
          "string_replace_string_string_int",
          [StringType, StringType, StringType, IntType],
          StringType,
          {
            functionBinding: (...args) =>
              replace({
                limit: Number((args[3] as Int).value()),
                replacement: args[2]!,
                search: args[1]!,
                text: args[0]!,
              }),
          },
        ),
      ],
    }),
    functionDecl("split", {
      overloads: [
        memberOverload("string_split_string", [StringType, StringType], listType(StringType), {
          binaryBinding: (text, separator) => split({ limit: -1, separator, text }),
        }),
        memberOverload(
          "string_split_string_int",
          [StringType, StringType, IntType],
          listType(StringType),
          {
            functionBinding: (...args) =>
              split({
                limit: Number((args[2] as Int).value()),
                separator: args[1]!,
                text: args[0]!,
              }),
          },
        ),
      ],
    }),
    functionDecl("substring", {
      overloads: [
        memberOverload("string_substring_int", [StringType, IntType], StringType, {
          binaryBinding: (text, start) => substring({ start, text }),
        }),
        memberOverload("string_substring_int_int", [StringType, IntType, IntType], StringType, {
          functionBinding: (...args) =>
            substring({ end: args[2]!, start: args[1]!, text: args[0]! }),
        }),
      ],
    }),
    functionDecl("trim", {
      overloads: [
        memberOverload("string_trim", [StringType], StringType, {
          unaryBinding: trimSpace,
        }),
      ],
    }),
    functionDecl("upperAscii", {
      overloads: [
        memberOverload("string_upper_ascii", [StringType], StringType, {
          unaryBinding: (text) => asciiCase(text, "upper"),
        }),
      ],
    }),
    functionDecl("join", {
      overloads: [
        memberOverload("list_join", [listType(StringType)], StringType, {
          unaryBinding: (list) => join(list, ""),
        }),
        memberOverload("list_join_string", [listType(StringType), StringType], StringType, {
          binaryBinding: (list, separator) => join(list, (separator as CelString).value()),
        }),
      ],
    }),
  ];

  if (version >= 1) {
    functions.push(
      functionDecl("format", {
        overloads: [
          memberOverload("string_format", [StringType, listType(DynType)], StringType, {
            binaryBinding: (format, args) =>
              formatString({
                args,
                format,
                legacy: version < 4,
                locale: options.locale,
                maxPrecision:
                  options.maxPrecision ?? (version >= 5 ? 100 : Number.MAX_SAFE_INTEGER),
              }),
          }),
        ],
      }),
      functionDecl("strings.quote", {
        overloads: [
          overload("strings_quote", [StringType], StringType, {
            unaryBinding: quote,
          }),
        ],
      }),
    );
  }
  if (version >= 3) {
    functions.push(
      functionDecl("reverse", {
        overloads: [
          memberOverload("string_reverse", [StringType], StringType, {
            unaryBinding: (text) =>
              new CelString(
                Array.from((text as CelString).value())
                  .reverse()
                  .join(""),
              ),
          }),
        ],
      }),
    );
  }

  return {
    libraryAlias: "strings",
    libraryName: "cel.lib.ext.strings",
    libraryVersion: version,
    compileOptions: {
      functions,
      cost: {
        overloadCostEstimates: stringCostEstimators(),
      },
    },
    programOptions: {
      costTracking: {
        overloadTrackers: stringCostTrackers(),
      },
    },
  };
}

/**
 * stringCostEstimators returns checker cost functions for every string extension overload.
 */
function stringCostEstimators(): Record<string, FunctionEstimator> {
  return {
    string_char_at_int: estimateCharAtCost,
    string_index_of_string: estimateSearchCost,
    string_index_of_string_int: estimateSearchCost,
    string_last_index_of_string: estimateSearchCost,
    string_last_index_of_string_int: estimateSearchCost,
    string_lower_ascii: estimateFixedTransformCost,
    string_upper_ascii: estimateFixedTransformCost,
    string_replace_string_string: estimateReplaceCost,
    string_replace_string_string_int: estimateReplaceCost,
    string_split_string: estimateSplitCost,
    string_split_string_int: estimateSplitCost,
    string_substring_int: estimateSubstringCost,
    string_substring_int_int: estimateSubstringCost,
    string_trim: estimateVariableTransformCost,
    string_reverse: estimateFixedTransformCost,
    list_join: estimateJoinCost,
    list_join_string: estimateJoinCost,
  };
}

/**
 * stringCostTrackers returns runtime trackers for every string extension overload.
 */
function stringCostTrackers(): Record<string, FunctionTracker> {
  const transform: FunctionTracker = { cost: trackTransformCost };
  const search: FunctionTracker = { cost: trackSearchCost };
  const replaceTracker: FunctionTracker = { cost: trackReplaceCost };
  const splitTracker: FunctionTracker = { cost: trackSplitCost };
  const joinTracker: FunctionTracker = { cost: trackJoinCost };
  return {
    string_char_at_int: { cost: trackCharAtCost },
    string_index_of_string: search,
    string_index_of_string_int: search,
    string_last_index_of_string: search,
    string_last_index_of_string_int: search,
    string_lower_ascii: transform,
    string_upper_ascii: transform,
    string_replace_string_string: replaceTracker,
    string_replace_string_string_int: replaceTracker,
    string_split_string: splitTracker,
    string_split_string_int: splitTracker,
    string_substring_int: transform,
    string_substring_int_int: transform,
    string_trim: transform,
    string_reverse: transform,
    list_join: joinTracker,
    list_join_string: joinTracker,
  };
}

/** estimateFixedTransformCost estimates O(n) transforms with fixed output size. */
function estimateFixedTransformCost(
  estimator: CostEstimator,
  target: AstNode | undefined,
): CallEstimate | undefined {
  if (!target) {
    return undefined;
  }
  const size = stringNodeSize(estimator, target);
  const scan = scanBounds(size);
  return new CallEstimate(scan[0] + 1n + size.Min, scan[1] + 1n + size.Max, size);
}

/** estimateVariableTransformCost estimates O(n) transforms with variable output size. */
function estimateVariableTransformCost(
  estimator: CostEstimator,
  target: AstNode | undefined,
): CallEstimate | undefined {
  if (!target) {
    return undefined;
  }
  const input = stringNodeSize(estimator, target);
  const result = sizeEstimate(0n, input.Max);
  const scan = scanBounds(input);
  return new CallEstimate(scan[0] + 1n, scan[1] + 1n + result.Max, result);
}

/** estimateCharAtCost estimates traversal plus one-character allocation. */
function estimateCharAtCost(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target || args.length !== 1) {
    return undefined;
  }
  const scan = scanBounds(stringNodeSize(estimator, target));
  return new CallEstimate(scan[0] + 2n, scan[1] + 2n, sizeEstimate(0n, 1n));
}

/** estimateSearchCost estimates target-by-needle scanning. */
function estimateSearchCost(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target || args.length < 1) {
    return undefined;
  }
  const targetSize = stringNodeSize(estimator, target);
  const needleSize = stringNodeSize(estimator, args[0]!);
  const search = targetSize.multiply(needleSize).multiplyByCostFactor(stringCostFactor);
  return new CallEstimate(search.Min + 1n, search.Max + 1n);
}

/** estimateReplaceCost estimates searching and maximum replacement growth. */
function estimateReplaceCost(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target || args.length < 2) {
    return undefined;
  }
  const targetSize = atLeastOne(stringNodeSize(estimator, target));
  const needleSize = atLeastOne(stringNodeSize(estimator, args[0]!));
  const replacement = stringNodeSize(estimator, args[1]!).add(fixedSizeEstimate(1));
  const search = targetSize.multiply(needleSize).multiplyByCostFactor(stringCostFactor);
  const result = sizeEstimate(
    targetSize.Min < replacement.Min ? targetSize.Min : replacement.Min,
    (targetSize.Max + 1n) * replacement.Max,
  );
  return new CallEstimate(search.Min + result.Min + 1n, search.Max + result.Max + 1n, result);
}

/** estimateSplitCost estimates traversal and list allocation. */
function estimateSplitCost(
  estimator: CostEstimator,
  target: AstNode | undefined,
): CallEstimate | undefined {
  if (!target) {
    return undefined;
  }
  const targetSize = stringNodeSize(estimator, target);
  const traversal = targetSize.add(fixedSizeEstimate(1)).multiplyByCostFactor(stringCostFactor);
  const result = sizeEstimate(0n, targetSize.Max);
  return new CallEstimate(traversal.Min + 11n, traversal.Max + result.Max + 11n, result);
}

/** estimateSubstringCost estimates traversal and statically selected result length. */
function estimateSubstringCost(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target || args.length < 1 || args.length > 2) {
    return undefined;
  }
  const targetSize = stringNodeSize(estimator, target);
  const start = literalInt(args[0]) ?? 0n;
  const end = args.length === 2 ? (literalInt(args[1]) ?? targetSize.Max) : targetSize.Max;
  const result = fixedSizeEstimate(end - start);
  const scan = scanBounds(targetSize);
  return new CallEstimate(scan[0] + result.Min + 1n, scan[1] + result.Max + 1n, result);
}

/** estimateJoinCost estimates list traversal, separators, and result allocation. */
function estimateJoinCost(
  estimator: CostEstimator,
  target: AstNode | undefined,
  args: AstNode[],
): CallEstimate | undefined {
  if (!target) {
    return undefined;
  }
  const targetSize = stringNodeSize(estimator, target);
  const separator = args.length === 0 ? fixedSizeEstimate(0) : stringNodeSize(estimator, args[0]!);
  const traversal = targetSize.add(fixedSizeEstimate(1)).multiplyByCostFactor(stringCostFactor);
  const result = sizeEstimate(0n, targetSize.Max * (1n + separator.Max) + separator.Max);
  return new CallEstimate(traversal.Min + 1n, traversal.Max + result.Max + 1n, result);
}

/** stringNodeSize returns a computed, hinted, or zero-to-maximum size range. */
function stringNodeSize(estimator: CostEstimator, node: AstNode) {
  return node.computedSize() ?? estimator.estimateSize(node) ?? sizeEstimate(0n, (1n << 64n) - 1n);
}

/** scanBounds converts string size bounds into traversal cost bounds. */
function scanBounds(size: ReturnType<typeof sizeEstimate>): [bigint, bigint] {
  const cost = size.multiplyByCostFactor(stringCostFactor);
  return [cost.Min, cost.Max];
}

/** atLeastOne raises both size bounds to at least one. */
function atLeastOne(size: ReturnType<typeof sizeEstimate>) {
  return sizeEstimate(size.Min < 1n ? 1n : size.Min, size.Max < 1n ? 1n : size.Max);
}

/** literalInt reads a non-negative integer literal from a checker node. */
function literalInt(node: AstNode | undefined): bigint | undefined {
  const value = node?.expr()?.asLiteral();
  return typeof value === "bigint" && value >= 0n ? value : undefined;
}

/** trackCharAtCost tracks traversal plus one-character allocation. */
function trackCharAtCost(options: { args: Val[] }): number {
  return 2 + Math.ceil(actualStringSize(options.args[0]!) * stringCostFactor);
}

/** trackTransformCost tracks traversal and result allocation. */
function trackTransformCost(options: { args: Val[]; result: Val }): number {
  return (
    1 +
    Math.ceil(actualStringSize(options.args[0]!) * stringCostFactor) +
    actualStringSize(options.result)
  );
}

/** trackSearchCost tracks target-by-needle scanning. */
function trackSearchCost(options: { args: Val[] }): number {
  return (
    1 +
    Math.ceil(
      actualStringSize(options.args[0]!) * actualStringSize(options.args[1]!) * stringCostFactor,
    )
  );
}

/** trackReplaceCost tracks search and replacement result allocation. */
function trackReplaceCost(options: { args: Val[]; result: Val }): number {
  return (
    1 +
    Math.ceil(
      Math.max(1, actualStringSize(options.args[0]!)) *
        Math.max(1, actualStringSize(options.args[1]!)) *
        stringCostFactor,
    ) +
    actualStringSize(options.result)
  );
}

/** trackSplitCost tracks traversal, list creation, and result elements. */
function trackSplitCost(options: { args: Val[]; result: Val }): number {
  return (
    11 +
    Math.ceil((actualStringSize(options.args[0]!) + 1) * stringCostFactor) +
    actualStringSize(options.result)
  );
}

/** trackJoinCost tracks list traversal and joined result allocation. */
function trackJoinCost(options: { args: Val[]; result: Val }): number {
  return (
    1 +
    Math.ceil((actualStringSize(options.args[0]!) + 1) * stringCostFactor) +
    actualStringSize(options.result)
  );
}

/** actualStringSize returns the code-point or collection size used by cost tracking. */
function actualStringSize(value: Val): number {
  if (value instanceof CelString) {
    return Array.from(value.value()).length;
  }
  const sized = value as Partial<Lister>;
  if (typeof sized.size === "function") {
    const size = sized.size();
    return size instanceof Int ? Number(size.value()) : 1;
  }
  return 1;
}

/** trimSpace removes the Unicode White Space code points recognized by CEL-Go. */
function trimSpace(text: Val): Val {
  const whitespace =
    "[\\u0009-\\u000d\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
  return new CelString(
    (text as CelString).value().replace(new RegExp(`^${whitespace}+|${whitespace}+$`, "gu"), ""),
  );
}

/** charAt returns the code point at one index, including empty at the end. */
function charAt(text: Val, index: Val): Val {
  const chars = Array.from((text as CelString).value());
  const position = Number((index as Int).value());
  if (position < 0 || position > chars.length) {
    return err(`index out of range: ${position}`);
  }
  return new CelString(chars[position] ?? "");
}

/** indexOf finds the first code-point substring match at or after an offset. */
function indexOf(options: { offset: Val; search: Val; text: Val }): Val {
  const chars = Array.from((options.text as CelString).value());
  const needle = Array.from((options.search as CelString).value());
  const offset = Number((options.offset as Int).value());
  if (offset < 0) {
    return err(`index out of range: ${offset}`);
  }
  if (needle.length === 0) {
    return new Int(BigInt(Math.min(offset, chars.length)));
  }
  for (let index = offset; index <= chars.length - needle.length; index += 1) {
    if (needle.every((char, relative) => chars[index + relative] === char)) {
      return new Int(BigInt(index));
    }
  }
  return new Int(-1n);
}

/** lastIndexOf finds the last code-point substring match at or before an offset. */
function lastIndexOf(
  textOrOptions: Val | { offset: Val; search: Val; text: Val },
  searchValue?: Val,
): Val {
  const options =
    searchValue === undefined
      ? (textOrOptions as { offset: Val; search: Val; text: Val })
      : {
          offset: undefined,
          search: searchValue,
          text: textOrOptions as Val,
        };
  const chars = Array.from((options.text as CelString).value());
  const needle = Array.from((options.search as CelString).value());
  if (options.offset === undefined && needle.length > chars.length) {
    return new Int(-1n);
  }
  const offset =
    options.offset === undefined
      ? needle.length === 0
        ? chars.length
        : chars.length - 1
      : Number((options.offset as Int).value());
  if (offset < 0) {
    return err(`index out of range: ${offset}`);
  }
  if (needle.length === 0) {
    return new Int(BigInt(Math.min(offset, chars.length)));
  }
  if (offset >= chars.length) {
    return new Int(-1n);
  }
  for (let index = Math.min(offset, chars.length - needle.length); index >= 0; index -= 1) {
    if (needle.every((char, relative) => chars[index + relative] === char)) {
      return new Int(BigInt(index));
    }
  }
  return new Int(-1n);
}

/** asciiCase changes only ASCII letters and leaves non-ASCII code points unchanged. */
function asciiCase(text: Val, mode: "lower" | "upper"): Val {
  return new CelString(
    Array.from((text as CelString).value(), (char) => {
      const code = char.codePointAt(0)!;
      return code <= 0x7f ? (mode === "lower" ? char.toLowerCase() : char.toUpperCase()) : char;
    }).join(""),
  );
}

/** replace substitutes at most the requested number of literal substring occurrences. */
function replace(options: { limit: number; replacement: Val; search: Val; text: Val }): Val {
  const text = (options.text as CelString).value();
  const search = (options.search as CelString).value();
  const replacement = (options.replacement as CelString).value();
  if (options.limit === 0) {
    return new CelString(text);
  }
  const limit = options.limit < 0 ? Number.MAX_SAFE_INTEGER : options.limit;
  if (search === "") {
    const chars = Array.from(text);
    let output = "";
    let replacements = 0;
    for (let index = 0; index <= chars.length; index += 1) {
      if (replacements < limit) {
        output += replacement;
        replacements += 1;
      }
      output += chars[index] ?? "";
    }
    return new CelString(output);
  }
  let output = "";
  let cursor = 0;
  let replacements = 0;
  while (replacements < limit) {
    const found = text.indexOf(search, cursor);
    if (found < 0) {
      break;
    }
    output += text.slice(cursor, found) + replacement;
    cursor = found + search.length;
    replacements += 1;
  }
  return new CelString(output + text.slice(cursor));
}

/** split divides a string with CEL-Go's result-count limit semantics. */
function split(options: { limit: number; separator: Val; text: Val }): Val {
  const text = (options.text as CelString).value();
  const separator = (options.separator as CelString).value();
  if (options.limit === 0) {
    return stringList(DefaultTypeAdapter, []);
  }
  if (options.limit === 1) {
    return stringList(DefaultTypeAdapter, [text]);
  }
  const all = separator === "" ? Array.from(text) : text.split(separator);
  if (options.limit < 0 || all.length <= options.limit) {
    return stringList(DefaultTypeAdapter, all);
  }
  return stringList(DefaultTypeAdapter, [
    ...all.slice(0, options.limit - 1),
    all.slice(options.limit - 1).join(separator),
  ]);
}

/** substring returns the code-point interval selected by start and optional end. */
function substring(options: { end?: Val; start: Val; text: Val }): Val {
  const chars = Array.from((options.text as CelString).value());
  const start = Number((options.start as Int).value());
  const end = options.end === undefined ? chars.length : Number((options.end as Int).value());
  if (options.end !== undefined && start > end) {
    return err(`invalid substring range. start: ${start}, end: ${end}`);
  }
  if (start < 0 || start > chars.length) {
    return err(`index out of range: ${start}`);
  }
  if (end < 0 || end > chars.length) {
    return err(`index out of range: ${end}`);
  }
  return new CelString(chars.slice(start, end).join(""));
}

/** join concatenates every string element with the requested separator. */
function join(value: Val, separator: string): Val {
  const list = value as Lister;
  const parts: string[] = [];
  const iterator = list.iterator();
  while ((iterator.hasNext() as Bool).value()) {
    const element = iterator.next();
    if (!(element instanceof CelString)) {
      return err(`join: invalid input: ${element}`);
    }
    parts.push(element.value());
  }
  return new CelString(parts.join(separator));
}

/** quote returns a double-quoted CEL string with every CEL escape shown literally. */
function quote(value: Val): Val {
  const escaped = Array.from((value as CelString).value(), (char) => {
    switch (char) {
      case "\u0007":
        return "\\a";
      case "\b":
        return "\\b";
      case "\f":
        return "\\f";
      case "\n":
        return "\\n";
      case "\r":
        return "\\r";
      case "\t":
        return "\\t";
      case "\v":
        return "\\v";
      case "\\":
        return "\\\\";
      case '"':
        return '\\"';
      default:
        return char;
    }
  }).join("");
  return new CelString(`"${escaped}"`);
}

/** formatString interpolates CEL values using the version-four formatting grammar. */
function formatString(options: {
  args: Val;
  format: Val;
  legacy: boolean;
  locale?: string;
  maxPrecision: number;
}): Val {
  const source = (options.format as CelString).value();
  const args = listValues(options.args as Lister);
  let output = "";
  let argumentIndex = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "%") {
      output += source[index];
      continue;
    }
    if (source[index + 1] === "%") {
      output += "%";
      index += 1;
      continue;
    }
    const match = /^%(?:\.(\d+))?([sdfebxXo])/.exec(source.slice(index));
    if (!match) {
      if (/^%\.\d*$/.test(source.slice(index))) {
        return err(
          "could not parse formatting clause: error while parsing precision: could not find end of precision specifier",
        );
      }
      return err(
        index + 1 >= source.length
          ? "unexpected end of string"
          : `could not parse formatting clause: unrecognized formatting clause "${source[index + 1]}"`,
      );
    }
    if (argumentIndex >= args.length) {
      return err(`index ${argumentIndex} out of range`);
    }
    const precision = match[1] === undefined ? defaultPrecision : Number(match[1]);
    if (precision > options.maxPrecision) {
      return err(
        `precision ${precision} exceeds maximum allowed precision ${options.maxPrecision}`,
      );
    }
    const formatted = formatClause({
      clause: match[2]!,
      legacy: options.legacy,
      locale: options.locale,
      precision,
      value: args[argumentIndex]!,
    });
    if (formatted instanceof Error) {
      return err(formatted.message);
    }
    output += formatted;
    argumentIndex += 1;
    index += match[0].length - 1;
  }
  if (argumentIndex < args.length) {
    return err(
      `too many arguments supplied to string.format (expected ${argumentIndex}, got ${args.length})`,
    );
  }
  return new CelString(output);
}

/** formatClause formats one CEL value according to a parsed clause. */
function formatClause(options: {
  clause: string;
  legacy: boolean;
  locale?: string;
  precision: number;
  value: Val;
}): string | Error {
  const { clause, legacy, locale, precision, value } = options;
  if (clause === "s") {
    return legacy ? formatLegacyValue(value, false) : formatValue(value);
  }
  if (clause === "d") {
    if (value instanceof Int || value instanceof Uint) {
      return value.value().toString();
    }
    if (value instanceof Double && !Number.isFinite(value.value())) {
      return formatNumber(value.value());
    }
    return new Error(
      legacy
        ? `error during formatting: decimal clause can only be used on integers, was given ${value.type().typeName()}`
        : `error during formatting: decimal clause can only be used on ints, uints, and doubles, was given ${value.type().typeName()}`,
    );
  }
  if (clause === "f" || clause === "e") {
    const legacySpecial =
      legacy && value instanceof CelString ? legacySpecialNumber(value.value()) : undefined;
    if (
      !(value instanceof Int || value instanceof Uint || value instanceof Double) &&
      legacySpecial === undefined
    ) {
      return new Error(
        legacy
          ? `error during formatting: ${clause === "f" ? "fixed-point" : "scientific"} clause can only be used on doubles, was given ${value.type().typeName()}`
          : `error during formatting: ${clause === "f" ? "fixed-point" : "scientific"} clause can only be used on ints, uints, and doubles, was given ${value.type().typeName()}`,
      );
    }
    const number = legacySpecial ?? Number(value.value());
    if (!Number.isFinite(number)) {
      return legacy ? legacyInfinity(number) : formatNumber(number);
    }
    let result =
      clause === "f"
        ? fixedNumber(number, precision)
        : legacy
          ? legacyScientific(number, precision)
          : padExponent(number.toExponential(precision));
    if (legacy && locale === "fr_FR") {
      result = result.replace(".", ",");
    }
    return result;
  }
  if (clause === "b") {
    if (value instanceof Bool) {
      return value.value() ? "1" : "0";
    }
    if (value instanceof Int || value instanceof Uint) {
      return signedRadix(value.value(), 2);
    }
    return new Error(
      legacy
        ? `error during formatting: only integers and bools can be formatted as binary, was given ${value.type().typeName()}`
        : `error during formatting: only ints, uints, and bools can be formatted as binary, was given ${value.type().typeName()}`,
    );
  }
  if (clause === "o") {
    if (value instanceof Int || value instanceof Uint) {
      return signedRadix(value.value(), 8);
    }
    return new Error(
      legacy
        ? `error during formatting: octal clause can only be used on integers, was given ${value.type().typeName()}`
        : `error during formatting: octal clause can only be used on ints and uints, was given ${value.type().typeName()}`,
    );
  }
  if (value instanceof Int || value instanceof Uint) {
    const result = signedRadix(value.value(), 16);
    return clause === "X" ? result.toUpperCase() : result;
  }
  if (value instanceof CelString || value instanceof Bytes) {
    const bytes = value instanceof Bytes ? value.value() : new TextEncoder().encode(value.value());
    const result = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return clause === "X" ? result.toUpperCase() : result;
  }
  return new Error(
    legacy
      ? `error during formatting: only integers, byte buffers, and strings can be formatted as hex, was given ${value.type().typeName()}`
      : `error during formatting: only ints, uints, bytes, and strings can be formatted as hex, was given ${value.type().typeName()}`,
  );
}

/** formatLegacyValue returns the pre-version-four `%s` representation of a CEL value. */
function formatLegacyValue(value: Val, nested: boolean): string | Error {
  if (value === NullValue) {
    return "null";
  }
  if (value instanceof CelString) {
    return nested ? JSON.stringify(value.value()) : value.value();
  }
  if (value instanceof Bytes) {
    const text = new TextDecoder().decode(value.value());
    return nested ? `b${JSON.stringify(text)}` : text;
  }
  if (value instanceof Bool || value instanceof Int || value instanceof Uint) {
    return String(value.value());
  }
  if (value instanceof Double) {
    if (!Number.isFinite(value.value())) {
      const result = Number.isNaN(value.value()) ? "NaN" : value.value() > 0 ? "+Inf" : "-Inf";
      return nested ? JSON.stringify(result) : result;
    }
    const text = String(value.value());
    return nested
      ? fixedNumber(value.value(), defaultPrecision)
      : text.replace(/e([+-])(\d)$/, "e$10$2");
  }
  if (value.type().typeName() === "list") {
    const values = listValues(value as Lister).map((item) => formatLegacyValue(item, true));
    const failure = values.find((item): item is Error => item instanceof Error);
    return failure ?? `[${values.join(", ")}]`;
  }
  if (value.type().typeName() === "map") {
    return formatLegacyMap(value as Mapper);
  }
  try {
    const converted = value.convertToType(StringType);
    if (converted instanceof CelString) {
      const text = converted.value();
      if (!nested) {
        return text;
      }
      if (value.type() === TimestampType) {
        return `timestamp(${JSON.stringify(text)})`;
      }
      if (value.type() === DurationType) {
        return `duration(${JSON.stringify(text)})`;
      }
      if (value.type().typeName() === "type") {
        return `type(${text})`;
      }
      return JSON.stringify(text);
    }
  } catch {
    // Report the legacy standard format error below.
  }
  return new Error(
    `error during formatting: string clause can only be used on strings, bools, bytes, ints, doubles, maps, lists, types, durations, and timestamps, was given ${value.type().typeName()}`,
  );
}

/** formatLegacyMap returns sorted pre-version-four map literal formatting. */
function formatLegacyMap(map: Mapper): string | Error {
  const entries: string[] = [];
  const iterator = map.iterator();
  while ((iterator.hasNext() as Bool).value()) {
    const key = iterator.next();
    const [value, found] = map.find(key);
    if (!found || !value) {
      return new Error(`key missing from map: '${key}'`);
    }
    const formattedKey = formatLegacyValue(key, true);
    const formattedValue = formatLegacyValue(value, true);
    if (formattedKey instanceof Error) {
      return formattedKey;
    }
    if (formattedValue instanceof Error) {
      return formattedValue;
    }
    entries.push(`${formattedKey}:${formattedValue}`);
  }
  entries.sort();
  return `{${entries.join(", ")}}`;
}

/** legacySpecialNumber parses the legacy string spellings for non-finite doubles. */
function legacySpecialNumber(value: string): number | undefined {
  switch (value) {
    case "NaN":
      return Number.NaN;
    case "Infinity":
    case "+Inf":
      return Infinity;
    case "-Infinity":
    case "-Inf":
      return -Infinity;
    default:
      return undefined;
  }
}

/** legacyInfinity returns locale-aware legacy non-finite numeric output. */
function legacyInfinity(value: number): string {
  if (Number.isNaN(value)) {
    return "NaN";
  }
  return value > 0 ? "∞" : "-∞";
}

/** fixedNumber formats arbitrary precision beyond JavaScript's native one-hundred-digit limit. */
function fixedNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  const negative = value < 0 || Object.is(value, -0);
  const absolute = Math.abs(value);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, absolute, false);
  const high = view.getUint32(0, false);
  const low = view.getUint32(4, false);
  const exponentBits = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(low);
  const mantissa = exponentBits === 0 ? fraction : (1n << 52n) | fraction;
  const binaryExponent = (exponentBits === 0 ? -1022 : exponentBits - 1023) - 52;
  let numerator = mantissa * 10n ** BigInt(precision);
  let denominator = 1n;
  if (binaryExponent >= 0) {
    numerator <<= BigInt(binaryExponent);
  } else {
    denominator <<= BigInt(-binaryExponent);
  }
  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  const twiceRemainder = remainder * 2n;
  if (twiceRemainder > denominator || (twiceRemainder === denominator && rounded % 2n !== 0n)) {
    rounded += 1n;
  }
  const digits = rounded.toString().padStart(precision + 1, "0");
  const unsigned =
    precision === 0 ? digits : `${digits.slice(0, -precision)}.${digits.slice(-precision)}`;
  return negative ? `-${unsigned}` : unsigned;
}

/** legacyScientific returns the localized Unicode scientific notation used before version four. */
function legacyScientific(value: number, precision: number): string {
  const [mantissa, exponentText] = value.toExponential(precision).split("e");
  const exponent = Number(exponentText);
  const sign = exponent < 0 ? "⁻" : "";
  const superscript = String(Math.abs(exponent))
    .padStart(2, "0")
    .replace(/[0-9]/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(digit)]!);
  return `${mantissa}\u202f×\u202f10${sign}${superscript}`;
}

/** formatValue returns the `%s` representation of a supported CEL value. */
function formatValue(value: Val): string | Error {
  if (value === NullValue) {
    return "null";
  }
  if (value instanceof CelString) {
    return value.value();
  }
  if (value instanceof Bytes) {
    return new TextDecoder().decode(value.value());
  }
  if (value instanceof Bool || value instanceof Int || value instanceof Uint) {
    return String(value.value());
  }
  if (value instanceof Double) {
    return formatNumber(value.value());
  }
  if (value.type().typeName() === "list") {
    const values = listValues(value as Lister).map(formatValue);
    const failure = values.find((item): item is Error => item instanceof Error);
    return failure ?? `[${values.join(", ")}]`;
  }
  if (value.type().typeName() === "map") {
    return formatMap(value as Mapper);
  }
  try {
    const converted = value.convertToType(StringType);
    if (converted instanceof CelString) {
      return converted.value();
    }
  } catch {
    // Report the standard format error below when string conversion is unsupported.
  }
  if (value.type().typeName() === "type") {
    return String(value.value());
  }
  return new Error(
    `error during formatting: string clause can only be used on strings, bools, bytes, ints, doubles, maps, lists, types, durations, and timestamps, was given ${value.type().typeName()}`,
  );
}

/** formatMap returns sorted `%s` formatting for a CEL map. */
function formatMap(map: Mapper): string | Error {
  const entries: string[] = [];
  const iterator = map.iterator();
  while ((iterator.hasNext() as Bool).value()) {
    const key = iterator.next();
    const [value, found] = map.find(key);
    if (!found || !value) {
      return new Error(`key missing from map: '${key}'`);
    }
    const formattedKey = formatValue(key);
    const formattedValue = formatValue(value);
    if (formattedKey instanceof Error) {
      return formattedKey;
    }
    if (formattedValue instanceof Error) {
      return formattedValue;
    }
    entries.push(`${formattedKey}: ${formattedValue}`);
  }
  entries.sort();
  return `{${entries.join(", ")}}`;
}

/** listValues returns every element from one CEL list in order. */
function listValues(list: Lister): Val[] {
  const values: Val[] = [];
  const iterator = list.iterator();
  while ((iterator.hasNext() as Bool).value()) {
    values.push(iterator.next());
  }
  return values;
}

/** formatNumber returns CEL's finite and non-finite default double spelling. */
function formatNumber(value: number): string {
  if (Number.isNaN(value)) {
    return "NaN";
  }
  if (value === Infinity) {
    return "Infinity";
  }
  if (value === -Infinity) {
    return "-Infinity";
  }
  if (value !== 0 && Math.abs(value) < 1e-6) {
    return value.toFixed(20).replace(/0+$/, "");
  }
  return String(value);
}

/** signedRadix formats signed and unsigned integer values without two's-complement expansion. */
function signedRadix(value: bigint, radix: number): string {
  return value < 0n ? `-${(-value).toString(radix)}` : value.toString(radix);
}

/** padExponent ensures scientific notation uses a sign and two exponent digits. */
function padExponent(value: string): string {
  return value.replace(/e([+-])(\d+)$/, (_match, sign: string, digits: string) => {
    return `e${sign}${digits.padStart(2, "0")}`;
  });
}

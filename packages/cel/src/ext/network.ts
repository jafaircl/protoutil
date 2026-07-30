import type { Env } from "../cel/env.js";
import type { LibraryVersioner, SingletonLibrary } from "../cel/library.js";
import type { ASTValidator, ValidatorConfig } from "../cel/validator.js";
import {
  type AstNode,
  CallEstimate,
  type CostEstimate,
  type CostEstimator,
  fixedCostEstimate,
  type FunctionEstimator,
  type SizeEstimate,
  sizeEstimate,
  unknownSizeEstimate,
} from "../checker/cost.js";
import type { AST } from "../common/ast/index.js";
import { StringTraversalCostFactor } from "../common/cost.js";
import { ExprKind, matchDescendants, navigateAst } from "../common/ast/index.js";
import { functionDecl, memberOverload, overload } from "../common/decls.js";
import type { Errors } from "../common/errors.js";
import { Bool } from "../common/types/bool.js";
import { err } from "../common/types/err.js";
import { Int } from "../common/types/int.js";
import type { Val } from "../common/types/ref/index.js";
import { String as CelString } from "../common/types/string.js";
import type { Type } from "../common/types/types.js";
import { BoolType, IntType, opaqueType, StringType, TypeType } from "../common/types/types.js";
import type { FunctionTracker } from "../interpreter/runtime-cost.js";

/** NetworkVersion1 is the initial Kubernetes-compatible network library version. */
export const NetworkVersion1 = 1;
/** IPType is the opaque CEL IP address type. */
export const IPType = opaqueType("net.IP");
/** CIDRType is the opaque CEL CIDR prefix type. */
export const CIDRType = opaqueType("net.CIDR");

/**
 * NetworkOptions configures the network extension.
 */
export interface NetworkOptions {
  /** validateLiterals enables compile-time validation of constant IP and CIDR constructor inputs. */
  readonly validateLiterals?: boolean;
  /** version selects the network library version. */
  readonly version?: number;
}

/**
 * NetworkLibrary describes the singleton network library.
 */
export type NetworkLibrary = SingletonLibrary & LibraryVersioner;

/**
 * ParsedAddress contains a normalized IP address.
 */
interface ParsedAddress {
  /** bits contains the unsigned address bits. */
  readonly bits: bigint;
  /** canonical contains the RFC 5952-style string form. */
  readonly canonical: string;
  /** family contains either four or six. */
  readonly family: 4 | 6;
}

/**
 * ParsedPrefix contains an IP address and prefix length.
 */
interface ParsedPrefix {
  /** address contains the possibly host-bearing input address. */
  readonly address: ParsedAddress;
  /** length contains the mask length. */
  readonly length: number;
}

/**
 * network configures opaque IP and CIDR values plus parsing and inspection functions.
 *
 * Parsing is strict: zones and IPv4-mapped IPv6 addresses are rejected. CIDR parsing permits
 * host bits, matching Kubernetes network CEL behavior.
 */
export function network(options: NetworkOptions = {}): NetworkLibrary {
  return {
    libraryName: "cel.lib.ext.network",
    libraryVersion: options.version ?? NetworkVersion1,
    compileOptions: {
      types: [IPType, CIDRType],
      validators:
        options.validateLiterals === false
          ? []
          : [
              networkLiteralValidator("ip", parseAddress),
              networkLiteralValidator("cidr", parsePrefix),
            ],
      functions: [
        functionDecl("cidr", {
          overloads: [
            overload("string_to_cidr", [StringType], CIDRType, {
              unaryBinding: cidrFromString,
            }),
          ],
        }),
        functionDecl("string", {
          overloads: [
            overload("cidr_to_string", [CIDRType], StringType, {
              unaryBinding: (value) => value.convertToType(StringType),
            }),
            overload("ip_to_string", [IPType], StringType, {
              unaryBinding: (value) => value.convertToType(StringType),
            }),
          ],
        }),
        functionDecl("containsCIDR", {
          overloads: [
            memberOverload("cidr_contains_cidr", [CIDRType, CIDRType], BoolType, {
              binaryBinding: containsPrefix,
            }),
            memberOverload("cidr_contains_cidr_string", [CIDRType, StringType], BoolType, {
              binaryBinding: containsPrefixString,
            }),
          ],
        }),
        functionDecl("containsIP", {
          overloads: [
            memberOverload("cidr_contains_ip_ip", [CIDRType, IPType], BoolType, {
              binaryBinding: containsAddress,
            }),
            memberOverload("cidr_contains_ip_string", [CIDRType, StringType], BoolType, {
              binaryBinding: containsAddressString,
            }),
          ],
        }),
        functionDecl("family", {
          overloads: [
            memberOverload("ip_family", [IPType], IntType, {
              unaryBinding: (value) => new Int(BigInt((value as IPValue).address.family)),
            }),
          ],
        }),
        functionDecl("ip", {
          overloads: [
            overload("string_to_ip", [StringType], IPType, {
              unaryBinding: ipFromString,
            }),
            memberOverload("cidr_ip", [CIDRType], IPType, {
              unaryBinding: (value) => new IPValue((value as CIDRValue).prefix.address),
            }),
          ],
        }),
        functionDecl("ip.isCanonical", {
          overloads: [
            overload("ip_is_canonical", [StringType], BoolType, {
              unaryBinding: isCanonical,
            }),
          ],
        }),
        unaryIPPredicate({
          name: "isGlobalUnicast",
          overloadId: "ip_is_global_unicast",
          predicate: isGlobalUnicast,
        }),
        unaryIPPredicate({
          name: "isLinkLocalMulticast",
          overloadId: "ip_is_link_local_multicast",
          predicate: isLinkLocalMulticast,
        }),
        unaryIPPredicate({
          name: "isLinkLocalUnicast",
          overloadId: "ip_is_link_local_unicast",
          predicate: isLinkLocalUnicast,
        }),
        unaryIPPredicate({
          name: "isLoopback",
          overloadId: "ip_is_loopback",
          predicate: isLoopback,
        }),
        unaryIPPredicate({
          name: "isUnspecified",
          overloadId: "ip_is_unspecified",
          predicate: isUnspecified,
        }),
        functionDecl("isCIDR", {
          overloads: [
            overload("is_cidr", [StringType], BoolType, {
              unaryBinding: (value) =>
                new Bool(!(parsePrefix((value as CelString).value()) instanceof Error)),
            }),
          ],
        }),
        functionDecl("isIP", {
          overloads: [
            overload("is_ip", [StringType], BoolType, {
              unaryBinding: (value) =>
                new Bool(!(parseAddress((value as CelString).value()) instanceof Error)),
            }),
          ],
        }),
        functionDecl("isMask", {
          overloads: [
            memberOverload("cidr_is_mask", [CIDRType], BoolType, {
              unaryBinding: (value) => {
                const prefix = (value as CIDRValue).prefix;
                return new Bool(prefix.address.bits === maskedBits(prefix));
              },
            }),
          ],
        }),
        functionDecl("masked", {
          overloads: [
            memberOverload("cidr_masked", [CIDRType], CIDRType, {
              unaryBinding: (value) => maskedPrefix(value as CIDRValue),
            }),
          ],
        }),
        functionDecl("prefixLength", {
          overloads: [
            memberOverload("cidr_prefix_length", [CIDRType], IntType, {
              unaryBinding: (value) => new Int(BigInt((value as CIDRValue).prefix.length)),
            }),
          ],
        }),
      ],
      cost: {
        overloadCostEstimates: networkCostEstimates(),
      },
    },
    programOptions: {
      costTracking: {
        overloadTrackers: networkCostTrackers(),
      },
    },
  };
}

/**
 * IPValue is the opaque runtime representation of an IP address.
 */
export class IPValue implements Val {
  /** constructor stores a parsed address. */
  public constructor(public readonly address: ParsedAddress) {}

  /** convertToNative converts an IP to its supported native representation. */
  public convertToNative(typeDesc: unknown): unknown {
    if (typeDesc === String) {
      return this.address.canonical;
    }
    throw new Error(`unsupported type conversion to '${String(typeDesc)}'`);
  }

  /** convertToType converts an IP to string, its own type, or type metadata. */
  public convertToType(typeValue: Type): Val {
    if (typeValue === StringType) {
      return new CelString(this.address.canonical);
    }
    if (typeValue === IPType) {
      return this;
    }
    if (typeValue === TypeType) {
      return IPType;
    }
    return err("type conversion error from '%s' to '%s'", IPType.typeName(), typeValue.typeName());
  }

  /** equal reports whether another opaque IP contains identical address bits. */
  public equal(other: Val): Val {
    return new Bool(
      other instanceof IPValue &&
        other.address.family === this.address.family &&
        other.address.bits === this.address.bits,
    );
  }

  /** type returns the opaque IP type. */
  public type(): Type {
    return IPType;
  }

  /** size returns the address size in bytes for runtime cost accounting. */
  public size(): Val {
    return new Int(BigInt(this.address.family));
  }

  /** value returns the canonical IP string. */
  public value(): unknown {
    return this.address.canonical;
  }
}

/**
 * CIDRValue is the opaque runtime representation of an IP prefix.
 */
export class CIDRValue implements Val {
  /** constructor stores a parsed prefix. */
  public constructor(public readonly prefix: ParsedPrefix) {}

  /** convertToNative converts a CIDR to its supported native representation. */
  public convertToNative(typeDesc: unknown): unknown {
    if (typeDesc === String) {
      return prefixString(this.prefix);
    }
    throw new Error(`unsupported type conversion to '${String(typeDesc)}'`);
  }

  /** convertToType converts a CIDR to string, its own type, or type metadata. */
  public convertToType(typeValue: Type): Val {
    if (typeValue === StringType) {
      return new CelString(prefixString(this.prefix));
    }
    if (typeValue === CIDRType) {
      return this;
    }
    if (typeValue === TypeType) {
      return CIDRType;
    }
    return err(
      "type conversion error from '%s' to '%s'",
      CIDRType.typeName(),
      typeValue.typeName(),
    );
  }

  /** equal reports whether another CIDR has identical address bits and mask length. */
  public equal(other: Val): Val {
    return new Bool(
      other instanceof CIDRValue &&
        other.prefix.address.family === this.prefix.address.family &&
        other.prefix.address.bits === this.prefix.address.bits &&
        other.prefix.length === this.prefix.length,
    );
  }

  /** type returns the opaque CIDR type. */
  public type(): Type {
    return CIDRType;
  }

  /** size returns the prefix address size in bytes for runtime cost accounting. */
  public size(): Val {
    return new Int(BigInt(Math.ceil(this.prefix.length / 8)));
  }

  /** value returns the canonical CIDR string while retaining input host bits. */
  public value(): unknown {
    return prefixString(this.prefix);
  }
}

/** estimateNetworkParseCost estimates string parsing and an opaque address result. */
const estimateNetworkParseCost: FunctionEstimator = (estimator, _target, args) => {
  if (args.length < 1) {
    return undefined;
  }
  return networkCallEstimate(
    estimateNetworkSize(estimator, args[0]!).multiplyByCostFactor(StringTraversalCostFactor),
    sizeEstimate(4n, 16n),
  );
};

/** estimateNetworkParseBoolCost estimates validation of an IP or CIDR string. */
const estimateNetworkParseBoolCost: FunctionEstimator = (estimator, _target, args) => {
  if (args.length < 1) {
    return undefined;
  }
  return networkCallEstimate(
    estimateNetworkSize(estimator, args[0]!).multiplyByCostFactor(StringTraversalCostFactor),
  );
};

/** estimateIPIsCanonicalCost estimates parsing plus canonical string comparison. */
const estimateIPIsCanonicalCost: FunctionEstimator = (estimator, _target, args) => {
  if (args.length < 1) {
    return undefined;
  }
  return networkCallEstimate(
    estimateNetworkSize(estimator, args[0]!).multiplyByCostFactor(
      2 * StringTraversalCostFactor,
    ),
  );
};

/** estimateNetworkNominalCost assigns one unit to constant-time network operations. */
const estimateNetworkNominalCost: FunctionEstimator = () =>
  networkCallEstimate(fixedCostEstimate(1));

/** estimateNetworkNominalOpaqueCost assigns one unit and an address-sized result. */
const estimateNetworkNominalOpaqueCost: FunctionEstimator = () =>
  networkCallEstimate(fixedCostEstimate(1), sizeEstimate(4n, 16n));

/** estimateNetworkNominalStringCost assigns one unit and a bounded text result. */
const estimateNetworkNominalStringCost: FunctionEstimator = () =>
  networkCallEstimate(fixedCostEstimate(1), sizeEstimate(3n, 45n));

/** estimateNetworkContainsIPIPCost estimates two address traversals. */
const estimateNetworkContainsIPIPCost: FunctionEstimator = () => {
  const size = sizeEstimate(4n, 16n);
  return networkCallEstimate(size.add(size).multiplyByCostFactor(StringTraversalCostFactor));
};

/** estimateNetworkContainsIPStringCost adds parsing cost for the string argument. */
const estimateNetworkContainsIPStringCost: FunctionEstimator = (
  estimator,
  _target,
  args,
) => {
  if (args.length < 1) {
    return undefined;
  }
  const size = sizeEstimate(4n, 16n);
  const cost = size
    .add(size)
    .multiplyByCostFactor(StringTraversalCostFactor)
    .add(
      estimateNetworkSize(estimator, args[0]!).multiplyByCostFactor(
        StringTraversalCostFactor,
      ),
    );
  return networkCallEstimate(cost);
};

/** estimateNetworkContainsCIDRCIDRCost estimates three address traversals and one extra step. */
const estimateNetworkContainsCIDRCIDRCost: FunctionEstimator = () => {
  const size = sizeEstimate(4n, 16n);
  const cost = size
    .add(size)
    .multiplyByCostFactor(StringTraversalCostFactor)
    .add(size.multiplyByCostFactor(StringTraversalCostFactor))
    .add(fixedCostEstimate(1));
  return networkCallEstimate(cost);
};

/** estimateNetworkContainsCIDRStringCost adds CIDR parsing to prefix containment cost. */
const estimateNetworkContainsCIDRStringCost: FunctionEstimator = (
  estimator,
  _target,
  args,
) => {
  if (args.length < 1) {
    return undefined;
  }
  const size = sizeEstimate(4n, 16n);
  const cost = size
    .add(size)
    .multiplyByCostFactor(StringTraversalCostFactor)
    .add(size.multiplyByCostFactor(StringTraversalCostFactor))
    .add(
      estimateNetworkSize(estimator, args[0]!).multiplyByCostFactor(
        StringTraversalCostFactor,
      ),
    )
    .add(fixedCostEstimate(1));
  return networkCallEstimate(cost);
};

/** trackNetworkParseCost measures string traversal during parsing. */
const trackNetworkParseCost: FunctionTracker = {
  cost: ({ args }) => Math.ceil(networkValueSize(args[0]!) * StringTraversalCostFactor),
};

/** trackIPIsCanonicalCost measures parsing plus canonical comparison. */
const trackIPIsCanonicalCost: FunctionTracker = {
  cost: ({ args }) =>
    Math.ceil(networkValueSize(args[0]!) * 2 * StringTraversalCostFactor),
};

/** trackNetworkNominalCost assigns one runtime unit to constant-time operations. */
const trackNetworkNominalCost: FunctionTracker = { cost: () => 1 };

/** trackNetworkContainsIPIPCost measures two prefix-address traversals. */
const trackNetworkContainsIPIPCost: FunctionTracker = {
  cost: ({ args }) =>
    Math.ceil(networkValueSize(args[0]!) * 2 * StringTraversalCostFactor),
};

/** trackNetworkContainsIPStringCost adds parsing of the string operand. */
const trackNetworkContainsIPStringCost: FunctionTracker = {
  cost: ({ args }) =>
    Math.ceil(networkValueSize(args[0]!) * 2 * StringTraversalCostFactor) +
    Math.ceil(networkValueSize(args[1]!) * StringTraversalCostFactor),
};

/** trackNetworkContainsCIDRCIDRCost measures three prefix traversals and one extra step. */
const trackNetworkContainsCIDRCIDRCost: FunctionTracker = {
  cost: ({ args }) =>
    Math.ceil(networkValueSize(args[0]!) * 2 * StringTraversalCostFactor) +
    Math.ceil(networkValueSize(args[0]!) * StringTraversalCostFactor) +
    1,
};

/** trackNetworkContainsCIDRStringCost adds string parsing to prefix containment. */
const trackNetworkContainsCIDRStringCost: FunctionTracker = {
  cost: ({ args }) =>
    Math.ceil(networkValueSize(args[0]!) * 2 * StringTraversalCostFactor) +
    Math.ceil(networkValueSize(args[0]!) * StringTraversalCostFactor) +
    Math.ceil(networkValueSize(args[1]!) * StringTraversalCostFactor) +
    1,
};

/** networkCostEstimates maps every network overload to its checker cost rule. */
function networkCostEstimates(): Record<string, FunctionEstimator> {
  return {
    string_to_cidr: estimateNetworkParseCost,
    cidr_to_string: estimateNetworkNominalStringCost,
    cidr_contains_cidr: estimateNetworkContainsCIDRCIDRCost,
    cidr_contains_cidr_string: estimateNetworkContainsCIDRStringCost,
    cidr_contains_ip_ip: estimateNetworkContainsIPIPCost,
    cidr_contains_ip_string: estimateNetworkContainsIPStringCost,
    ip_family: estimateNetworkNominalCost,
    string_to_ip: estimateNetworkParseCost,
    cidr_ip: estimateNetworkNominalOpaqueCost,
    ip_to_string: estimateNetworkNominalStringCost,
    ip_is_canonical: estimateIPIsCanonicalCost,
    is_cidr: estimateNetworkParseBoolCost,
    ip_is_global_unicast: estimateNetworkNominalCost,
    is_ip: estimateNetworkParseBoolCost,
    ip_is_link_local_multicast: estimateNetworkNominalCost,
    ip_is_link_local_unicast: estimateNetworkNominalCost,
    ip_is_loopback: estimateNetworkNominalCost,
    cidr_is_mask: estimateNetworkNominalCost,
    ip_is_unspecified: estimateNetworkNominalCost,
    cidr_masked: estimateNetworkNominalOpaqueCost,
    cidr_prefix_length: estimateNetworkNominalCost,
  };
}

/** networkCostTrackers maps every network overload to its runtime cost rule. */
function networkCostTrackers(): Record<string, FunctionTracker> {
  return {
    string_to_cidr: trackNetworkParseCost,
    cidr_to_string: trackNetworkNominalCost,
    cidr_contains_cidr: trackNetworkContainsCIDRCIDRCost,
    cidr_contains_cidr_string: trackNetworkContainsCIDRStringCost,
    cidr_contains_ip_ip: trackNetworkContainsIPIPCost,
    cidr_contains_ip_string: trackNetworkContainsIPStringCost,
    ip_family: trackNetworkNominalCost,
    string_to_ip: trackNetworkParseCost,
    cidr_ip: trackNetworkNominalCost,
    ip_to_string: trackNetworkNominalCost,
    ip_is_canonical: trackIPIsCanonicalCost,
    is_cidr: trackNetworkParseCost,
    ip_is_global_unicast: trackNetworkNominalCost,
    is_ip: trackNetworkParseCost,
    ip_is_link_local_multicast: trackNetworkNominalCost,
    ip_is_link_local_unicast: trackNetworkNominalCost,
    ip_is_loopback: trackNetworkNominalCost,
    cidr_is_mask: trackNetworkNominalCost,
    ip_is_unspecified: trackNetworkNominalCost,
    cidr_masked: trackNetworkNominalCost,
    cidr_prefix_length: trackNetworkNominalCost,
  };
}

/** networkCallEstimate combines a cost range with optional result size. */
function networkCallEstimate(cost: CostEstimate, resultSize?: SizeEstimate): CallEstimate {
  return new CallEstimate(cost.Min, cost.Max, resultSize);
}

/** estimateNetworkSize returns a computed, hinted, or unknown node size. */
function estimateNetworkSize(estimator: CostEstimator, node: AstNode): SizeEstimate {
  return node.computedSize() ?? estimator.estimateSize(node) ?? unknownSizeEstimate();
}

/** networkValueSize returns a runtime string, address, or prefix size. */
function networkValueSize(value: Val): number {
  if (value instanceof IPValue) {
    return value.address.family;
  }
  if (value instanceof CIDRValue) {
    return Math.ceil(value.prefix.length / 8);
  }
  const native = value.value();
  return typeof native === "string" ? native.length : 1;
}

/**
 * unaryIPPredicate declares a unary IP receiver predicate.
 */
function unaryIPPredicate(options: {
  name: string;
  overloadId: string;
  predicate: (address: ParsedAddress) => boolean;
}) {
  return functionDecl(options.name, {
    overloads: [
      memberOverload(options.overloadId, [IPType], BoolType, {
        unaryBinding: (value) => new Bool(options.predicate((value as IPValue).address)),
      }),
    ],
  });
}

/**
 * networkLiteralValidator validates literal IP or CIDR constructor arguments.
 */
function networkLiteralValidator(
  functionName: string,
  parse: (value: string) => ParsedAddress | ParsedPrefix | Error,
): ASTValidator {
  return {
    name: () => `cel.validator.network.${functionName}`,
    validate: (_environment: Env, _config: ValidatorConfig, ast: AST, issues: Errors) => {
      const calls = matchDescendants(
        navigateAst(ast),
        (expression) =>
          expression.kind() === ExprKind.Call &&
          expression.asCall()?.functionName() === functionName,
      );
      for (const call of calls) {
        const argument = call.asCall()?.args()[0];
        if (
          argument?.kind() === ExprKind.Literal &&
          typeof argument.asLiteral() === "string" &&
          parse(argument.asLiteral() as string) instanceof Error
        ) {
          issues.reportErrorAtId(
            argument.id(),
            ast.sourceInfo().getStartLocation(argument.id()),
            "invalid %s argument",
            functionName,
          );
        }
      }
    },
  };
}

/**
 * ipFromString parses a strict IP address.
 */
function ipFromString(value: Val): Val {
  const parsed = parseAddress((value as CelString).value());
  return parsed instanceof Error ? err(parsed.message) : new IPValue(parsed);
}

/**
 * cidrFromString parses a CIDR prefix while retaining host bits.
 */
function cidrFromString(value: Val): Val {
  const parsed = parsePrefix((value as CelString).value());
  return parsed instanceof Error ? err(parsed.message) : new CIDRValue(parsed);
}

/**
 * containsAddress reports whether a prefix contains an IP.
 */
function containsAddress(prefixValue: Val, addressValue: Val): Val {
  const prefix = (prefixValue as CIDRValue).prefix;
  const address = (addressValue as IPValue).address;
  return new Bool(
    prefix.address.family === address.family &&
      maskedAddressBits({
        bits: address.bits,
        family: address.family,
        length: prefix.length,
      }) === maskedBits(prefix),
  );
}

/**
 * containsAddressString parses and tests a string IP.
 */
function containsAddressString(prefixValue: Val, textValue: Val): Val {
  const parsed = parseAddress((textValue as CelString).value());
  return parsed instanceof Error
    ? err(parsed.message)
    : containsAddress(prefixValue, new IPValue(parsed));
}

/**
 * containsPrefix reports whether one prefix fully contains another.
 */
function containsPrefix(parentValue: Val, childValue: Val): Val {
  const parent = (parentValue as CIDRValue).prefix;
  const child = (childValue as CIDRValue).prefix;
  return new Bool(
    parent.address.family === child.address.family &&
      parent.length <= child.length &&
      maskedAddressBits({
        bits: child.address.bits,
        family: child.address.family,
        length: parent.length,
      }) === maskedBits(parent),
  );
}

/**
 * containsPrefixString parses and tests a string CIDR.
 */
function containsPrefixString(parentValue: Val, textValue: Val): Val {
  const parsed = parsePrefix((textValue as CelString).value());
  return parsed instanceof Error
    ? err(parsed.message)
    : containsPrefix(parentValue, new CIDRValue(parsed));
}

/**
 * maskedPrefix clears host bits from a CIDR prefix.
 */
function maskedPrefix(value: CIDRValue): CIDRValue {
  const bits = maskedBits(value.prefix);
  return new CIDRValue({
    address: addressFromBits(value.prefix.address.family, bits),
    length: value.prefix.length,
  });
}

/**
 * isCanonical reports whether a string equals its canonical parsed form.
 */
function isCanonical(value: Val): Val {
  const text = (value as CelString).value();
  const parsed = parseAddress(text);
  return parsed instanceof Error ? err(parsed.message) : new Bool(parsed.canonical === text);
}

/**
 * isLoopback reports whether an address belongs to a loopback range.
 */
function isLoopback(address: ParsedAddress): boolean {
  return address.family === 4 ? Number(address.bits >> 24n) === 127 : address.bits === 1n;
}

/**
 * isUnspecified reports whether every address bit is zero.
 */
function isUnspecified(address: ParsedAddress): boolean {
  return address.bits === 0n;
}

/**
 * isLinkLocalUnicast reports whether an address belongs to a link-local unicast range.
 */
function isLinkLocalUnicast(address: ParsedAddress): boolean {
  return address.family === 4 ? address.bits >> 16n === 0xa9fen : address.bits >> 118n === 0x3fan;
}

/**
 * isLinkLocalMulticast reports whether an address belongs to link-local multicast.
 */
function isLinkLocalMulticast(address: ParsedAddress): boolean {
  return address.family === 4 ? address.bits >> 8n === 0xe00000n : address.bits >> 112n === 0xff02n;
}

/**
 * isGlobalUnicast reports whether an address is a non-special unicast address.
 */
function isGlobalUnicast(address: ParsedAddress): boolean {
  const multicast =
    address.family === 4 ? address.bits >> 28n === 0xen : address.bits >> 120n === 0xffn;
  const ipv4Broadcast = address.family === 4 && address.bits === 0xffff_ffffn;
  return (
    !isUnspecified(address) &&
    !isLoopback(address) &&
    !isLinkLocalUnicast(address) &&
    !multicast &&
    !ipv4Broadcast
  );
}

/**
 * parsePrefix parses an address and validated mask length.
 */
function parsePrefix(value: string): ParsedPrefix | Error {
  const slash = value.lastIndexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    return new Error(`CIDR "${value}" parse error during conversion from string`);
  }
  const address = parseAddress(value.slice(0, slash));
  const lengthText = value.slice(slash + 1);
  if (address instanceof Error || !/^\d+$/.test(lengthText)) {
    return new Error(`CIDR "${value}" parse error during conversion from string`);
  }
  const length = Number(lengthText);
  const maximum = address.family === 4 ? 32 : 128;
  if (length > maximum) {
    return new Error(`CIDR "${value}" parse error during conversion from string`);
  }
  return { address, length };
}

/**
 * parseAddress parses strict IPv4 and IPv6 string forms.
 */
function parseAddress(value: string): ParsedAddress | Error {
  if (value.includes("%") || (value.includes(":") && value.includes("."))) {
    return new Error(`IP Address "${value}" parse error during conversion from string`);
  }
  const ipv4 = parseIPv4(value);
  if (ipv4 !== undefined) {
    return addressFromBits(4, ipv4);
  }
  const ipv6 = parseIPv6(value);
  if (ipv6 === undefined) {
    return new Error(`IP Address "${value}" parse error during conversion from string`);
  }
  // Normalize the hexadecimal IPv4-mapped form so equality, family, and predicates match the
  // corresponding IPv4 address. Dotted IPv4-in-IPv6 input remains rejected above.
  if (ipv6 >> 32n === 0xffffn) {
    return addressFromBits(4, ipv6 & 0xffff_ffffn);
  }
  return addressFromBits(6, ipv6);
}

/**
 * parseIPv4 parses four decimal octets without alternate encodings.
 */
function parseIPv4(value: string): bigint | undefined {
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(?:0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
  ) {
    return undefined;
  }
  return parts.reduce((bits, part) => (bits << 8n) | BigInt(Number(part)), 0n);
}

/**
 * parseIPv6 parses eight hexadecimal groups with one optional compressed run.
 */
function parseIPv6(value: string): bigint | undefined {
  if (!value.includes(":") || value.split("::").length > 2) {
    return undefined;
  }
  const [leftText, rightText] = value.split("::");
  const left = leftText === "" ? [] : leftText!.split(":");
  const right = rightText === undefined || rightText === "" ? [] : rightText.split(":");
  if (
    [...left, ...right].some((part) => !/^[0-9a-fA-F]{1,4}$/.test(part)) ||
    (rightText === undefined && left.length !== 8) ||
    (rightText !== undefined && left.length + right.length >= 8)
  ) {
    return undefined;
  }
  const groups = [
    ...left,
    ...Array.from({ length: 8 - left.length - right.length }, () => "0"),
    ...right,
  ];
  return groups.reduce((bits, part) => (bits << 16n) | BigInt(Number.parseInt(part, 16)), 0n);
}

/**
 * addressFromBits creates a normalized address from its unsigned bits.
 */
function addressFromBits(family: 4 | 6, bits: bigint): ParsedAddress {
  return {
    bits,
    canonical: family === 4 ? canonicalIPv4(bits) : canonicalIPv6(bits),
    family,
  };
}

/**
 * canonicalIPv4 renders four decimal octets.
 */
function canonicalIPv4(bits: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => Number((bits >> shift) & 0xffn)).join(".");
}

/**
 * canonicalIPv6 renders lowercase groups and compresses the first longest zero run.
 */
function canonicalIPv6(bits: bigint): string {
  const groups = Array.from({ length: 8 }, (_, index) =>
    Number((bits >> BigInt((7 - index) * 16)) & 0xffffn),
  );
  let bestStart = -1;
  let bestLength = 1;
  for (let start = 0; start < groups.length; start += 1) {
    if (groups[start] !== 0) {
      continue;
    }
    let end = start;
    while (end < groups.length && groups[end] === 0) {
      end += 1;
    }
    if (end - start > bestLength) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end - 1;
  }
  if (bestStart < 0) {
    return groups.map((group) => group.toString(16)).join(":");
  }
  const left = groups
    .slice(0, bestStart)
    .map((group) => group.toString(16))
    .join(":");
  const right = groups
    .slice(bestStart + bestLength)
    .map((group) => group.toString(16))
    .join(":");
  return `${left}::${right}`;
}

/**
 * maskedBits returns a prefix's network address bits.
 */
function maskedBits(prefix: ParsedPrefix): bigint {
  return maskedAddressBits({
    bits: prefix.address.bits,
    family: prefix.address.family,
    length: prefix.length,
  });
}

/**
 * maskedAddressBits clears every bit after a prefix length.
 */
function maskedAddressBits(options: { bits: bigint; family: 4 | 6; length: number }): bigint {
  const width = options.family === 4 ? 32 : 128;
  if (options.length === 0) {
    return 0n;
  }
  const hostBits = BigInt(width - options.length);
  return (options.bits >> hostBits) << hostBits;
}

/**
 * prefixString renders a prefix while preserving host bits.
 */
function prefixString(prefix: ParsedPrefix): string {
  return `${prefix.address.canonical}/${prefix.length}`;
}

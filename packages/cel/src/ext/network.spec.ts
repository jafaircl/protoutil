import { describe, expect, it } from "vitest";
import { env } from "../cel/env.js";
import { syncedCases } from "../common/spec-helpers.js";
import { StringType, TypeType } from "../common/types/types.js";
import { network } from "./network.js";

/** NetworkCase describes a synchronized networking expression. */
interface NetworkCase {
  /** errContains contains the expected error fragment. */
  readonly errContains?: string;
  /** expr contains the CEL source expression. */
  readonly expr: string;
  /** name identifies the upstream table row. */
  readonly name: string;
  /** out contains the expected native result. */
  readonly out?: unknown;
}

/** NetworkCostCase describes one synchronized checker and runtime cost row. */
interface NetworkCostCase {
  /** estimatedCost contains CEL-Go's serialized static estimate. */
  readonly estimatedCost: { $expr: string };
  /** expr contains the network expression. */
  readonly expr: string;
  /** name identifies the upstream row. */
  readonly name: string;
  /** runtimeCost contains CEL-Go's observed runtime cost. */
  readonly runtimeCost: number;
}

describe("ext/network_test.go/TestNetwork_Success", () => {
  it("evaluates every synchronized networking case", () => {
    const celEnv = env({ libraries: [network()] });
    for (const testCase of syncedCases<NetworkCase>("ext/network_test.go/TestNetwork_Success")) {
      expect(celEnv.program(celEnv.compile(testCase.expr)).eval({}).value(), testCase.name).toEqual(
        networkExpected(testCase.out),
      );
    }
  });
});

/**
 * networkExpected resolves synchronized Go int64 fixture expressions.
 */
function networkExpected(value: unknown): unknown {
  const expression = (value as { $expr?: string } | undefined)?.$expr;
  const match = expression ? /^int64\((\d+)\)$/.exec(expression) : undefined;
  return match ? BigInt(match[1]!) : value;
}

describe("ext/network_test.go/TestNetwork_RuntimeErrors", () => {
  it("reports invalid dynamic IP and CIDR arguments", () => {
    const celEnv = env({ libraries: [network()] });
    for (const testCase of syncedCases<NetworkCase>(
      "ext/network_test.go/TestNetwork_RuntimeErrors",
    )) {
      expect(
        String(celEnv.program(celEnv.compile(testCase.expr)).eval({})),
        testCase.name,
      ).toContain(testCase.errContains);
    }
  });
});

describe("ext/network_test.go/TestNetwork_TypeConversions", () => {
  it("converts IP and CIDR values to native strings and CEL types", () => {
    const celEnv = env({ libraries: [network()] });
    const ip = celEnv.program(celEnv.compile("ip('1.2.3.4')")).eval({});
    const cidr = celEnv.program(celEnv.compile("cidr('10.0.0.0/8')")).eval({});

    expect(ip.convertToNative(String)).toBe("1.2.3.4");
    expect(cidr.convertToNative(String)).toBe("10.0.0.0/8");
    expect(ip.convertToType(StringType).value()).toBe("1.2.3.4");
    expect(cidr.convertToType(StringType).value()).toBe("10.0.0.0/8");
    expect(ip.convertToType(TypeType)).toBe(ip.type());
    expect(cidr.convertToType(TypeType)).toBe(cidr.type());
    expect(() => ip.convertToNative(Number)).toThrow("unsupported type conversion");
    expect(() => cidr.convertToNative(Number)).toThrow("unsupported type conversion");
  });
});

describe("ext/network_test.go/TestNetwork_CompileErrors", () => {
  it("validates literal constructor arguments at compile time", () => {
    const celEnv = env({ libraries: [network()] });
    for (const testCase of syncedCases<NetworkCase>(
      "ext/network_test.go/TestNetwork_CompileErrors",
    )) {
      const errors = celEnv.tryCompile(testCase.expr).errors?.toDisplayString();
      if (testCase.errContains) {
        expect(errors, testCase.name).toContain(testCase.errContains);
      } else {
        expect(errors, testCase.name).toBeUndefined();
      }
    }
  });
});

describe("ext/network_test.go/TestNetworkCost", () => {
  it("matches every synchronized network checker and runtime cost", () => {
    const celEnv = env({ libraries: [network()] });
    for (const testCase of syncedCases<NetworkCostCase>(
      "ext/network_test.go/TestNetworkCost",
    )) {
      const ast = celEnv.compile(testCase.expr);
      const estimate = celEnv.estimateCost(ast);
      expect([estimate.Min, estimate.Max], testCase.name).toEqual(
        parseNetworkCost(testCase.estimatedCost.$expr),
      );
      const result = celEnv.program(ast, { costTracking: {} }).evalWithDetails({});
      expect(result.details.actualCost(), testCase.name).toBe(testCase.runtimeCost);
    }
  });
});

describe("ext/network_test.go/TestIPCost", () => {
  it("accounts for IPv4 and IPv6 parsing plus nominal receiver operations", () => {
    const celEnv = env({ libraries: [network()] });
    for (const [expression, expected] of [
      ["ip('192.168.0.1')", 2],
      ["ip('192.168.0.1').family()", 3],
      ["ip('2001:db8:3333:4444:5555:6666:7777:8888')", 4],
      ["ip('2001:db8:3333:4444:5555:6666:7777:8888').isLoopback()", 5],
    ] as const) {
      const ast = celEnv.compile(expression);
      const result = celEnv.program(ast, { costTracking: {} }).evalWithDetails({});
      expect(result.details.actualCost(), expression).toBe(expected);
    }
  });
});

describe("ext/network_test.go/TestCIDRCost", () => {
  it("accounts for CIDR parsing, nominal operations, and containment traversals", () => {
    const celEnv = env({ libraries: [network()] });
    for (const [expression, expected] of [
      ["cidr('192.168.0.0/16')", 2],
      ["cidr('192.168.0.0/16').prefixLength()", 3],
      ["cidr('192.168.0.0/16').containsIP('192.0.0.1')", 4],
      ["cidr('192.168.0.0/16').containsCIDR('192.0.0.0/30')", 7],
    ] as const) {
      const ast = celEnv.compile(expression);
      const result = celEnv.program(ast, { costTracking: {} }).evalWithDetails({});
      expect(result.details.actualCost(), expression).toBe(expected);
    }
  });
});

/** parseNetworkCost decodes CEL-Go fixed and ranged cost expressions. */
function parseNetworkCost(expression: string): [bigint, bigint] {
  const fixed = /^checker\.FixedCostEstimate\((\d+)\)$/.exec(expression);
  if (fixed) {
    const value = BigInt(fixed[1]!);
    return [value, value];
  }
  const ranged = /^checker\.CostEstimate\{Min: (\d+), Max: (\d+)\}$/.exec(expression);
  if (ranged) {
    return [BigInt(ranged[1]!), BigInt(ranged[2]!)];
  }
  throw new Error(`unsupported synchronized network cost: ${expression}`);
}

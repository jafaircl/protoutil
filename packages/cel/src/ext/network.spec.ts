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

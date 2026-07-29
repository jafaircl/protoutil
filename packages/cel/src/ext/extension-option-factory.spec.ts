import { describe, expect, it } from "vitest";
import { Extension } from "../common/env/env.js";
import { extensionOptionFactory } from "./extension-option-factory.js";

describe("ext/extension_option_factory_test.go/TestExtensionOptionFactoryInvalidExtension", () => {
  it("rejects values which are not extension configurations", () => {
    expect(extensionOptionFactory("invalid extension")).toEqual([undefined, false]);
  });
});

describe("ext/extension_option_factory_test.go/TestExtensionOptionFactoryInvalidExtensionName", () => {
  it("rejects unsupported extension names", () => {
    expect(extensionOptionFactory(new Extension("invalid extension name"))).toEqual([
      undefined,
      false,
    ]);
  });
});

describe("ext/extension_option_factory_test.go/TestExtensionOptionFactoryInvalidExtensionVersion", () => {
  it("reports the extension name and invalid version", () => {
    expect(() => extensionOptionFactory(new Extension("bindings", "invalid version"))).toThrow(
      "invalid extension version: bindings - invalid version",
    );
  });
});

describe("ext/extension_option_factory_test.go/TestExtensionOptionFactoryValidBindingsExtension", () => {
  it("creates the fully qualified bindings extension", () => {
    const [library, valid] = extensionOptionFactory(
      new Extension("cel.lib.ext.cel.bindings", "latest"),
    );

    expect(valid).toBe(true);
    expect(library).toMatchObject({
      libraryAlias: "bindings",
      libraryName: "cel.lib.ext.cel.bindings",
      libraryVersion: 0xffffffff,
    });
  });
});

describe("ext/extension_option_factory_test.go/TestExtensionOptionFactoryValidBindingsExtensionAlias", () => {
  it("creates the bindings extension from its alias", () => {
    const [library, valid] = extensionOptionFactory(new Extension("bindings", "latest"));

    expect(valid).toBe(true);
    expect(library).toMatchObject({
      libraryAlias: "bindings",
      libraryName: "cel.lib.ext.cel.bindings",
      libraryVersion: 0xffffffff,
    });
  });
});

import { describe, expect, it } from "vitest";
import { FieldBehavior } from "../gen/google/api/field_behavior_pb.js";
import { TestFieldBehaviorSchema } from "../gen/protoutil/aip/v1/fieldbehavior_pb.js";
import { fieldMaskFromBehavior, immutableMask, inputOnlyMask, outputOnlyMask } from "./mask.js";

describe("fieldMaskFromBehavior", () => {
  it("should exclude fields with the specified behavior", () => {
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY], {
      maxDepth: 0,
    });
    expect(mask.paths).toContain("normal");
    expect(mask.paths).toContain("identifier");
    expect(mask.paths).toContain("immutable");
    expect(mask.paths).toContain("input_only");
    expect(mask.paths).toContain("required");
    expect(mask.paths).not.toContain("output_only");
    expect(mask.paths).not.toContain("repeated_output_only");
    expect(mask.paths).not.toContain("output_only_child");
    expect(mask.paths).not.toContain("repeated_output_only_child");
    expect(mask.paths).not.toContain("map_output_only");
    expect(mask.paths).not.toContain("map_output_only_child");
  });

  it("should exclude multiple behaviors at once", () => {
    const mask = fieldMaskFromBehavior(
      TestFieldBehaviorSchema,
      [FieldBehavior.OUTPUT_ONLY, FieldBehavior.INPUT_ONLY],
      { maxDepth: 0 },
    );
    expect(mask.paths).toContain("normal");
    expect(mask.paths).not.toContain("output_only");
    expect(mask.paths).not.toContain("input_only");
    expect(mask.paths).not.toContain("repeated_output_only");
    expect(mask.paths).not.toContain("repeated_input_only");
  });

  it("should include all fields when no behaviors are excluded", () => {
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [], { maxDepth: 0 });
    // Should include every top-level field including oneof variants
    expect(mask.paths).toContain("normal");
    expect(mask.paths).toContain("output_only");
    expect(mask.paths).toContain("input_only");
    expect(mask.paths).toContain("immutable");
    expect(mask.paths).toContain("identifier");
    expect(mask.paths).toContain("required");
  });

  it("should recurse into message fields", () => {
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY], {
      maxDepth: 1,
    });
    // normal_child is not OUTPUT_ONLY, so we should recurse into it
    expect(mask.paths).not.toContain("normal_child");
    // Its non-OUTPUT_ONLY sub-fields should be present as dotted paths
    expect(mask.paths).toContain("normal_child.normal");
    expect(mask.paths).toContain("normal_child.identifier");
    expect(mask.paths).toContain("normal_child.immutable");
    // Its OUTPUT_ONLY sub-fields should be excluded
    expect(mask.paths).not.toContain("normal_child.output_only");
    expect(mask.paths).not.toContain("normal_child.repeated_output_only");
  });

  it("should recurse into repeated message fields with wildcard paths", () => {
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY], {
      maxDepth: 1,
    });
    // repeated_normal_child is not OUTPUT_ONLY and has message values
    expect(mask.paths).not.toContain("repeated_normal_child");
    expect(mask.paths).toContain("repeated_normal_child.*.normal");
    expect(mask.paths).toContain("repeated_normal_child.*.identifier");
    expect(mask.paths).not.toContain("repeated_normal_child.*.output_only");
  });

  it("should recurse into map message fields with wildcard paths", () => {
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY], {
      maxDepth: 1,
    });
    // map_normal_child is not OUTPUT_ONLY and has message values
    expect(mask.paths).not.toContain("map_normal_child");
    expect(mask.paths).toContain("map_normal_child.*.normal");
    expect(mask.paths).toContain("map_normal_child.*.identifier");
    expect(mask.paths).not.toContain("map_normal_child.*.output_only");
  });

  it("should not recurse into scalar list fields", () => {
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY], {
      maxDepth: 1,
    });
    // repeated_identifier is a repeated string, not a message — should appear as a leaf path
    expect(mask.paths).toContain("repeated_identifier");
  });

  it("should not recurse into scalar map fields", () => {
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY], {
      maxDepth: 1,
    });
    // map_normal is a map<string, string>, not a message — should appear as a leaf path
    expect(mask.paths).toContain("map_normal");
  });

  it("should stop recursing at maxDepth and include the field path as-is", () => {
    const shallowMask = fieldMaskFromBehavior(
      TestFieldBehaviorSchema,
      [FieldBehavior.OUTPUT_ONLY],
      { maxDepth: 0 },
    );
    // At depth 0, message fields are included as leaf paths without recursion
    expect(shallowMask.paths).toContain("normal_child");
    expect(shallowMask.paths).not.toContain("normal_child.normal");

    const deeperMask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY], {
      maxDepth: 1,
    });
    // At depth 1, we recurse one level but message sub-fields hit the limit
    expect(deeperMask.paths).not.toContain("normal_child");
    expect(deeperMask.paths).toContain("normal_child.normal");
    // Self-referential nested messages at the limit are included as leaf paths
    expect(deeperMask.paths).toContain("normal_child.normal_child");
    expect(deeperMask.paths).not.toContain("normal_child.normal_child.normal");
  });

  it("should handle self-referential schemas via cycle detection", () => {
    // TestFieldBehavior references itself. Even with a high maxDepth,
    // cycle detection should prevent infinite recursion.
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY], {
      maxDepth: 10,
    });
    // Should not throw and should produce a valid mask
    expect(mask.paths.length).toBeGreaterThan(0);
    // At depth 1, we recurse into normal_child. At depth 2, we encounter
    // TestFieldBehavior again (already visited), so sub-message fields
    // become leaf paths.
    expect(mask.paths).toContain("normal_child.normal");
    expect(mask.paths).toContain("normal_child.normal_child");
  });

  it("should exclude oneof variants with the specified behavior", () => {
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY], {
      maxDepth: 0,
    });
    expect(mask.paths).toContain("normal_oneof");
    expect(mask.paths).toContain("normal_oneof_child");
    expect(mask.paths).toContain("identifier_oneof");
    expect(mask.paths).toContain("immutable_oneof");
    expect(mask.paths).not.toContain("output_only_oneof");
    expect(mask.paths).toContain("input_only_oneof");
  });

  it("should default maxDepth to 5", () => {
    // Should not throw even without explicit maxDepth on a self-referential schema
    const mask = fieldMaskFromBehavior(TestFieldBehaviorSchema, [FieldBehavior.OUTPUT_ONLY]);
    expect(mask.paths.length).toBeGreaterThan(0);
  });
});

describe("outputOnlyMask", () => {
  it("should exclude OUTPUT_ONLY fields", () => {
    const mask = outputOnlyMask(TestFieldBehaviorSchema, { maxDepth: 0 });
    expect(mask.paths).not.toContain("output_only");
    expect(mask.paths).not.toContain("repeated_output_only");
    expect(mask.paths).not.toContain("output_only_child");
    expect(mask.paths).toContain("normal");
    expect(mask.paths).toContain("input_only");
  });
});

describe("inputOnlyMask", () => {
  it("should exclude INPUT_ONLY fields", () => {
    const mask = inputOnlyMask(TestFieldBehaviorSchema, { maxDepth: 0 });
    expect(mask.paths).not.toContain("input_only");
    expect(mask.paths).not.toContain("repeated_input_only");
    expect(mask.paths).not.toContain("input_only_child");
    expect(mask.paths).toContain("normal");
    expect(mask.paths).toContain("output_only");
  });
});

describe("immutableMask", () => {
  it("should exclude IMMUTABLE fields", () => {
    const mask = immutableMask(TestFieldBehaviorSchema, { maxDepth: 0 });
    expect(mask.paths).not.toContain("immutable");
    expect(mask.paths).not.toContain("repeated_immutable");
    expect(mask.paths).not.toContain("immutable_child");
    expect(mask.paths).toContain("normal");
    expect(mask.paths).toContain("output_only");
    expect(mask.paths).toContain("input_only");
  });
});

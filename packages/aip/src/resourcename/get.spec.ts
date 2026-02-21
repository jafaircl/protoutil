import { compileMessage } from "@bufbuild/protocompile";
import { describe, expect, it } from "vitest";
import { UserEventSchema } from "../gen/protoutil/aip/v1/resourcename_pb.js";
import { getResourceDescriptor, getResourceNamePatterns, hasResourceDescriptor } from "./get.js";

describe("get", () => {
  it("should get the resource descriptor", () => {
    expect(hasResourceDescriptor(UserEventSchema)).toBeTruthy();

    const desc = getResourceDescriptor(UserEventSchema);
    expect(desc).toBeDefined();
    expect(desc?.type).toEqual("example.googleapis.com/UserEvent");

    const patterns = getResourceNamePatterns(UserEventSchema);
    expect(patterns).toEqual([
      "projects/{project}/users/{user}/events/{event}",
      "users/{user}/events/{event}",
    ]);
  });

  it("should return undefined no resource options", () => {
    const EmptyMessageSchema = compileMessage(`
      syntax = "proto3";
      
      message EmptyMessage {}
    `);
    expect(hasResourceDescriptor(EmptyMessageSchema)).toBeFalsy();

    const desc = getResourceDescriptor(EmptyMessageSchema);
    expect(desc).toBeUndefined();

    const patterns = getResourceNamePatterns(EmptyMessageSchema);
    expect(patterns).toBeUndefined();
  });
});

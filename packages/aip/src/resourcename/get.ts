import { type DescMessage, getOption, hasOption } from "@bufbuild/protobuf";
import { resource } from "../gen/google/api/resource_pb.js";

/**
 * Checks if the provided message descriptor has a resource descriptor.
 *
 * @param desc the message descriptor to check
 */
export function hasResourceDescriptor<Desc extends DescMessage>(desc: Desc): boolean {
  return hasOption(desc, resource);
}

/**
 * Get the resource descriptor of the provided message descriptor.
 *
 * @param desc the message descriptor
 */
export function getResourceDescriptor<Desc extends DescMessage>(desc: Desc) {
  if (hasResourceDescriptor(desc)) {
    return getOption(desc, resource);
  }
  return undefined;
}

/**
 * Get the resource name patterns of the provided message descriptor.
 *
 * @param desc the message descriptor
 */
export function getResourceNamePatterns<Desc extends DescMessage>(
  desc: Desc,
): string[] | undefined {
  const descriptor = getResourceDescriptor(desc);
  if (descriptor) {
    return descriptor.pattern;
  }
  return undefined;
}

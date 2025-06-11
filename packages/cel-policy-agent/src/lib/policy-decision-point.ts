/* eslint-disable @typescript-eslint/no-explicit-any */
import { Policy } from './policy.js';

export class PolicyDecisionPoint {
  #policyMap = new Map<string, Policy>();

  /**
   * Add a policy to the decision point. If a policy with the same name already exists,
   * it will be replaced with the new policy.
   */
  add(policy: Policy) {
    this.#policyMap.set(policy.name, policy);
  }

  /**
   * Get a policy by name. Returns undefined if the policy does not exist.
   */
  get(name: string): Policy | undefined {
    return this.#policyMap.get(name);
  }

  /**
   * Check if a policy with the given name exists in the decision point.
   */
  has(name: string): boolean {
    return this.#policyMap.has(name);
  }

  /**
   * Remove a policy by name. Returns true if the policy was removed, false if it did not exist.
   */
  delete(name: string): boolean {
    return this.#policyMap.delete(name);
  }

  /**
   * Clear all policies from the decision point. This will remove all policies and leave the
   * decision point empty.
   */
  clear() {
    this.#policyMap.clear();
  }

  /**
   * Get all policies in the decision point as an array
   */
  get policies(): Policy[] {
    return Array.from(this.#policyMap.values());
  }

  /**
   * Pass a set of bindings to the policies in the decision point to determine if any policy
   * in the decision point allows the action described by the bindings.
   */
  allow(bindings: Map<string, any> | Record<string, any>): {
    policy?: string;
    allowed: boolean;
    elapsed: number;
  } {
    const start = performance.now();
    for (const policy of this.#policyMap.values()) {
      // If the bindings do not match the environment variables required by the policy,
      // skip the policy.
      if (!policy.check(bindings)) {
        continue;
      }
      // If the policy allows the bindings, return the policy name and elapsed time.
      if (policy.allow(bindings)) {
        return {
          policy: policy.name,
          allowed: true,
          elapsed: performance.now() - start,
        };
      }
    }
    // If no policy allows the bindings, return undefined and elapsed time.
    return {
      policy: undefined,
      allowed: false,
      elapsed: performance.now() - start,
    };
  }
}

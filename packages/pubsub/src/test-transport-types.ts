import type { PubSubBenchmarkContext } from "./benchmark-cases.js";
import type { PubSubTransportTestContext } from "./test-cases.js";

/** Shared transport adapter used by load and benchmark specs. */
export interface PubSubTestTransportAdapter {
  /** Human-readable transport name used in benchmark output and test titles. */
  name: string;
  /** Build a shared transport test context for a single isolated run. */
  testContext(suffix: string): PubSubTransportTestContext;
  /** Build a shared transport benchmark context for a single isolated run. */
  benchmarkContext(suffix: string): PubSubBenchmarkContext;
}

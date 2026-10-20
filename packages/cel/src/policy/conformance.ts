/**
 * TestSuite describes a set of tests divided by section.
 *
 * @deprecated Prefer the CEL conformance suite protobuf model for new harnesses.
 */
export interface TestSuite {
  /** description summarizes the suite. */
  description: string;
  /** sections groups related policy scenarios. */
  sections: TestSection[];
}

/**
 * TestSection describes related tests associated with a behavior.
 */
export interface TestSection {
  /** name identifies the section. */
  name: string;
  /** tests contains the section's scenarios. */
  tests: TestCase[];
}

/**
 * TestCase describes a named scenario with inputs and an expected output expression.
 *
 * When a test requires additional functions, the test harness must provide them.
 */
export interface TestCase {
  /** name identifies the scenario. */
  name: string;
  /** input maps activation names to literal or expression inputs. */
  input: Record<string, TestInput>;
  /** output is the expected CEL expression. */
  output: string;
}

/**
 * TestInput represents an input literal value or expression.
 */
export interface TestInput {
  /** value is a simple literal value. */
  value?: unknown;
  /** expr is a CEL expression-based input. */
  expr?: string;
  /** contextExpr is evaluated and exposed as CEL context protobuf variables. */
  contextExpr?: string;
}

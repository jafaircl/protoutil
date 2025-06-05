import { DescMessage } from '@bufbuild/protobuf';
import { CostOption, EnvOption, listType, objectType, types, variable } from '@protoutil/cel';

/**
 * Creates an environment option that registers a variable with the given name as a list of Protobuf
 * messages of the specified schema type. Can be used to define an SQL table schema in Protobuf and
 * treat it as a list of objects in CELQL.
 */
export function protoTable(name: string, schema: DescMessage): EnvOption {
  return (env) => {
    env.configure(types(schema), variable(name, listType(objectType(schema.typeName))));
    return env;
  };
}

/**
 * Creates an environment option that will help the CostEstimator to estimate the cost of
 * operations on a table with the given name and count of rows. For example, if you have a table
 * and want to filter it, you can use this option to help the cost estimator understand how
 * expensive the operation is. This can help make informed desisions about whether to execute
 * the operation or not, based on the cost.
 *
 * ```typescript
 * import { DefaultEnv, protoTable, tableRowCount, translateDefault } from '@protoutil/celql';
 *
 * const env = new DefaultEnv(
 *   protoTable('my_table', MyTableSchema),
 *   tableRowCount('my_table', 1000)
 * );
 * translateDefault('my_table.field == "value"', env);
 * // The cost estimator will now know that the table has 1000 rows, and can multiply the cost
 * // of the operation by that number to arrive at a more accurate cost estimate for the query
 * ```
 */
export function tableRowCount(name: string, count: number): CostOption {
  return (c) => {
    c.variableCostFunctions.set(name, (e) => e.multiplyByCostFactor(count));
    return c;
  };
}

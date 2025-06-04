import { DescMessage } from '@bufbuild/protobuf';
import { EnvOption, listType, objectType, types, variable } from '@protoutil/cel';

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

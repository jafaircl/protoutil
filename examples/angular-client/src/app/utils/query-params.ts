/**
 * Converts any value with a `toString()` method to a queryparam,
 * treating null/undefined and the provided default value as null
 * (i.e. omitting the query param from the URL).
 *
 * @param config the config object
 */
export function stringifyQueryParam<T>(
  config: { defaultValue: T | null } = { defaultValue: null },
) {
  return (param: T | null) => {
    if (!param || param === config?.defaultValue) return null;
    return param.toString();
  };
}

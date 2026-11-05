import type { RequestOptions } from "./RequestOptions.ts";

/**
 * Applies the request's `reviver` and `shouldParseDates` options to one parsed
 * JSON value. `thisArg` is the `this` the reviver is called with.
 */
export function reviveJsonValue(
  thisArg: unknown,
  options: RequestOptions | undefined,
  key: string,
  value: unknown,
): unknown {
  let revived = value;

  if (options?.reviver) {
    revived = options.reviver.call(thisArg, key, revived);
  }

  if (options?.shouldParseDates) {
    revived = tryParseDate(revived);
  }

  return revived;
}

function tryParseDate(value: unknown): unknown {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

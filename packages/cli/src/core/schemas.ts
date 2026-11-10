import * as v from 'valibot';

/*
 * Reusable valibot building blocks. Shared so schema definitions don't
 * redefine the same primitives — and so the inner `v.string()`/`v.unknown()`
 * calls stay shallow enough to satisfy `unicorn/max-nested-calls`.
 */

/**
 * Reusable `string[]` schema.
 */
export const StringArray = v.array(v.string());

const notArray = v.check<unknown>(value => !Array.isArray(value));

/*
`v.record` accepts an array, whose indices pass as string keys, so every
record here rejects one first.
*/
const recordOf = <TValue extends v.GenericSchema>(value: TValue): v.SchemaWithPipe<readonly [
  v.UnknownSchema,
  typeof notArray,
  v.RecordSchema<v.StringSchema<undefined>, TValue, undefined>,
]> => v.pipe(v.unknown(), notArray, v.record(v.string(), value));

/**
 * Reusable `Record<string, string>` schema (e.g. dependency maps).
 */
export const StringRecord = recordOf(v.string());

/**
 * Reusable `Record<string, unknown>` schema (e.g. compilerOptions).
 */
export const UnknownRecord = recordOf(v.unknown());

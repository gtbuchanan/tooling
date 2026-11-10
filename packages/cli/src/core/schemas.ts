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

/**
 * Reusable `Record<string, string>` schema (e.g. dependency maps).
 */
export const StringRecord = v.record(v.string(), v.string());

/*
`v.record` accepts an array, whose indices pass as string keys.
*/
const notArray = v.check<unknown>(value => !Array.isArray(value));

/**
 * Reusable `Record<string, unknown>` schema (e.g. compilerOptions). Rejects
 * an array, which a rewrite spreading the record would turn into index keys.
 */
export const UnknownRecord = v.pipe(v.unknown(), notArray, v.record(v.string(), v.unknown()));

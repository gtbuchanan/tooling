import * as v from 'valibot';

/*
 * Reusable valibot building blocks. Shared so schema definitions don't
 * redefine the same primitives — and so the inner `v.string()`/`v.unknown()`
 * calls stay shallow enough to satisfy `unicorn/max-nested-calls`.
 */

/** Reusable `string[]` schema. */
export const StringArray = v.array(v.string());

/** Reusable `Record<string, string>` schema (e.g. dependency maps). */
export const StringRecord = v.record(v.string(), v.string());

/** Reusable `Record<string, unknown>` schema (e.g. compilerOptions). */
export const UnknownRecord = v.record(v.string(), v.unknown());

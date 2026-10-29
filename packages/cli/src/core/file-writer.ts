import { readFileSync, writeFileSync } from 'node:fs';
import * as v from 'valibot';
import { ManifestSchema } from './manifest.ts';
import { UnknownRecord } from './schemas.ts';
import { localeComparer } from './sort.ts';

const jsonIndent = 2;

/**
 * Recursively sorts object keys alphabetically. Arrays and primitives are unchanged.
 */
export const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const entries: [string, unknown][] = Object.entries(value);
    return Object.fromEntries(
      entries
        .toSorted(([left], [right]) => localeComparer(left, right))
        .map(([key, val]) => [key, sortKeysDeep(val)]),
    );
  }
  return value;
};

/**
 * Result of merging scripts into a package.json.
 */
export interface MergeResult {
  /**
   * Script names that were added or overwritten.
   */
  readonly added: readonly string[];
  /**
   * Script names that were skipped (already exist, no force).
   */
  readonly skipped: readonly string[];
}

/**
 * Reads and parses a JSON file as a plain object.
 */
export const readJsonFile = (path: string): Record<string, unknown> =>
  v.parse(UnknownRecord, JSON.parse(readFileSync(path, 'utf8')));

/**
 * Writes a JSON object to a file with formatting and trailing newline.
 */
export const writeJsonFile = (path: string, data: unknown): void => {
  writeFileSync(path, `${JSON.stringify(data, undefined, jsonIndent)}\n`);
};

const classifyScripts = (
  existing: Record<string, string>,
  expected: Readonly<Record<string, string>>,
  shouldForce: boolean,
): MergeResult & { readonly merged: Record<string, string> } => {
  const added: string[] = [];
  const skipped: string[] = [];
  const merged = { ...existing };

  for (const [name, value] of Object.entries(expected)) {
    if (!shouldForce && Object.hasOwn(existing, name)) {
      skipped.push(name);
    } else {
      merged[name] = value;
      added.push(name);
    }
  }

  return { added, merged, skipped };
};

/**
 * Merges expected scripts into a package.json file.
 * Without force, existing script values are preserved.
 * With force, all expected scripts overwrite existing values.
 * Preserves all non-script fields in the original package.json.
 */
export const mergePackageScripts = (
  path: string,
  expected: Readonly<Record<string, string>>,
  shouldForce: boolean,
): MergeResult => {
  const raw = readJsonFile(path);
  const manifest = v.parse(ManifestSchema, raw);
  const { added, merged, skipped } = classifyScripts(
    manifest.scripts ?? {}, expected, shouldForce,
  );

  /*
   * Write back to the raw parsed object instead of the valibot output.
   * Valibot reorders keys (schema-defined first, rest after), but
   * Prettier expects conventional package.json key order to be preserved.
   */
  raw['scripts'] = sortKeysDeep(merged);
  writeJsonFile(path, raw);

  return { added, skipped };
};

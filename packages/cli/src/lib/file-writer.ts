import { readFileSync, writeFileSync } from 'node:fs';
import * as v from 'valibot';
import { ManifestSchema } from './manifest.ts';

const jsonIndent = 2;

/** Result of merging scripts into a package.json. */
export interface MergeResult {
  /** Script names that were added or overwritten. */
  readonly added: readonly string[];
  /** Script names that were skipped (already exist, no force). */
  readonly skipped: readonly string[];
}

/** Writes a JSON object to a file with formatting and trailing newline. */
export const writeJsonFile = (path: string, data: unknown): void => {
  writeFileSync(path, `${JSON.stringify(data, null, jsonIndent)}\n`);
};

const classifyScripts = (
  existing: Record<string, string>,
  expected: Readonly<Record<string, string>>,
  force: boolean,
): MergeResult & { readonly merged: Record<string, string> } => {
  const added: string[] = [];
  const skipped: string[] = [];
  const merged = { ...existing };

  for (const [name, value] of Object.entries(expected)) {
    if (!force && name in existing) {
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
  force: boolean,
): MergeResult => {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  const manifest = v.parse(ManifestSchema, raw);
  const { added, merged, skipped } = classifyScripts(
    manifest.scripts ?? {}, expected, force,
  );

  writeJsonFile(path, { ...manifest, scripts: merged });

  return { added, skipped };
};

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as v from 'valibot';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { CodecovSections } from './codecov-config.ts';
import { ManifestSchema } from './manifest.ts';

const jsonIndent = 2;

/** Result of merging scripts into a package.json. */
export interface MergeResult {
  /** Script names that were added or overwritten. */
  readonly added: readonly string[];
  /** Script names that were skipped (already exist, no force). */
  readonly skipped: readonly string[];
}

/** Reads and parses a JSON file. */
export const readJsonFile = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf-8'));

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
  const raw = readJsonFile(path);
  const manifest = v.parse(ManifestSchema, raw);
  const { added, merged, skipped } = classifyScripts(
    manifest.scripts ?? {}, expected, force,
  );

  writeJsonFile(path, { ...manifest, scripts: merged });

  return { added, skipped };
};

/** Writes a YAML object to a file with a trailing newline. */
export const writeYamlFile = (path: string, data: unknown): void => {
  writeFileSync(path, stringifyYaml(data));
};

const ExistingCodecovSchema = v.nullable(
  v.looseObject({
    component_management: v.optional(v.nullable(v.looseObject({}))),
  }),
);

/**
 * Merges generated codecov sections into a `codecov.yml` file.
 * Overwrites `flags` and `component_management.individual_components`
 * with the generated values. Preserves all other keys, including
 * `component_management.default_rules`.
 * Creates the file if it does not exist.
 * Throws if the existing file contains invalid YAML.
 */
export const mergeCodecovSections = (path: string, sections: CodecovSections): void => {
  let rawYaml: unknown = null;
  if (existsSync(path)) {
    try {
      rawYaml = parseYaml(readFileSync(path, 'utf-8'));
    } catch {
      throw new Error(`${path}: invalid YAML — fix or delete it and re-run gtb turbo:init`);
    }
  }
  const existing = v.parse(ExistingCodecovSchema, rawYaml) ?? {};
  const existingComponentMgmt = existing.component_management ?? {};

  const merged = {
    ...existing,
    component_management: {
      ...existingComponentMgmt,
      individual_components: sections.component_management.individual_components,
    },
    flags: sections.flags,
  };

  writeYamlFile(path, merged);
};

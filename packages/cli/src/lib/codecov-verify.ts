import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { parse as parseYaml } from 'yaml';
import { type CodecovSections, generateCodecovSections } from './codecov-config.ts';
import type { WorkspaceDiscovery } from './discovery.ts';

const CodecovYamlSchema = v.nullable(
  v.looseObject({
    codecov: v.optional(
      v.looseObject({ require_ci_to_pass: v.optional(v.boolean()) }),
    ),
    component_management: v.optional(
      v.looseObject({
        individual_components: v.optional(
          v.array(v.looseObject({ component_id: v.optional(v.string()) })),
        ),
      }),
    ),
    flags: v.optional(v.record(v.string(), v.unknown())),
  }),
);

interface ActualCodecov { readonly require_ci_to_pass?: boolean | undefined }

interface ActualComponent { readonly component_id?: string | undefined }

type ReadCodecovResult =
  | { readonly data: unknown; readonly errors?: undefined }
  | { readonly errors: readonly string[] };

const readCodecovYaml = (filePath: string): ReadCodecovResult => {
  if (!existsSync(filePath)) {
    return { errors: ['codecov.yml is missing (run gtb sync)'] };
  }
  try {
    return { data: parseYaml(readFileSync(filePath, 'utf8')) };
  } catch {
    return { errors: ['codecov.yml: invalid YAML (run gtb sync)'] };
  }
};

const checkCodecovFlags = (
  actualFlags: Record<string, unknown> | undefined,
  expected: CodecovSections,
  ignored: ReadonlySet<string>,
): readonly string[] =>
  Object.keys(expected.flags)
    .filter(name => !ignored.has(name))
    .filter(name => actualFlags === undefined || !(name in actualFlags))
    .map(name => `codecov.yml: missing flag '${name}'`);

const checkCodecovSettings = (
  actualCodecov: ActualCodecov | undefined,
  expected: CodecovSections,
): readonly string[] =>
  actualCodecov?.require_ci_to_pass === expected.codecov.require_ci_to_pass
    ? []
    : ['codecov.yml: codecov.require_ci_to_pass must be false (run gtb sync)'];

const checkCodecovComponents = (
  actualComponents: readonly ActualComponent[],
  expected: CodecovSections,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const actualIds = new Set(actualComponents.map(comp => comp.component_id));

  return expected.component_management.individual_components
    .filter(({ component_id: id }) => !ignored.has(id))
    .filter(({ component_id: id }) => !actualIds.has(id))
    .map(({ component_id: id }) => `codecov.yml: missing component '${id}'`);
};

/**
 * Drift check for `gtb verify codecov`: compares the on-disk `codecov.yml`
 * settings/flags/components against the baseline {@link generateCodecovSections}
 * derives from discovery. Returns drift messages (empty = no drift).
 */
export const checkCodecovSections = (
  rootDir: string,
  discovery: WorkspaceDiscovery,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const filePath = path.join(rootDir, 'codecov.yml');
  const readResult = readCodecovYaml(filePath);
  if (readResult.errors !== undefined) {
    return readResult.errors;
  }
  const parseResult = v.safeParse(CodecovYamlSchema, readResult.data);
  if (!parseResult.success || parseResult.output === null) {
    return ['codecov.yml: failed to parse'];
  }
  const {
    codecov: actualCodecov,
    flags: actualFlags,
    component_management: actualCm,
  } = parseResult.output;
  const expected = generateCodecovSections(discovery);

  return [
    ...checkCodecovSettings(actualCodecov, expected),
    ...checkCodecovFlags(actualFlags, expected, ignored),
    ...checkCodecovComponents(actualCm?.individual_components ?? [], expected, ignored),
  ];
};

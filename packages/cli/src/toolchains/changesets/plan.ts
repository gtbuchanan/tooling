import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { isGtbBuild } from '#src/core/discovery.js';
import { jsonContent } from '#src/core/file-writer.js';
import { UnknownRecord } from '#src/core/schemas.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';

/*
`v.record` accepts an array, which spreading would turn into index keys.
*/
const JsonObject = v.pipe(
  v.unknown(),
  v.check(value => !Array.isArray(value)),
  UnknownRecord,
);

type ReadResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'object'; readonly value: Record<string, unknown> };

const readConfig = (filePath: string): ReadResult => {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return { kind: 'absent' };
  }
  try {
    const result = v.safeParse(JsonObject, JSON.parse(text));
    return result.success ? { kind: 'object', value: result.output } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
};

/**
 * Disables changesets' CHANGELOG formatting. `gtb version` ends with `hk fix`,
 * which formats the CHANGELOGs with eslint-config's options. Under the
 * `"auto"` default, `changeset version` first runs a root-installed prettier
 * with its own options, and changesets has no CLI flag that turns this off.
 * gtb owns only `format`; every other key is carried through a rewrite.
 *
 * A repo without `.changeset/config.json` doesn't release through changesets,
 * and one that doesn't build with gtb doesn't run `gtb version`, so neither
 * gets anything.
 */
export const planChangesetsConfig = ({ discovery }: PlanContext): readonly Finding[] => {
  if (!isGtbBuild(discovery)) {
    return [];
  }
  const filePath = path.join(discovery.rootDir, '.changeset', 'config.json');
  const config = readConfig(filePath);
  switch (config.kind) {
    case 'absent': {
      return [];
    }
    case 'invalid': {
      return [{
        kind: 'problem',
        message: `${filePath}: could not be parsed as a JSON object — fix it by hand`,
      }];
    }
    case 'object': {
      return config.value['format'] === false
        ? []
        : [{
            changes: ['format should be false'],
            content: jsonContent({ ...config.value, format: false }),
            kind: 'write',
            path: filePath,
          }];
    }
  }
};

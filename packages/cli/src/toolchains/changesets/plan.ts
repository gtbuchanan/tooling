import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { isGtbBuild } from '#src/core/discovery.js';
import { jsonContent } from '#src/core/file-writer.js';
import { UnknownRecord } from '#src/core/schemas.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';

type ReadResult =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'notFile' }
  | { readonly kind: 'object'; readonly value: Record<string, unknown> };

const parseObject = (text: string): ReadResult => {
  try {
    const result = v.safeParse(UnknownRecord, JSON.parse(text));
    return result.success ? { kind: 'object', value: result.output } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
};

/*
Only a missing path means the repo doesn't use changesets. Any other read
failure throws, since passing it would skip the check silently.
*/
const readConfig = (filePath: string): ReadResult => {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (stats === undefined) {
    return { kind: 'absent' };
  }

  return stats.isFile() ? parseObject(readFileSync(filePath, 'utf8')) : { kind: 'notFile' };
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
    case 'notFile': {
      return [{
        kind: 'problem',
        message: `${filePath}: not a file — replace it with the changesets config`,
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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import type { CheckContext } from '#src/tasks/toolchain.js';

const configPath = '.changeset/config.json';

const FormatDisabled = v.looseObject({ format: v.literal(false) });

const readConfig = (rootDir: string): string | undefined => {
  try {
    return readFileSync(path.join(rootDir, configPath), 'utf8');
  } catch {
    return undefined;
  }
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Flags a changesets config that leaves CHANGELOG formatting to changesets.
 * `gtb version` ends with `hk fix`, which formats the CHANGELOGs with
 * eslint-config's options. Under the `"auto"` default, `changeset version`
 * first runs a root-installed prettier with its default options, a second
 * pass that only hk can undo. Changesets has no CLI flag that turns this off,
 * so `gtb version` can't, and the config is hand-authored, so `gtb sync`
 * doesn't write it.
 *
 * A repo without `.changeset/config.json` doesn't release through changesets
 * and passes.
 */
export const checkChangelogFormatting = (
  { discovery: { rootDir } }: CheckContext,
): readonly string[] => {
  const text = readConfig(rootDir);
  if (text === undefined) {
    return [];
  }

  return v.is(FormatDisabled, parseJson(text))
    ? []
    : [
        `${configPath}: set "format": false — gtb version formats the CHANGELOGs ` +
        'with hk, and changesets would otherwise format them first',
      ];
};

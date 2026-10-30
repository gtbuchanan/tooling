import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { pklModules } from '#src/toolchains/pkl/commands/typecheck-pkl.js';
import { createTempDir } from '#test/helpers.js';

describe.concurrent(pklModules, () => {
  it('lists .pkl modules sorted, excluding the extensionless PklProject', ({ expect }) => {
    const dir = createTempDir();
    writeFileSync(path.join(dir, 'Zebra.pkl'), '');
    writeFileSync(path.join(dir, 'Defaults.pkl'), '');
    writeFileSync(path.join(dir, 'PklProject'), '');
    writeFileSync(path.join(dir, 'README.md'), '');

    expect(pklModules(dir)).toStrictEqual(['Defaults.pkl', 'Zebra.pkl']);
  });

  it('returns empty when the directory has no Pkl modules', ({ expect }) => {
    const dir = createTempDir();
    writeFileSync(path.join(dir, 'package.json'), '{}');

    expect(pklModules(dir)).toStrictEqual([]);
  });
});

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { runSync } from '#src/codegen/commands/sync.js';
import { captureLogger, createTempDir, writeJson } from '#test/helpers.js';

describe.concurrent(runSync, () => {
  /*
   * The root tsconfig sync writes is what gives a single-package root the
   * typescript capability, so a later step planning from discovery taken
   * before that write would leave its output to a second sync.
   */
  it('settles in one run when a write changes what discovery finds', ({ expect }) => {
    const root = createTempDir();
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'index.ts'), '');
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/cli': build.semverRange() },
      name: build.packageName(),
      version: build.semverVersion(),
    });
    const { logger } = captureLogger();
    const read = () => ['package.json', 'turbo.json']
      .map(name => readFileSync(path.join(root, name), 'utf8'));

    runSync({ cwd: root, logger });
    const afterOne = read();
    runSync({ cwd: root, logger });

    expect(read()).toStrictEqual(afterOne);
  });
});

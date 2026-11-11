import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { runSync, syncCommand } from '#src/codegen/commands/sync.js';
import { runVerify } from '#src/codegen/commands/verify.js';
import { captureLogger, createPklWorkspace, pklProjectSource } from '#test/helpers.js';
import { createWorkspaceDepProject } from '#test/toolchains/npm/fixtures.js';

const createStalePklWorkspace = () => {
  const ws = createPklWorkspace();
  const filePath = path.join(ws.pkgDir, 'PklProject');
  const synced = pklProjectSource({ name: ws.name, repoPath: ws.repoPath, version: ws.version });
  writeFileSync(filePath, synced.replace(`"${ws.version}"`, '"0.0.0-stale"'));

  return { filePath, synced, ws };
};

describe.concurrent('toolchain plans', () => {
  it('sync writes what a toolchain plans', ({ expect }) => {
    const { filePath, synced, ws } = createStalePklWorkspace();
    const { logger } = captureLogger();

    runSync({ cwd: ws.root, logger });

    expect(readFileSync(filePath, 'utf8')).toBe(synced);
  });

  it('verify reports what a toolchain plans to write', ({ expect }) => {
    const { filePath, ws } = createStalePklWorkspace();

    expect(runVerify({ cwd: ws.root }))
      .toStrictEqual([`${filePath}: out of date`, 'run gtb sync to apply these changes']);
  });

  /*
   * A problem is drift no sync can fix, so a sync that finds one fails, as
   * the hk fix step running it would otherwise pass over what the check step
   * reports.
   */
  it('sync reports what only a hand edit fixes and fails', ({ expect }) => {
    const { dependency, root } = createWorkspaceDepProject();
    const { err, logger } = captureLogger();

    expect(syncCommand({ cwd: root }, logger)).toBe(1);
    expect(err()).toContain(dependency.name);
  });
});

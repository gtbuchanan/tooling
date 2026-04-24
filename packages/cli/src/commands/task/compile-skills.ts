import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { readParsedManifest } from '../../lib/workspace.ts';

/**
 * Copies authored skills from `skills/` into `dist/source/skills/` so
 * `pack:npm` ships them in the published tarball. Mirrors the compile
 * semantics: source → dist/source/.
 */
export const compileSkills = defineCommand({
  meta: {
    description: 'Copy skills/ into dist/source/skills/ for packing',
    name: 'compile:skills',
  },
  run: () => {
    const pkgDir = process.cwd();
    const manifest = readParsedManifest(pkgDir);
    const dir = manifest.publishConfig?.directory;
    if (manifest.private === true || dir === undefined) {
      return;
    }

    const source = path.join(pkgDir, 'skills');
    if (!existsSync(source)) {
      return;
    }

    const destination = path.join(pkgDir, dir, 'skills');
    rmSync(destination, { force: true, recursive: true });
    cpSync(source, destination, { recursive: true });
  },
});

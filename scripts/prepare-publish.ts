import * as v from 'valibot';
import { ManifestSchema, buildOutput } from './lib/manifest.ts';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const JSON_INDENT = 2;

const NPMIGNORE = '*.tsbuildinfo\n';

const packagesDir = join(import.meta.dirname, '..', 'packages');

const preparePackage = (pkgDir: string): void => {
  const raw = readFileSync(join(pkgDir, 'package.json'), 'utf-8');
  const manifest = v.parse(ManifestSchema, JSON.parse(raw));
  const dir = manifest.publishConfig?.directory;
  if (manifest.private === true || dir === undefined) {
    return;
  }

  const target = join(pkgDir, dir);
  mkdirSync(target, { recursive: true });
  const json = JSON.stringify(buildOutput(manifest), null, JSON_INDENT);
  writeFileSync(join(target, 'package.json'), `${json}\n`);
  writeFileSync(join(target, '.npmignore'), NPMIGNORE);
};

for (const name of readdirSync(packagesDir)) {
  preparePackage(join(packagesDir, name));
}

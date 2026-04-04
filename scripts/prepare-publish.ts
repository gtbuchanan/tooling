import * as v from 'valibot';
import {
  ManifestSchema,
  RootManifestSchema,
  buildOutput,
  buildRepoFields,
} from './lib/manifest.ts';
import { join, relative } from 'node:path';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const JSON_INDENT = 2;

const NPMIGNORE = '*.tsbuildinfo\n';

const rootDir = join(import.meta.dirname, '..');
const packagesDir = join(rootDir, 'packages');

const rootRaw = readFileSync(join(rootDir, 'package.json'), 'utf-8');
const root = v.parse(RootManifestSchema, JSON.parse(rootRaw));

const preparePackage = (pkgDir: string): void => {
  const raw = readFileSync(join(pkgDir, 'package.json'), 'utf-8');
  const manifest = v.parse(ManifestSchema, JSON.parse(raw));
  const dir = manifest.publishConfig?.directory;
  if (manifest.private || dir === undefined) {
    return;
  }

  const target = join(pkgDir, dir);
  mkdirSync(target, { recursive: true });
  const json = JSON.stringify({
    ...buildOutput(manifest),
    ...buildRepoFields(root, relative(rootDir, pkgDir).replaceAll('\\', '/')),
  }, null, JSON_INDENT);
  writeFileSync(join(target, 'package.json'), `${json}\n`);
  writeFileSync(join(target, '.npmignore'), NPMIGNORE);
};

for (const name of readdirSync(packagesDir)) {
  preparePackage(join(packagesDir, name));
}

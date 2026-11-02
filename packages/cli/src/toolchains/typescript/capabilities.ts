import { type Dirent, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Capability } from '#src/core/capability.js';
import { typeCheckInclude } from '#src/core/layout.js';

/**
 * Uses TypeScript: depends on `@gtbuchanan/tsconfig`, or holds a
 * `tsconfig.json` of its own.
 */
export const typescript: Capability = {
  detect: ({ entries, manifest: { dependencies = {}, devDependencies = {} } }) =>
    Object.hasOwn(dependencies, '@gtbuchanan/tsconfig') ||
    Object.hasOwn(devDependencies, '@gtbuchanan/tsconfig') ||
    entries.includes('tsconfig.json'),
  name: 'typescript',
};

/**
 * Extensions tsc accepts as program inputs. Declaration files end in `.ts`
 * and so are covered — tsc counts them as inputs too.
 */
const typeScriptExtensions = ['.cts', '.mts', '.ts', '.tsx'];

const isTypeScriptFile = (name: string): boolean =>
  typeScriptExtensions.some(ext => name.endsWith(ext));

/*
 * A name is not a source: a *directory* called `types.ts` matches the
 * extension, and counting it would generate a task for a root with nothing
 * to check — the TS18003 failure this whole signal exists to prevent.
 * `isFile()` also excludes symlinks, which cannot pose as sources for the
 * same reason. The asymmetry is deliberate: missing a real source costs a
 * check that was never generated before, while inventing one breaks a build.
 */
const isTypeScriptSource = (entry: Dirent): boolean =>
  entry.isFile() && isTypeScriptFile(entry.name);

/**
 * Lists a directory's entries, or nothing when it cannot be read.
 */
const readEntries = (dir: string): readonly Dirent[] => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

/*
 * What tsc excludes when a config declares no `exclude` of its own, which
 * the generated type-check config does not. A file under one of these is not
 * an input, so finding one there must not make an otherwise-empty root look
 * checkable. The default also covers `outDir`, which needs no entry here:
 * it is conventionally `dist/`, and the walk only ever enters the directories
 * the type-check `include` names.
 */
const defaultExcludedDirectories = new Set([
  'bower_components', 'jspm_packages', 'node_modules',
]);

/*
 * Answers "any TypeScript under here?" by walking until the first hit.
 * `readdirSync`'s own `recursive` option would materialize every descendant
 * to answer a question the first match settles, and discovery runs this for
 * each package on every `gtb` invocation.
 */
const hasTypeScriptWithin = (dir: string): boolean =>
  readEntries(dir).some(entry => (entry.isDirectory()
    ? !defaultExcludedDirectories.has(entry.name) &&
    hasTypeScriptWithin(path.join(dir, entry.name))
    : isTypeScriptSource(entry)));

/*
 * Mirrors what the generated type-check config includes: root-level files
 * (`*`, `.*`) plus every named directory, which tsc walks recursively. The
 * glob entries cover the directory list's own siblings, so only the named
 * directories need the walk.
 */
const typeCheckDirectories = typeCheckInclude.filter(entry => !entry.includes('*'));

/**
 * Holds at least one TypeScript file the generated type-check config's
 * `include` would match. Distinct from {@link typescript}, which asks whether
 * the config exists: `gtb sync` writes a `tsconfig.json` at every workspace
 * root, so at a root the two answer different questions, and only this one
 * predicts whether `tsc` has anything to do. A config matching no files is an
 * error to tsc (TS18003), not a no-op.
 */
export const typescriptSources: Capability = {
  detect: ({ dir }) =>
    readEntries(dir).some(isTypeScriptSource) ||
    typeCheckDirectories.some(name => hasTypeScriptWithin(path.join(dir, name))),
  name: 'typescriptSources',
};

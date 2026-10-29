/*
 * The published output directory is shared: `compile:ts` emits the compiled
 * tree into it, `compile:skills` fills a subtree, and `pack:npm` writes the
 * docs and the stamped manifest. No task may treat it as its own, so the split
 * is declared once here and consumed by both places that depend on it — the
 * turbo `outputs` globs that decide which task caches which file, and the
 * clean `compile:ts` runs before emitting.
 */

/**
 * The `outDir` every published package compiles into, and the directory its
 * `publishConfig.directory` points npm at. A generated tsconfig.build.json
 * owns the value (see `buildOwned`) and `gtb verify` fails on drift, so the
 * convention — not a per-package lookup — is the source of truth.
 */
export const buildOutDir = 'dist/source';

/**
 * Entries `pack:npm` writes into {@link buildOutDir}.
 */
export const packNpmOutDirEntries = [
  '.npmignore', 'LICENSE', 'README.md', 'package.json',
] as const;

/**
 * Subdirectory of {@link buildOutDir} `compile:skills` writes. Named the same
 * as the authored source directory it mirrors.
 */
export const skillsOutDirEntry = 'skills';

/**
 * Prefixes a {@link buildOutDir} entry to form a turbo glob.
 */
export const outDirGlob = (entry: string): string => `${buildOutDir}/${entry}`;

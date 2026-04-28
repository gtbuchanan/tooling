/**
 * All script file extensions supported by the shared ESLint configuration.
 * Sorted alphabetically. Used to derive glob patterns for plugin configs.
 */
export const scriptFileExtensions = [
  'cjs', 'cts', 'js', 'jsx', 'mjs', 'mts', 'ts', 'tsx',
] as const;

/** Glob patterns matching all script files in any directory. */
export const scriptFiles: string[] = scriptFileExtensions.map(
  ext => `**/*.${ext}`,
);

/**
 * TypeScript-only file extensions. Used to scope rules that require
 * TypeScript syntax (e.g. `export type`, `: ReturnType`, `import type`).
 */
export const tsOnlyExtensions = ['cts', 'mts', 'ts', 'tsx'] as const;

/** Glob patterns matching only TypeScript files. */
export const tsOnlyFiles: string[] = tsOnlyExtensions.map(
  ext => `**/*.${ext}`,
);

/**
 * Markdown files excluded from structural lint. Changesets owns the
 * format of files in `.changeset/**` and validates them against its
 * own schema.
 */
export const markdownIgnores = [
  '.changeset/**',
] as const;

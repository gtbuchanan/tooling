/** Script file extensions for turbo input globs. Sorted alphabetically. */
const scriptExts = ['cjs', 'cts', 'js', 'jsx', 'mjs', 'mts', 'ts', 'tsx'] as const;

const isGlob = (pattern: string): boolean => /[*?\{]/v.test(pattern);

/**
 * Converts a tsconfig `include` entry to turbo input glob(s).
 * Directories become recursive (`src` → `src/**`).
 * Root-level globs (`*`, `.*`) expand to per-extension patterns
 * since turbo globs are extension-agnostic unlike tsconfig.
 */
export const toTurboGlobs = (include: string): readonly string[] => {
  if (include === '*') return scriptExts.map(ext => `*.${ext}`);
  if (include === '.*') return scriptExts.map(ext => `.*.${ext}`);
  if (isGlob(include)) return [include];
  return [`${include}/**`];
};

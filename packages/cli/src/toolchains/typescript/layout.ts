/**
 * Directories and file patterns included in tsconfig.json for type-checking.
 */
export const typeCheckInclude = ['bin', 'scripts', 'src', 'test', 'e2e', '*', '.*'] as const;

/**
 * Directories a published package compiles, which tsconfig.build.json's
 * `include` holds and `compile:ts` hashes. A constant rather than a read of
 * that file: `gtb sync` owns the key and `gtb verify` reports any other
 * value, so a gtb-built repository's file holds exactly this.
 */
export const buildInclude = ['bin', 'src'] as const;

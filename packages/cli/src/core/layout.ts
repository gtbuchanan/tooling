import path from 'node:path';
import { parseTsconfig } from 'get-tsconfig';
import * as v from 'valibot';
import { StringArray } from '#src/core/schemas.js';

/*
 * How a package is laid out. Discovery reads these to describe a package, and
 * the generators and toolchains read them to act on it, so they sit below all
 * of them.
 */

/**
 * Directories and file patterns included in tsconfig.json for type-checking.
 */
export const typeCheckInclude = ['bin', 'scripts', 'src', 'test', 'e2e', '*', '.*'] as const;

/**
 * Directories included in tsconfig.build.json for compilation.
 */
export const buildInclude = ['bin', 'src'] as const;

/**
 * Resolves the effective `include` globs from a package's tsconfig.build.json,
 * following `extends` — including node_modules package specifiers and their
 * `exports` maps — via {@link parseTsconfig}, which mirrors tsc's resolution
 * without depending on the `typescript` package. The globs feed turbo's
 * `compile:ts` cache inputs, so patterns (e.g. `*.proto.ts`) are preserved
 * verbatim rather than expanded to matched files; an `include` inherited from
 * an extended config is rebased to that config's location, matching tsc. Falls
 * back to {@link buildInclude} when the file is missing, unparsable, or its
 * `extends` chain cannot be resolved.
 */
export const resolveBuildIncludes = (dir: string): readonly string[] => {
  try {
    const { include } = parseTsconfig(path.join(dir, 'tsconfig.build.json'));
    const result = v.safeParse(StringArray, include);
    return result.success ? result.output : buildInclude;
  } catch {
    return buildInclude;
  }
};

/**
 * Prefix marking author-owned codegen scripts (`generate:prisma`). Unlike
 * every task name, these have no CLI handler — gtb only discovers them and
 * wires them into the `generate` aggregate.
 */
export const generateTaskPrefix = 'generate:';

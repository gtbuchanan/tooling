import path from 'node:path';
import { parseTsconfig } from 'get-tsconfig';
import * as v from 'valibot';
import type { PackageCapabilities } from './discovery.ts';
import { readJsonFile } from './file-writer.ts';
import { StringArray, UnknownRecord } from './schemas.ts';

/** Directories and file patterns included in tsconfig.json for type-checking. */
export const typeCheckInclude = ['bin', 'scripts', 'src', 'test', 'e2e', '*', '.*'] as const;

/** Directories included in tsconfig.build.json for compilation. */
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

/** Shape of a generated tsconfig file. */
export interface GeneratedTsconfig {
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly extends: string;
  readonly include?: readonly string[];
}

/**
 * Merges user compilerOptions with generated ones.
 * Generated keys take precedence; user-added keys are preserved.
 */
const mergeCompilerOptions = (
  existing: Record<string, unknown> | undefined,
  generated: Record<string, unknown>,
): Record<string, unknown> =>
  ({ ...existing, ...generated });

const TsconfigSchema = v.object({
  compilerOptions: v.optional(UnknownRecord),
});

/**
 * Reads compilerOptions from an existing tsconfig file.
 * Returns undefined if the file doesn't exist or can't be parsed.
 */
export const readUserCompilerOptions = (
  path: string,
): Record<string, unknown> | undefined => {
  try {
    const result = v.safeParse(TsconfigSchema, readJsonFile(path));
    return result.success ? result.output.compilerOptions : undefined;
  } catch {
    return undefined;
  }
};

/** CompilerOptions owned by the type-check generator. */
export const typeCheckOwned: Readonly<Record<string, unknown>> = {
  noEmit: true,
};

/** CompilerOptions owned by the per-package build generator. */
export const buildOwned: Readonly<Record<string, unknown>> = {
  outDir: 'dist/source',
  rootDir: '.',
};

/** CompilerOptions owned by the root build base generator. */
export const rootBuildOwned: Readonly<Record<string, unknown>> = {
  declaration: true,
  sourceMap: true,
};

/** Generates a type-check tsconfig.json. */
const generateTypeCheckConfig = (
  extendsPath: string,
  userCompilerOptions?: Record<string, unknown>,
): GeneratedTsconfig => ({
  compilerOptions: mergeCompilerOptions(userCompilerOptions, typeCheckOwned),
  extends: extendsPath,
  include: [...typeCheckInclude],
});

/** Generates a build tsconfig.build.json. */
const generateBuildConfig = (
  extendsPath: string,
  userCompilerOptions?: Record<string, unknown>,
): GeneratedTsconfig => ({
  compilerOptions: mergeCompilerOptions(userCompilerOptions, buildOwned),
  extends: extendsPath,
  include: [...buildInclude],
});

/** Generates the root tsconfig.build.json (shared base, no include). */
const generateRootBuildConfig = (
  extendsPath: string,
  userCompilerOptions?: Record<string, unknown>,
): GeneratedTsconfig => ({
  compilerOptions: mergeCompilerOptions(userCompilerOptions, rootBuildOwned),
  extends: extendsPath,
});

/** Descriptor for a single tsconfig file to generate/validate. */
export interface TsconfigDescriptor {
  /** Generate the expected tsconfig content. */
  readonly generate: (userOpts?: Record<string, unknown>) => GeneratedTsconfig;
  /** CompilerOptions keys owned by the generator (for drift validation). */
  readonly ownedKeys: Readonly<Record<string, unknown>>;
  /** Absolute path to the tsconfig file. */
  readonly path: string;
}

/**
 * Builds the list of tsconfig descriptors for the entire workspace.
 * Both `sync` (write) and `verify` (validate) consume this plan.
 */
export const planTsconfigs = (
  rootDir: string,
  packages: readonly PackageCapabilities[],
): readonly TsconfigDescriptor[] => {
  const descriptors: TsconfigDescriptor[] = [
    {
      generate: opts => generateTypeCheckConfig('./tsconfig.base.json', opts),
      ownedKeys: typeCheckOwned,
      path: path.join(rootDir, 'tsconfig.json'),
    },
    {
      generate: opts => generateRootBuildConfig('./tsconfig.base.json', opts),
      ownedKeys: rootBuildOwned,
      path: path.join(rootDir, 'tsconfig.build.json'),
    },
  ];

  for (const pkg of packages) {
    if (!pkg.hasTypeScript) {
      continue;
    }

    descriptors.push({
      generate: opts => generateTypeCheckConfig('../../tsconfig.base.json', opts),
      ownedKeys: typeCheckOwned,
      path: path.join(pkg.dir, 'tsconfig.json'),
    });

    if (pkg.isPublished) {
      descriptors.push({
        generate: opts => generateBuildConfig('../../tsconfig.build.json', opts),
        ownedKeys: buildOwned,
        path: path.join(pkg.dir, 'tsconfig.build.json'),
      });
    }
  }

  return descriptors;
};

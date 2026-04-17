import path from 'node:path';
import ts from 'typescript';
import * as v from 'valibot';
import type { PackageCapabilities } from './discovery.ts';
import { readJsonFile } from './file-writer.ts';

/** Directories included in tsconfig.json for type-checking. */
const typeCheckInclude = ['bin', 'scripts', 'src', 'test', 'e2e', '*.config.*'] as const;

/** Directories included in tsconfig.build.json for compilation. */
export const buildInclude = ['bin', 'src'] as const;

const ReadConfigSchema = v.object({
  config: v.unknown(),
  error: v.optional(v.unknown()),
});

const ResolvedConfigSchema = v.object({
  include: v.optional(v.array(v.string())),
});

const readFile = (path: string): string | undefined => ts.sys.readFile(path);

/** Stub host that skips directory scanning — we only need the resolved config. */
const parseHost: ts.ParseConfigHost = {
  fileExists: path => ts.sys.fileExists(path),
  readDirectory: () => [],
  readFile,
  useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
};

/**
 * Resolves the effective `include` from a tsconfig.build.json using the
 * TypeScript API. Lets `parseJsonConfigFileContent` handle extends
 * resolution. Falls back to {@link buildInclude} if resolution fails.
 */
export const resolveBuildIncludes = (dir: string): readonly string[] => {
  const configPath = path.join(dir, 'tsconfig.build.json');
  const raw = v.safeParse(ReadConfigSchema, ts.readConfigFile(configPath, readFile));
  if (!raw.success || raw.output.error !== undefined) {
    return buildInclude;
  }

  const parsed = ts.parseJsonConfigFileContent(
    raw.output.config, parseHost, dir, undefined, configPath,
  );
  const result = v.safeParse(ResolvedConfigSchema, parsed.raw);

  return result.success ? result.output.include ?? buildInclude : buildInclude;
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
  compilerOptions: v.optional(v.record(v.string(), v.unknown())),
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
 * Both turbo:init (write) and turbo:check (validate) consume this plan.
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

import * as v from 'valibot';

/** Valibot schema for the `publishConfig` field of package.json. */
export const PublishConfigSchema = v.object({
  bin: v.optional(v.record(v.string(), v.string())),
  cpu: v.optional(v.array(v.string())),
  directory: v.optional(v.string()),
  exports: v.optional(v.record(v.string(), v.string())),
  imports: v.optional(v.record(v.string(), v.string())),
  libc: v.optional(v.array(v.string())),
  linkDirectory: v.optional(v.boolean()),
  os: v.optional(v.array(v.string())),
  scripts: v.optional(v.record(v.string(), v.string())),
});

/** Valibot schema for the `repository` field of package.json. */
export const RepositorySchema = v.object({
  directory: v.optional(v.string()),
  type: v.string(),
  url: v.string(),
});

/** Valibot schema for root package.json fields copied to published packages. */
export const RootManifestSchema = v.object({
  bugs: v.optional(v.string()),
  homepage: v.optional(v.string()),
  repository: v.optional(RepositorySchema),
});

/** Inferred type from {@link RootManifestSchema}. */
export type RootManifest = v.InferOutput<typeof RootManifestSchema>;

/** Valibot schema for per-package package.json. Uses `looseObject` to preserve extra fields. */
export const ManifestSchema = v.looseObject({
  dependencies: v.optional(v.record(v.string(), v.string())),
  devDependencies: v.optional(v.record(v.string(), v.string())),
  private: v.optional(v.boolean()),
  publishConfig: v.optional(PublishConfigSchema),
  scripts: v.optional(v.record(v.string(), v.string())),
});

/** Inferred type from {@link ManifestSchema}. */
export type Manifest = v.InferOutput<typeof ManifestSchema>;

/**
 * Copies `bugs`, `homepage`, and `repository` from the root manifest,
 * scoping `homepage` and `repository.directory` to the given path.
 */
export const buildRepoFields = (
  root: RootManifest,
  directory: string,
): Pick<Partial<RootManifest>, 'bugs' | 'homepage' | 'repository'> => ({
  ...(root.bugs && { bugs: root.bugs }),
  ...(root.homepage && {
    homepage: `${root.homepage}/tree/main/${directory}`,
  }),
  ...(root.repository && {
    repository: { ...root.repository, directory },
  }),
});

/**
 * `publishConfig` fields hoisted to top-level on packed manifests.
 *
 * - `imports`: pnpm doesn't natively promote `publishConfig.imports`.
 *   `rewriteRelativeImportExtensions` only rewrites relative imports,
 *   not subpath imports (`#src/*`). Dev uses .ts extensions via the
 *   source imports map; published packages need a separate map (e.g.
 *   `"#src/*.ts": "./*.js"`).
 * - `os`/`cpu`/`libc`: top-level platform fields trip pnpm's
 *   "Unsupported platform" warning during workspace scans. Keeping
 *   them under `publishConfig` quiets dev; promoting at publish keeps
 *   the platform filter for consumers.
 */
const promotableFields = [
  'bin',
  'cpu',
  'exports',
  'imports',
  'libc',
  'os',
  'scripts',
] as const;

const promoteFromPublishConfig = (
  publishConfig: Manifest['publishConfig'],
): Partial<Manifest> =>
  publishConfig === undefined
    ? {}
    : promotableFields.reduce<Partial<Manifest>>((acc, field) => {
        const value = publishConfig[field];
        return value === undefined ? acc : { ...acc, [field]: value };
      }, {});

/**
 * Strips `devDependencies` and `scripts`, then promotes the
 * {@link promotableFields} from `publishConfig` to top-level
 * for publishing.
 */
export const buildOutput = (manifest: Manifest): Manifest => {
  const {
    devDependencies: _dev,
    publishConfig,
    scripts: _scripts,
    ...rest
  } = manifest;

  return { ...rest, ...promoteFromPublishConfig(publishConfig) };
};

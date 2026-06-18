import * as v from 'valibot';
import { StringArray, StringRecord } from './schemas.ts';

/** Valibot schema for the `publishConfig` field of package.json. */
export const PublishConfigSchema = v.object({
  bin: v.optional(StringRecord),
  cpu: v.optional(StringArray),
  directory: v.optional(v.string()),
  exports: v.optional(StringRecord),
  imports: v.optional(StringRecord),
  libc: v.optional(StringArray),
  linkDirectory: v.optional(v.boolean()),
  os: v.optional(StringArray),
  scripts: v.optional(StringRecord),
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
  license: v.optional(v.string()),
  repository: v.optional(RepositorySchema),
});

/** Inferred type from {@link RootManifestSchema}. */
export type RootManifest = v.InferOutput<typeof RootManifestSchema>;

/** Valibot schema for per-package package.json. Uses `looseObject` to preserve extra fields. */
export const ManifestSchema = v.looseObject({
  dependencies: v.optional(StringRecord),
  devDependencies: v.optional(StringRecord),
  license: v.optional(v.string()),
  name: v.optional(v.string()),
  private: v.optional(v.boolean()),
  publishConfig: v.optional(PublishConfigSchema),
  scripts: v.optional(StringRecord),
  version: v.optional(v.string()),
});

/** Inferred type from {@link ManifestSchema}. */
export type Manifest = v.InferOutput<typeof ManifestSchema>;

/**
 * Copies `bugs`, `homepage`, and `repository` from the root manifest,
 * scoping `homepage` and `repository.directory` to the given path. These
 * are repo coordinates and intentionally override any package-level value.
 * `license` is handled separately ({@link resolveLicense}) because a
 * package's own declaration takes precedence over the root default.
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
 * Resolves the published `license`, preferring a package's own declaration
 * over the workspace-root default. Returns `undefined` when neither sets one.
 */
export const resolveLicense = (
  manifest: Manifest,
  root: RootManifest,
): string | undefined => manifest.license ?? root.license;

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

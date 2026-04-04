import * as v from 'valibot';

/** Valibot schema for the `publishConfig` field of package.json. */
export const PublishConfigSchema = v.object({
  directory: v.optional(v.string()),
  exports: v.optional(v.record(v.string(), v.string())),
  linkDirectory: v.optional(v.boolean()),
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
) => ({
  ...(root.bugs && { bugs: root.bugs }),
  ...(root.homepage && {
    homepage: `${root.homepage}/tree/main/${directory}`,
  }),
  ...(root.repository && {
    repository: { ...root.repository, directory },
  }),
});

/**
 * Strips `devDependencies` and `scripts`, then promotes `publishConfig.exports`
 * and `publishConfig.scripts` to top-level fields for publishing.
 */
export const buildOutput = (manifest: Manifest): Manifest => {
  const {
    devDependencies: _dev,
    publishConfig,
    scripts: _scripts,
    ...rest
  } = manifest;

  return {
    ...rest,
    ...(publishConfig?.exports && {
      exports: publishConfig.exports,
    }),
    ...(publishConfig?.scripts && {
      scripts: publishConfig.scripts,
    }),
  };
};

import * as v from 'valibot';

export const PublishConfigSchema = v.object({
  directory: v.optional(v.string()),
  exports: v.optional(v.record(v.string(), v.string())),
  linkDirectory: v.optional(v.boolean()),
  scripts: v.optional(v.record(v.string(), v.string())),
});

export const RepositorySchema = v.object({
  directory: v.optional(v.string()),
  type: v.string(),
  url: v.string(),
});

export const RootManifestSchema = v.object({
  bugs: v.optional(v.string()),
  homepage: v.optional(v.string()),
  repository: v.optional(RepositorySchema),
});

export type RootManifest = v.InferOutput<typeof RootManifestSchema>;

export const ManifestSchema = v.looseObject({
  devDependencies: v.optional(v.record(v.string(), v.string())),
  private: v.optional(v.boolean()),
  publishConfig: v.optional(PublishConfigSchema),
  scripts: v.optional(v.record(v.string(), v.string())),
});

export type Manifest = v.InferOutput<typeof ManifestSchema>;

export const buildRepoFields = (
  root: RootManifest,
  directory: string,
) => ({
  ...(root.bugs !== undefined && { bugs: root.bugs }),
  ...(root.homepage !== undefined && {
    homepage: `${root.homepage}/tree/main/${directory}`,
  }),
  ...(root.repository !== undefined && {
    repository: { ...root.repository, directory },
  }),
});

export const buildOutput = (manifest: Manifest): Manifest => {
  const {
    devDependencies: _dev,
    publishConfig,
    scripts: _scripts,
    ...rest
  } = manifest;

  return {
    ...rest,
    ...(publishConfig?.exports !== undefined && {
      exports: publishConfig.exports,
    }),
    ...(publishConfig?.scripts !== undefined && {
      scripts: publishConfig.scripts,
    }),
  };
};

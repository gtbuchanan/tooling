import {
  type InferOutput,
  boolean,
  looseObject,
  object,
  optional,
  record,
  string,
} from 'valibot';

export const PublishConfigSchema = object({
  directory: optional(string()),
  exports: optional(record(string(), string())),
  linkDirectory: optional(boolean()),
  scripts: optional(record(string(), string())),
});

export const ManifestSchema = looseObject({
  devDependencies: optional(record(string(), string())),
  private: optional(boolean()),
  publishConfig: optional(PublishConfigSchema),
  scripts: optional(record(string(), string())),
});

export type Manifest = InferOutput<typeof ManifestSchema>;

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

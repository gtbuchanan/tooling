import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { buildOutput, buildRepoFields } from '#src/lib/manifest.js';

describe.concurrent(buildOutput, () => {
  it('strips devDependencies and scripts', ({ expect }) => {
    const name = build.scopedPackageName();
    const result = buildOutput({
      devDependencies: build.dependencyMap(),
      name,
      scripts: build.scriptMap(),
    });

    expect(result).not.toHaveProperty('devDependencies');
    expect(result).not.toHaveProperty('scripts');
    expect(result).toHaveProperty('name', name);
  });

  it('remaps publishConfig.exports to top-level exports', ({ expect }) => {
    const publishedExports = build.exportsMap();
    const result = buildOutput({
      exports: build.exportsMap(),
      publishConfig: { exports: publishedExports },
    });

    expect(result['exports']).toStrictEqual(publishedExports);
  });

  it('remaps publishConfig.scripts to top-level scripts', ({ expect }) => {
    const publishedScripts = build.scriptMap();
    const result = buildOutput({
      publishConfig: { scripts: publishedScripts },
      scripts: build.scriptMap(),
    });

    expect(result.scripts).toStrictEqual(publishedScripts);
  });

  it('remaps publishConfig.bin to top-level bin', ({ expect }) => {
    const publishedBin = build.binMap();
    const result = buildOutput({
      publishConfig: { bin: publishedBin },
    });

    expect(result['bin']).toStrictEqual(publishedBin);
  });

  it('remaps publishConfig.imports to top-level imports', ({ expect }) => {
    const publishedImports = build.importsMap();
    const result = buildOutput({
      imports: build.importsMap(),
      publishConfig: { imports: publishedImports },
    });

    expect(result['imports']).toStrictEqual(publishedImports);
  });

  it('remaps publishConfig.os to top-level os', ({ expect }) => {
    const os = build.platformList();
    const result = buildOutput({
      publishConfig: { os },
    });

    expect(result['os']).toStrictEqual(os);
  });

  it('remaps publishConfig.cpu to top-level cpu', ({ expect }) => {
    const cpu = build.platformList();
    const result = buildOutput({
      publishConfig: { cpu },
    });

    expect(result['cpu']).toStrictEqual(cpu);
  });

  it('remaps publishConfig.libc to top-level libc', ({ expect }) => {
    const libc = build.platformList();
    const result = buildOutput({
      publishConfig: { libc },
    });

    expect(result['libc']).toStrictEqual(libc);
  });

  it('strips publishConfig from output', ({ expect }) => {
    const result = buildOutput({
      publishConfig: {
        directory: build.publishDirectory(),
        exports: build.exportsMap(),
      },
    });

    expect(result).not.toHaveProperty('publishConfig');
  });

  it('preserves other fields via looseObject passthrough', ({ expect }) => {
    const dependencies = build.dependencyMap();
    const name = build.scopedPackageName();
    const version = build.semverVersion();
    const result = buildOutput({ dependencies, name, version });

    expect(result).toHaveProperty('dependencies', dependencies);
    expect(result).toHaveProperty('name', name);
    expect(result).toHaveProperty('version', version);
  });
});

describe.concurrent(buildRepoFields, () => {
  it('builds all fields from root manifest', ({ expect }) => {
    const bugs = build.gitHubIssuesUrl();
    const homepage = build.gitHubRepoUrl();
    const repository = { type: 'git', url: build.gitHubGitUrl() };
    const directory = build.packageDirectory();

    const result = buildRepoFields({ bugs, homepage, repository }, directory);

    expect(result).toStrictEqual({
      bugs,
      homepage: `${homepage}/tree/main/${directory}`,
      repository: { ...repository, directory },
    });
  });

  it('returns empty object when root has no fields', ({ expect }) => {
    expect(buildRepoFields({}, build.packageDirectory())).toStrictEqual({});
  });

  it('includes only fields present in root', ({ expect }) => {
    const homepage = build.gitHubRepoUrl();
    const directory = build.packageDirectory();

    const result = buildRepoFields({ homepage }, directory);

    expect(result).toStrictEqual({
      homepage: `${homepage}/tree/main/${directory}`,
    });
  });
});

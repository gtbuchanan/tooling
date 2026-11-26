import { describe, it } from 'vitest';
import { generatePackageScripts, generateTurboJson } from '#src/codegen/turbo-config.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { tsdownConfig } from '#src/toolchains/tsdown/capabilities.js';
import { makeDiscovery, makePackage } from '#test/helpers.js';

const bundled = () => makePackage({ capabilities: new Set([published, tsdownConfig]) });

describe.concurrent('compile:tsdown scripts', () => {
  it('generates compile:tsdown for a published package configuring tsdown', ({ expect }) => {
    const result = generatePackageScripts(bundled(), { kind: 'path' });

    expect(result).toHaveProperty('compile:tsdown', 'gtb task compile:tsdown');
  });

  /*
  Both compiling would each clear the output directory the other writes.
  */
  it('drops compile:ts where compile:tsdown applies', ({ expect }) => {
    const result = generatePackageScripts(bundled(), { kind: 'path' });

    expect(result).not.toHaveProperty('compile:ts');
  });

  it('keeps compile:ts for a published package without a tsdown config', ({ expect }) => {
    const pkg = makePackage({ capabilities: new Set([published]) });

    const result = generatePackageScripts(pkg, { kind: 'path' });

    expect(result).toHaveProperty('compile:ts', 'gtb task compile:ts');
  });

  /*
  Nothing packs an unpublished package, so a bundle of it would go unused.
  */
  it('generates no compile:tsdown for an unpublished package', ({ expect }) => {
    const pkg = makePackage({ capabilities: new Set([tsdownConfig]) });

    const result = generatePackageScripts(pkg, { kind: 'path' });

    expect(result).not.toHaveProperty('compile:tsdown');
  });
});

describe.concurrent('compile:tsdown task', () => {
  it('hashes the tsdown config with the build sources', ({ expect }) => {
    const result = generateTurboJson(makeDiscovery([bundled()]));

    expect(result.tasks['compile:tsdown']?.inputs).toStrictEqual(expect.arrayContaining([
      'src/**',
      'tsconfig.build.json',
      'tsdown.config.*',
    ]));
  });

  it('is a member of the compile aggregate', ({ expect }) => {
    const result = generateTurboJson(makeDiscovery([bundled()]));

    expect(result.tasks['compile']?.dependsOn).toContain('compile:tsdown');
  });

  /*
   * A dependency compiled by tsdown declares no compile:ts, so naming that
   * leaf would order nothing against it.
   */
  it('waits on whatever compiles its dependencies', ({ expect }) => {
    const result = generateTurboJson(makeDiscovery([bundled()]));

    expect(result.tasks['compile:tsdown']?.dependsOn).toContain('^compile');
  });

  it('makes compile:ts wait on whatever compiles its dependencies', ({ expect }) => {
    const pkg = makePackage({ capabilities: new Set([published]) });

    const result = generateTurboJson(makeDiscovery([pkg, bundled()]));

    expect(result.tasks['compile:ts']?.dependsOn).toContain('^compile');
  });
});

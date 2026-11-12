import { describe, it } from 'vitest';
import {
  generatePackageScripts, generateRequiredRootScripts, generateTurboJson,
} from '#src/codegen/turbo-config.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { typescript, typescriptSources } from '#src/toolchains/typescript/capabilities.js';
import { makeDiscovery, makePackage, monorepoOf } from '#test/helpers.js';

const monorepoWithRootTypeScript = (): ReturnType<typeof makeDiscovery> =>
  makeDiscovery(
    [makePackage({ capabilities: new Set([typescript]) }), makePackage()],
    { capabilities: new Set([typescript, typescriptSources]) },
  );

describe.concurrent('generateTurboJson — root typecheck', () => {
  it('emits //#typecheck:ts when the monorepo root has TypeScript sources', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootTypeScript());

    expect(result.tasks).toHaveProperty('//#typecheck:ts');
  });

  it('omits //#typecheck:ts in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([typescript, typescriptSources]) })],
      { capabilities: new Set([typescript, typescriptSources]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('//#typecheck:ts');
    expect(result.tasks).toHaveProperty('typecheck:ts');
  });

  /*
   * `gtb sync` writes a root tsconfig.json unconditionally, so `typescript`
   * holds at every synced root. Gating on it would emit the task for a root
   * with nothing to check, where tsc fails outright (TS18003).
   */
  it('omits //#typecheck:ts when the root tsconfig has no sources', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([typescript]) }), makePackage()],
      { capabilities: new Set([typescript]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('//#typecheck:ts');
  });

  it('//#typecheck:ts keys on the root type-check inputs', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootTypeScript());
    const inputs = result.tasks['//#typecheck:ts']?.inputs ?? [];

    expect(inputs).toContain('tsconfig.base.json');
    expect(inputs).toContain('tsconfig.json');
    expect(inputs).toContain('*.ts');
    expect(inputs).toContain('src/**');
  });

  it('//#typecheck:ts emits nothing, mirroring the package task', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootTypeScript());

    expect(result.tasks['//#typecheck:ts']?.outputs).toStrictEqual([]);
  });

  it('typecheck aggregate depends on //#typecheck:ts', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootTypeScript());

    expect(result.tasks['typecheck']?.dependsOn).toContain('//#typecheck:ts');
  });

  /*
   * The root can carry TypeScript when no package does — a workspace of
   * plain-JS packages whose root still holds `eslint.config.ts`.
   */
  it('emits the typecheck aggregate for a root-only TypeScript workspace', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage(), makePackage()],
      { capabilities: new Set([typescript, typescriptSources]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['typecheck']?.dependsOn).toStrictEqual(['//#typecheck:ts']);
    expect(result.tasks).not.toHaveProperty('typecheck:ts');
  });
});

describe.concurrent(generateTurboJson, () => {
  it('typecheck:ts depends on generate when generate exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([typescript]), generateScripts: ['generate:test'] }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['typecheck:ts']?.dependsOn).toContain('generate');
  });

  it('typecheck:ts has no generate dep without generate scripts', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([typescript]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['typecheck:ts']?.dependsOn ?? []).not.toContain('generate');
  });

  it('compile:ts depends on generate when generate exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([published]), generateScripts: ['generate:test'] }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['compile:ts']?.dependsOn).toContain('generate');
  });

  it('includes typecheck:ts when any package has TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([typescript]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('typecheck:ts');
  });

  it('typecheck:ts inputs include root-level script files', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([typescript]) }),
    ]);

    const result = generateTurboJson(discovery);
    const inputs = result.tasks['typecheck:ts']?.inputs ?? [];

    expect(inputs).toStrictEqual(expect.arrayContaining([
      '*.ts', '*.mjs', '.*.ts', '.*.mjs',
    ]));
  });

  it('excludes typecheck:ts when no package has TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([makePackage()]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('typecheck:ts');
  });

  it('includes compile:ts when any package is published', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([published]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('compile:ts');
  });

  it('compile:ts inputs are the compiled directories and the build config', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([published]) })]);

    const result = generateTurboJson(discovery);
    const inputs = result.tasks['compile:ts']?.inputs ?? [];

    expect(inputs).toStrictEqual(expect.arrayContaining([
      'bin/**', 'src/**', 'tsconfig.build.json',
    ]));
    expect(inputs).not.toContain('tsconfig.json');
    expect(inputs).not.toContain('scripts/**');
  });

  it('//#typecheck:ts depends on the root\'s workspace dependencies', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([typescript]) }), makePackage()],
      { capabilities: new Set([typescript, typescriptSources]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['//#typecheck:ts']?.dependsOn).toStrictEqual(['^transit']);
  });

  it('typecheck:ts depends on transit so dependency sources reach its hash', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([typescript]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['typecheck:ts']?.dependsOn).toContain('transit');
  });
});

describe.concurrent(generatePackageScripts, () => {
  it('generates typecheck:ts for TypeScript packages', ({ expect }) => {
    const caps = makePackage({ capabilities: new Set([typescript]) });

    const result = generatePackageScripts(caps, { kind: 'path' });

    expect(result).toHaveProperty('typecheck:ts', 'gtb task typecheck:ts');
  });

  it('generates compile:ts for published packages', ({ expect }) => {
    const caps = makePackage({ capabilities: new Set([published]) });

    const result = generatePackageScripts(caps, { kind: 'path' });

    expect(result).toHaveProperty('compile:ts', 'gtb task compile:ts');
  });
});

describe.concurrent(generateRequiredRootScripts, () => {
  it('adds root typecheck:ts when the monorepo root has TypeScript sources', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf(), {
      capabilities: new Set([typescript, typescriptSources]),
    });

    const result = generateRequiredRootScripts(discovery);

    expect(result).toHaveProperty('typecheck:ts', 'gtb task typecheck:ts');
  });

  it('omits root typecheck:ts when the root tsconfig has no sources', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({ capabilities: new Set([typescript]) }), {
      capabilities: new Set([typescript]),
    });

    const result = generateRequiredRootScripts(discovery);

    expect(result).not.toHaveProperty('typecheck:ts');
  });
});

import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

describe.concurrent(generateTurboJson, () => {
  it('includes generate aggregate when any package has generate scripts', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        generateScripts: ['generate:prisma'],
      }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['generate']?.dependsOn).toStrictEqual(['generate:prisma']);
  });

  it('deduplicates generate scripts across packages', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        generateScripts: ['generate:prisma'],
      }),
      makeCapabilities({
        generateScripts: ['generate:paraglide', 'generate:prisma'],
      }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['generate']?.dependsOn).toStrictEqual([
      'generate:paraglide',
      'generate:prisma',
    ]);
  });

  it('omits generate aggregate when no packages have generate scripts', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('generate');
  });

  it('typecheck:ts depends on generate when generate exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ generateScripts: ['generate:test'], hasTypeScript: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['typecheck:ts']?.dependsOn).toContain('generate');
  });

  it('typecheck:ts has no generate dep without generate scripts', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTypeScript: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['typecheck:ts']?.dependsOn ?? []).not.toContain('generate');
  });

  it('compile:ts depends on generate when generate exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ generateScripts: ['generate:test'], isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['compile:ts']?.dependsOn).toContain('generate');
  });

  it('lint:eslint depends on generate when generate exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ generateScripts: ['generate:test'], hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint:eslint']?.dependsOn).toContain('generate');
  });

  it('includes typecheck:ts when any package has TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTypeScript: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('typecheck:ts');
  });

  it('excludes typecheck:ts when no package has TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('typecheck:ts');
  });

  it('includes compile:ts when any package is published', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('compile:ts');
  });

  it('includes lint:eslint when any package has ESLint', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('lint:eslint');
  });

  it('lint:eslint includes root config in inputs', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);
    const task = result.tasks['lint:eslint'];

    expect(task?.inputs).toContain('$TURBO_ROOT$/eslint.config.*');
  });

  it('lint:eslint includes eslint cache in outputs', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);
    const task = result.tasks['lint:eslint'];

    expect(task?.outputs).toContain('dist/.eslintcache');
  });

  it('includes test:vitest:fast when any package has Vitest + test/', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTest: true, hasVitest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('test:vitest:fast');
  });

  it('excludes test:vitest:fast when Vitest exists but no test/', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasVitest: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('test:vitest:fast');
  });

  it('includes test:vitest:e2e when root has e2e config', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities()],
      { hasVitestE2e: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('test:vitest:e2e');
  });

  it('includes pack:npm when any package is published', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('pack:npm');
    expect(result.tasks).toHaveProperty('pack');
  });

  it('prunes typecheck:ts from lint dependsOn when no TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);
    const lintEslint = result.tasks['lint:eslint'];

    expect(lintEslint?.dependsOn).not.toContain('typecheck:ts');
  });

  it('includes typecheck:ts in lint dependsOn when TypeScript exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true, hasTypeScript: true }),
    ]);

    const result = generateTurboJson(discovery);
    const lintEslint = result.tasks['lint:eslint'];

    expect(lintEslint?.dependsOn).toContain('typecheck:ts');
  });

  it('generates check aggregate with discovered leaf tasks', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasTest: true,
        hasTypeScript: true,
        hasVitest: true,
      }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['check']?.dependsOn).toContain('lint');
    expect(result.tasks['check']?.dependsOn).toContain('test:vitest:fast');
  });

  it('generates lint aggregate from discovered linters', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasEslint: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint']?.dependsOn).toContain('lint:eslint');
  });

  it('omits lint aggregate when no linters', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasTypeScript: true })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('lint');
  });

  it('generates build:ci with compile + check + pack', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasTest: true,
        hasTypeScript: true,
        hasVitest: true,
        isPublished: true,
      }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['build:ci']?.dependsOn).toContain('check');
    expect(result.tasks['build:ci']?.dependsOn).toContain('compile');
    expect(result.tasks['build:ci']?.dependsOn).toContain('pack');
  });

  it('has $schema field', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasTypeScript: true })]);

    const result = generateTurboJson(discovery);

    expect(result.$schema).toBe('https://turbo.build/schema.json');
  });

  it('compile:ts inputs derive from resolved buildIncludes', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        buildIncludes: ['bin', 'src', 'generated', '*.proto.ts'],
        isPublished: true,
      }),
    ]);

    const result = generateTurboJson(discovery);
    const inputs = result.tasks['compile:ts']?.inputs ?? [];

    expect(inputs).toStrictEqual(expect.arrayContaining([
      'bin/**', 'src/**', 'generated/**', '*.proto.ts', 'tsconfig.build.json',
    ]));
    expect(inputs).not.toContain('tsconfig.json');
    expect(inputs).not.toContain('scripts/**');
  });

  it('test:vitest:fast inputs use explicit vitest config filename', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTest: true, hasVitest: true }),
    ]);

    const result = generateTurboJson(discovery);
    const inputs = result.tasks['test:vitest:fast']?.inputs ?? [];

    expect(inputs).toContain('vitest.config.ts');
    expect(inputs).not.toContain('vitest.config.*');
  });

  it('test:vitest:slow inputs use explicit vitest config filename', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasTest: true, hasVitest: true }),
    ]);

    const result = generateTurboJson(discovery);
    const inputs = result.tasks['test:vitest:slow']?.inputs ?? [];

    expect(inputs).toContain('vitest.config.ts');
    expect(inputs).not.toContain('vitest.config.*');
  });
});

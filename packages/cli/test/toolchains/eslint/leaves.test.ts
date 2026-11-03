import { describe, it } from 'vitest';
import {
  generatePackageScripts, generateRequiredRootScripts, generateRootScripts, generateTurboJson,
} from '#src/codegen/turbo-config.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';
import { typescript } from '#src/toolchains/typescript/capabilities.js';
import { makeDiscovery, makePackage } from '#test/helpers.js';

const monorepoWithRootEslint = (): ReturnType<typeof makeDiscovery> =>
  makeDiscovery(
    [
      makePackage({ capabilities: new Set([eslint]) }),
      makePackage({ capabilities: new Set([eslint]) }),
    ],
    { capabilities: new Set([eslint]) },
  );

describe.concurrent('generateTurboJson — root lint', () => {
  it('emits //#lint:eslint when monorepo root has ESLint', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootEslint());

    expect(result.tasks).toHaveProperty('//#lint:eslint');
  });

  it('omits //#lint:eslint in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([eslint]) })],
      { capabilities: new Set([eslint]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('//#lint:eslint');
  });

  it('omits //#lint:eslint when monorepo root has no ESLint', ({ expect }) => {
    const discovery = makeDiscovery(
      [
        makePackage({ capabilities: new Set([eslint]) }),
        makePackage({ capabilities: new Set([eslint]) }),
      ],
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('//#lint:eslint');
  });

  it('//#lint:eslint subtracts package globs from defaults', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootEslint());
    const inputs = result.tasks['//#lint:eslint']?.inputs ?? [];

    expect(inputs).toContain('$TURBO_DEFAULT$');
    expect(inputs).toContain('!packages/*/**');
  });

  it('lint aggregate depends on //#lint:eslint when root has ESLint', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootEslint());

    expect(result.tasks['lint']?.dependsOn).toContain('//#lint:eslint');
  });

  it('checks //#lint:eslint when only the monorepo root has ESLint', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage(), makePackage()],
      { capabilities: new Set([eslint]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint']?.dependsOn).toStrictEqual(['//#lint:eslint']);
    expect(result.tasks['check']?.dependsOn).toStrictEqual(['lint']);
    expect(generateRootScripts(discovery)).toHaveProperty('check');
  });
});

describe.concurrent(generateTurboJson, () => {
  it('lint:eslint depends on generate when generate exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ generateScripts: ['generate:test'], capabilities: new Set([eslint]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint:eslint']?.dependsOn).toContain('generate');
  });

  it('includes lint:eslint when any package has ESLint', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([eslint]) })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('lint:eslint');
  });

  it('lint:eslint includes root config in inputs', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([eslint]) })]);

    const result = generateTurboJson(discovery);
    const task = result.tasks['lint:eslint'];

    expect(task?.inputs).toContain('$TURBO_ROOT$/eslint.config.*');
  });

  it('lint:eslint includes eslint cache in outputs', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([eslint]) })]);

    const result = generateTurboJson(discovery);
    const task = result.tasks['lint:eslint'];

    expect(task?.outputs).toContain('dist/.eslintcache');
  });

  it('prunes typecheck:ts from lint dependsOn when no TypeScript', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([eslint]) })]);

    const result = generateTurboJson(discovery);
    const lintEslint = result.tasks['lint:eslint'];

    expect(lintEslint?.dependsOn).not.toContain('typecheck:ts');
  });

  it('includes typecheck:ts in lint dependsOn when TypeScript exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([eslint, typescript]) }),
    ]);

    const result = generateTurboJson(discovery);
    const lintEslint = result.tasks['lint:eslint'];

    expect(lintEslint?.dependsOn).toContain('typecheck:ts');
  });

  /*
   * A root task reaches the workspace packages the root depends on only
   * through `^transit`; without it, an edit to a root-consumed package (the
   * ESLint config the root lints with) replays the root's cached pass.
   */
  it('//#lint:eslint depends on the root\'s workspace dependencies', ({ expect }) => {
    const discovery = makeDiscovery(
      [
        makePackage({ capabilities: new Set([eslint]) }),
        makePackage({ capabilities: new Set([eslint]) }),
      ],
      { capabilities: new Set([eslint]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['//#lint:eslint']?.dependsOn).toStrictEqual(['^transit']);
  });

  /*
   * lint:eslint would otherwise inherit the propagation through its
   * same-package typecheck:ts dep — an edge consumers are told they may drop,
   * and one that isn't generated at all without TypeScript.
   */
  it('lint:eslint depends on transit with no typecheck:ts to inherit from', ({ expect }) => {
    const discovery = makeDiscovery([makePackage({ capabilities: new Set([eslint]) })]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint:eslint']?.dependsOn).toStrictEqual(['transit']);
  });

  it('lint:eslint keeps both edges when TypeScript exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([eslint, typescript]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['lint:eslint']?.dependsOn).toStrictEqual(['typecheck:ts', 'transit']);
  });
});

describe.concurrent(generatePackageScripts, () => {
  it('generates lint:eslint for ESLint packages', ({ expect }) => {
    const caps = makePackage({ capabilities: new Set([eslint]) });

    const result = generatePackageScripts(caps, false);

    expect(result).toHaveProperty('lint:eslint', 'gtb task lint:eslint');
  });
});

describe.concurrent(generateRequiredRootScripts, () => {
  it('adds root lint:eslint when monorepo root has ESLint', ({ expect }) => {
    const discovery = makeDiscovery(
      [
        makePackage({ capabilities: new Set([eslint]) }),
        makePackage({ capabilities: new Set([eslint]) }),
      ],
      { capabilities: new Set([eslint]) },
    );

    const result = generateRequiredRootScripts(discovery);

    expect(result['lint:eslint']).toBe(
      'gtb task lint:eslint . --ignore-pattern "packages/*/**"',
    );
  });

  it('omits root lint:eslint when root has no ESLint', ({ expect }) => {
    const discovery = makeDiscovery(
      [
        makePackage({ capabilities: new Set([eslint]) }),
        makePackage({ capabilities: new Set([eslint]) }),
      ],
    );

    const result = generateRequiredRootScripts(discovery);

    expect(result).not.toHaveProperty('lint:eslint');
  });
});

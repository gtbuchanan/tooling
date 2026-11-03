import { describe, it } from 'vitest';
import { generateRequiredRootScripts, generateTurboJson } from '#src/codegen/turbo-config.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { skills } from '#src/toolchains/skills/capabilities.js';
import { makeDiscovery, makePackage, monorepoOf } from '#test/helpers.js';

const monorepoWithRootSkills = (): ReturnType<typeof makeDiscovery> =>
  makeDiscovery(
    [makePackage(), makePackage()],
    { capabilities: new Set([skills]) },
  );

describe.concurrent('generateTurboJson — root skills', () => {
  it('emits //#deploy:skills when monorepo root has skills', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootSkills());

    expect(result.tasks).toHaveProperty('//#deploy:skills');
  });

  it('omits //#deploy:skills in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([skills]) })],
      { capabilities: new Set([skills]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('//#deploy:skills');
    expect(result.tasks).toHaveProperty('deploy:skills');
  });

  it('omits //#deploy:skills when monorepo root has no skills', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([skills]) }),
      makePackage(),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('//#deploy:skills');
  });

  it('omits the package deploy:skills task when only the root has skills', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootSkills());

    expect(result.tasks).not.toHaveProperty('deploy:skills');
  });

  it('//#deploy:skills keys on the root skills tree and config', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootSkills());

    expect(result.tasks['//#deploy:skills']?.inputs)
      .toStrictEqual(['skills-npm.config.ts', 'skills/**']);
  });

  it('//#deploy:skills depends on //#lint:eslint when the root lints', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([eslint]) }), makePackage()],
      { capabilities: new Set([eslint, skills]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['//#deploy:skills']?.dependsOn).toStrictEqual(['//#lint:eslint']);
  });

  it('//#deploy:skills has no lint dep when the root has no ESLint', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([eslint]) }), makePackage()],
      { capabilities: new Set([skills]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['//#deploy:skills']?.dependsOn).toStrictEqual([]);
  });

  it('build depends on //#deploy:skills when the root has skills', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootSkills());

    expect(result.tasks['build']?.dependsOn).toContain('//#deploy:skills');
  });

  it('build depends on both copies when root and packages have skills', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([skills]) }), makePackage()],
      { capabilities: new Set([skills]) },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['build']?.dependsOn)
      .toStrictEqual(expect.arrayContaining(['deploy:skills', '//#deploy:skills']));
  });
});

describe.concurrent(generateTurboJson, () => {
  it('omits compile:skills when no published package has skills', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([published]), dir: '/fake/published' }),
      makePackage({ capabilities: new Set([skills]), dir: '/fake/skilled' }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('compile:skills');
    expect(result.tasks['pack:npm']?.dependsOn).toStrictEqual(['compile:ts']);
    expect(result.tasks['compile']?.dependsOn).toStrictEqual(['compile:ts']);
  });

  it('omits lint:eslint from deploy:skills dependsOn when no package has ESLint', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([skills]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['deploy:skills']?.dependsOn).toStrictEqual([]);
  });

  it('includes lint:eslint in deploy:skills dependsOn when ESLint exists', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([eslint, skills]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['deploy:skills']?.dependsOn).toStrictEqual(['lint:eslint']);
  });
});

describe.concurrent(generateRequiredRootScripts, () => {
  it('adds root deploy:skills when monorepo root has skills', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf(), { capabilities: new Set([skills]) });

    const result = generateRequiredRootScripts(discovery);

    expect(result).toHaveProperty('deploy:skills', 'gtb task deploy:skills');
  });

  it('omits root deploy:skills when only packages have skills', ({ expect }) => {
    const discovery = makeDiscovery(monorepoOf({ capabilities: new Set([skills]) }));

    const result = generateRequiredRootScripts(discovery);

    expect(result).not.toHaveProperty('deploy:skills');
  });
});

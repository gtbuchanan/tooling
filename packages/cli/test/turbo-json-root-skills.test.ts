import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

const monorepoWithRootSkills = (): ReturnType<typeof makeDiscovery> =>
  makeDiscovery(
    [makeCapabilities(), makeCapabilities()],
    { hasSkills: true },
  );

describe.concurrent('generateTurboJson — root skills', () => {
  it('emits //#deploy:skills when monorepo root has skills', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootSkills());

    expect(result.tasks).toHaveProperty('//#deploy:skills');
  });

  it('omits //#deploy:skills in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({ hasSkills: true })],
      { hasSkills: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('//#deploy:skills');
    expect(result.tasks).toHaveProperty('deploy:skills');
  });

  it('omits //#deploy:skills when monorepo root has no skills', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasSkills: true }),
      makeCapabilities(),
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
      [makeCapabilities({ hasEslint: true }), makeCapabilities()],
      { hasEslint: true, hasSkills: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['//#deploy:skills']?.dependsOn).toStrictEqual(['//#lint:eslint']);
  });

  it('//#deploy:skills has no lint dep when the root has no ESLint', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({ hasEslint: true }), makeCapabilities()],
      { hasSkills: true },
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
      [makeCapabilities({ hasSkills: true }), makeCapabilities()],
      { hasSkills: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['build']?.dependsOn)
      .toStrictEqual(expect.arrayContaining(['deploy:skills', '//#deploy:skills']));
  });
});

import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

const monorepoWithRootEslint = (): ReturnType<typeof makeDiscovery> =>
  makeDiscovery(
    [makeCapabilities({ hasEslint: true }), makeCapabilities({ hasEslint: true })],
    { hasEslint: true },
  );

describe.concurrent('generateTurboJson — root lint', () => {
  it('emits //#lint:eslint when monorepo root has ESLint', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootEslint());

    expect(result.tasks).toHaveProperty('//#lint:eslint');
  });

  it('omits //#lint:eslint in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({ hasEslint: true })],
      { hasEslint: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('//#lint:eslint');
  });

  it('omits //#lint:eslint when monorepo root has no ESLint', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({ hasEslint: true }), makeCapabilities({ hasEslint: true })],
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
});

import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

const monorepoWithRootTypeScript = (): ReturnType<typeof makeDiscovery> =>
  makeDiscovery(
    [makeCapabilities({ hasTypeScript: true }), makeCapabilities()],
    { hasTypeScript: true, hasTypeScriptSources: true },
  );

describe.concurrent('generateTurboJson — root typecheck', () => {
  it('emits //#typecheck:ts when the monorepo root has TypeScript sources', ({ expect }) => {
    const result = generateTurboJson(monorepoWithRootTypeScript());

    expect(result.tasks).toHaveProperty('//#typecheck:ts');
  });

  it('omits //#typecheck:ts in single-package repos', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({ hasTypeScript: true, hasTypeScriptSources: true })],
      { hasTypeScript: true, hasTypeScriptSources: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks).not.toHaveProperty('//#typecheck:ts');
    expect(result.tasks).toHaveProperty('typecheck:ts');
  });

  /*
   * `gtb sync` writes a root tsconfig.json unconditionally, so `hasTypeScript`
   * is true at every synced root. Gating on it would emit the task for a root
   * with nothing to check, where tsc fails outright (TS18003).
   */
  it('omits //#typecheck:ts when the root tsconfig has no sources', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({ hasTypeScript: true }), makeCapabilities()],
      { hasTypeScript: true },
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
      [makeCapabilities(), makeCapabilities()],
      { hasTypeScript: true, hasTypeScriptSources: true },
    );

    const result = generateTurboJson(discovery);

    expect(result.tasks['typecheck']?.dependsOn).toStrictEqual(['//#typecheck:ts']);
    expect(result.tasks).not.toHaveProperty('typecheck:ts');
  });
});

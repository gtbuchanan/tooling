import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/codegen/turbo-config.js';
import { makeCapabilities, makeDiscovery } from '#test/codegen/turbo-config.helpers.js';

const sourceReaders = [
  'typecheck:ts', 'compile:ts', 'lint:eslint',
  'test:vitest:fast', 'test:vitest:slow', 'test:vitest:e2e',
];

describe.concurrent('generateTurboJson (codegen edges)', () => {
  /*
   * Generated files are usually gitignored, so a task reading a dependency's
   * source must wait for that dependency's codegen; `transit` only hashes.
   */
  it.for(sourceReaders)('%s waits on its dependencies\' generate', (task, { expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        generateScripts: ['generate:test'],
        hasEslint: true,
        hasTypeScript: true,
        hasVitestE2e: true,
        hasVitestTests: true,
        isPublished: true,
      }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks[task]?.dependsOn).toContain('^generate');
  });

  it.for(['test:vitest:fast', 'test:vitest:slow', 'test:vitest:e2e'])(
    '%s waits on its own generate',
    (task, { expect }) => {
      const discovery = makeDiscovery([
        makeCapabilities({
          generateScripts: ['generate:test'], hasVitestE2e: true, hasVitestTests: true,
        }),
      ]);

      const result = generateTurboJson(discovery);

      expect(result.tasks[task]?.dependsOn).toContain('generate');
    },
  );

  /*
   * Root tasks read the root's workspace dependencies as source too. A bare
   * `generate` would resolve against the root itself and dangle.
   */
  it.for(['//#lint:eslint', '//#typecheck:ts'])(
    '%s waits on the root\'s dependencies\' generate',
    (task, { expect }) => {
      const generator = makeCapabilities({ generateScripts: ['generate:test'] });
      const discovery = makeDiscovery(
        [generator, makeCapabilities()],
        { hasEslint: true, hasTypeScript: true, hasTypeScriptSources: true },
      );

      const result = generateTurboJson(discovery);

      expect(result.tasks[task]?.dependsOn).toStrictEqual(['^generate', '^transit']);
    },
  );

  it.for(sourceReaders)('%s has no generate deps without generate scripts', (task, { expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({
        hasEslint: true,
        hasTypeScript: true,
        hasVitestE2e: true,
        hasVitestTests: true,
        isPublished: true,
      }),
    ]);

    const result = generateTurboJson(discovery);
    const dependsOn = result.tasks[task]?.dependsOn;

    expect(dependsOn).not.toContain('generate');
    expect(dependsOn).not.toContain('^generate');
  });
});

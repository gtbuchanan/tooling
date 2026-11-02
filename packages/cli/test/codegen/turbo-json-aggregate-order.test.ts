import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/codegen/turbo-config.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { pklPackage, pklSource } from '#src/toolchains/pkl/capabilities.js';
import { skills } from '#src/toolchains/skills/capabilities.js';
import { typescript, typescriptSources } from '#src/toolchains/typescript/capabilities.js';
import { makeCapabilities, makeDiscovery } from '#test/codegen/turbo-config.helpers.js';

describe.concurrent('generateTurboJson — aggregate member order', () => {
  it('lists root members first, then package members by name', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({
        capabilities: new Set([pklPackage, pklSource, typescript, published, skills]),
      })],
      { capabilities: new Set([typescriptSources, skills]), isMonorepo: true },
    );

    const { tasks } = generateTurboJson(discovery);

    expect(tasks['typecheck']?.dependsOn)
      .toStrictEqual(['//#typecheck:ts', 'typecheck:pkl', 'typecheck:ts']);
    expect(tasks['compile']?.dependsOn).toStrictEqual(['compile:skills', 'compile:ts']);
    expect(tasks['build']?.dependsOn).toContain('//#deploy:skills');
    expect(tasks['build']?.dependsOn?.indexOf('//#deploy:skills'))
      .toBeLessThan(tasks['build']?.dependsOn?.indexOf('deploy:skills') ?? -1);
  });
});

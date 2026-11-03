import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/codegen/turbo-config.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { skills } from '#src/toolchains/skills/capabilities.js';
import { makeDiscovery, makePackage } from '#test/helpers.js';

describe.concurrent(generateTurboJson, () => {
  it('includes pack:npm when any package is published', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([published]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks).toHaveProperty('pack:npm');
    expect(result.tasks).toHaveProperty('pack');
  });

  it('omits compile:skills from pack:npm dependsOn when no package has skills', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([published]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['pack:npm']?.dependsOn).toStrictEqual(['compile:ts']);
    expect(result.tasks).not.toHaveProperty('compile:skills');
  });

  it('includes compile:skills in pack:npm dependsOn when any package has skills', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([published, skills]) }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['pack:npm']?.dependsOn).toStrictEqual([
      'compile:ts',
      'compile:skills',
    ]);
  });
});

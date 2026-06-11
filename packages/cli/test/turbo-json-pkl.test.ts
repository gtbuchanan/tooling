import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

describe.concurrent('generateTurboJson (pkl)', () => {
  it('emits pkl leaves folded into the typecheck and pack aggregates', ({ expect }) => {
    const result = generateTurboJson(makeDiscovery([makeCapabilities({ hasPkl: true })]));

    expect(result.tasks['typecheck:pkl']).toStrictEqual({
      inputs: ['*.pkl', 'PklProject'],
      outputs: [],
    });
    expect(result.tasks['pack:pkl']).toStrictEqual({
      dependsOn: ['typecheck:pkl'],
      inputs: ['*.pkl', 'PklProject', 'package.json'],
      outputs: ['dist/packages/pkl/**'],
    });
    expect(result.tasks['typecheck']?.dependsOn).toContain('typecheck:pkl');
    expect(result.tasks['pack']?.dependsOn).toContain('pack:pkl');
  });

  it('omits pkl tasks when no package ships Pkl source', ({ expect }) => {
    const result = generateTurboJson(makeDiscovery([makeCapabilities()]));

    expect(result.tasks).not.toHaveProperty('typecheck:pkl');
    expect(result.tasks).not.toHaveProperty('pack:pkl');
  });

  it('typechecks but does not pack an internal Pkl package (no package block)', ({ expect }) => {
    const result = generateTurboJson(
      makeDiscovery([makeCapabilities({ hasPkl: true, hasPklPackage: false })]),
    );

    expect(result.tasks).toHaveProperty('typecheck:pkl');
    expect(result.tasks).not.toHaveProperty('pack:pkl');
    expect(result.tasks['typecheck']?.dependsOn).toContain('typecheck:pkl');
    expect(result.tasks).not.toHaveProperty('pack');
  });
});

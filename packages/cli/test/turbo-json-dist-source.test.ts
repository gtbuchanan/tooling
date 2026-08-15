import { describe, it } from 'vitest';
import { generateTurboJson } from '#src/lib/turbo-config.js';
import { makeCapabilities, makeDiscovery } from './turbo-config.helpers.ts';

/*
 * Every task writing the published output directory must declare only what it
 * writes: an overlapping glob lets one task cache a file another produced and
 * replay a stale copy of it on a hit.
 */
describe.concurrent('generateTurboJson (dist/source ownership)', () => {
  it('excludes the generated manifest from pack:npm inputs', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['pack:npm']?.inputs).toContain('!dist/source/package.json');
  });

  it('excludes the generated .npmignore from pack:npm inputs', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['pack:npm']?.inputs).toContain('!dist/source/.npmignore');
  });

  it('claims every file it writes as a pack:npm output', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['pack:npm']?.outputs).toStrictEqual(expect.arrayContaining([
      'dist/source/.npmignore',
      'dist/source/LICENSE',
      'dist/source/README.md',
      'dist/source/package.json',
    ]));
  });

  it('excludes the pack:npm-owned files from compile:ts outputs', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['compile:ts']?.outputs).toStrictEqual([
      'dist/source/**',
      '!dist/source/.npmignore',
      '!dist/source/LICENSE',
      '!dist/source/README.md',
      '!dist/source/package.json',
    ]);
  });

  it('excludes the compile:skills subtree from compile:ts outputs', ({ expect }) => {
    const discovery = makeDiscovery([
      makeCapabilities({ hasSkills: true, isPublished: true }),
    ]);

    const result = generateTurboJson(discovery);

    expect(result.tasks['compile:ts']?.outputs).toContain('!dist/source/skills/**');
  });
});

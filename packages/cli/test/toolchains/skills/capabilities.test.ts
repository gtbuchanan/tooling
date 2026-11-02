import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { discoverPackage } from '#src/core/discovery.js';
import { capabilities } from '#src/toolchains/index.js';
import { skills } from '#src/toolchains/skills/capabilities.js';
import { createTempDir, writeJson } from '#test/helpers.js';

describe.concurrent('skills', () => {
  it('holds for a package holding a skills/ directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'skills'));

    expect(discoverPackage(dir, capabilities).capabilities.has(skills)).toBe(true);
  });

  it('does not hold for a package without one', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFileSync(path.join(dir, 'SKILL.md'), '');

    expect(discoverPackage(dir, capabilities).capabilities.has(skills)).toBe(false);
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { loadConfiguredAgents, skillsConfigFilename } from '#src/lib/skills-config.js';

interface Fixture {
  readonly rootDir: string;
  readonly configPath: string;
  readonly [Symbol.dispose]: () => void;
}

const createFixture = (): Fixture => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'gtb-skills-config-'));
  return {
    rootDir,
    configPath: path.join(rootDir, skillsConfigFilename),
    [Symbol.dispose]: () => {
      rmSync(rootDir, { force: true, recursive: true });
    },
  };
};

describe.concurrent('loadConfiguredAgents', () => {
  it('returns empty array when skills-npm.config.ts is absent', async ({ expect }) => {
    using fixture = createFixture();

    const agents = await loadConfiguredAgents(fixture.rootDir);

    expect(agents).toStrictEqual([]);
  });

  it('returns agents when config exports a default with an agents array', async ({ expect }) => {
    using fixture = createFixture();
    const agents = [faker.lorem.slug({ min: 1, max: 2 }), faker.lorem.slug({ min: 1, max: 2 })];
    writeFileSync(
      fixture.configPath,
      `export default { agents: ${JSON.stringify(agents)} };\n`,
    );

    const result = await loadConfiguredAgents(fixture.rootDir);

    expect(result).toStrictEqual(agents);
  });

  it('returns empty array when default export has no agents', async ({ expect }) => {
    using fixture = createFixture();
    writeFileSync(fixture.configPath, 'export default {};\n');

    const agents = await loadConfiguredAgents(fixture.rootDir);

    expect(agents).toStrictEqual([]);
  });

  it('rejects when agents is not a string array', async ({ expect }) => {
    using fixture = createFixture();
    writeFileSync(
      fixture.configPath,
      'export default { agents: [1, 2] };\n',
    );

    await expect(loadConfiguredAgents(fixture.rootDir)).rejects.toThrow(/Expected string/v);
  });
});

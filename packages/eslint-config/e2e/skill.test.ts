import { it as base, describe } from 'vitest';
import { type Fixture, createFixture } from './fixture.ts';

/* eslint-disable-next-line vitest/consistent-test-it --
   False positive on .extend() factory:
   https://github.com/vitest-dev/eslint-plugin-vitest/issues/884 */
const it = base.extend<{ fixture: Fixture }>({

  fixture: [async ({}, use) => {
    using fixture = createFixture();
    await use(fixture);
  }, { scope: 'file' }],
});

const skill = (frontmatter: readonly string[], body: readonly string[] = ['# Body', '']) =>
  ['---', ...frontmatter, '---', '', ...body].join('\n');

describe.concurrent('SKILL.md validation', () => {
  it('passes for a valid SKILL.md', async ({ fixture, expect }) => {
    const result = await fixture.run({
      files: {
        'skills/example-skill/SKILL.md': skill(
          [
            'name: example-skill',
            'description: A description that is descriptive enough.',
          ],
          ['# Example skill', '', 'Body content.', ''],
        ),
      },
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).not.toMatch(/md-frontmatter|agent-skills/v);
  });

  it('flags missing required frontmatter fields', async ({ fixture, expect }) => {
    const result = await fixture.run({
      files: {
        'skills/example-skill/SKILL.md': skill(['name: example-skill']),
      },
    });

    expect(result.stdout).toMatch(/md-frontmatter\/schema/v);
    expect(result.stdout).toMatch(/required property 'description'/v);
  });

  it('flags non-kebab-case name', async ({ fixture, expect }) => {
    const result = await fixture.run({
      files: {
        'skills/example-skill/SKILL.md': skill([
          'name: ExampleSkill',
          'description: A description that is descriptive enough.',
        ]),
      },
    });

    expect(result.stdout).toMatch(/md-frontmatter\/schema/v);
    expect(result.stdout).toMatch(/must match pattern/v);
  });

  it('flags unknown frontmatter fields', async ({ fixture, expect }) => {
    const result = await fixture.run({
      files: {
        'skills/example-skill/SKILL.md': skill([
          'name: example-skill',
          'description: A description that is descriptive enough.',
          'unknown: value',
        ]),
      },
    });

    expect(result.stdout).toMatch(/md-frontmatter\/schema/v);
    expect(result.stdout).toMatch(/additional properties/v);
  });

  it('flags name not matching parent directory', async ({ fixture, expect }) => {
    const result = await fixture.run({
      files: {
        'skills/example-skill/SKILL.md': skill([
          'name: wrong-name',
          'description: A description that is descriptive enough.',
        ]),
      },
    });

    expect(result.stdout).toMatch(/agent-skills\/name-matches-dir/v);
    expect(result.stdout).toMatch(/expected `example-skill`, got `wrong-name`/v);
  });

  it('caps file at 500 lines per the spec', async ({ fixture, expect }) => {
    const lines = Array.from(
      { length: 600 },
      (_unused, index) => `Line ${String(index + 1)}`,
    );
    const result = await fixture.run({
      files: {
        'skills/example-skill/SKILL.md': skill(
          [
            'name: example-skill',
            'description: A description that is descriptive enough.',
          ],
          [...lines, ''],
        ),
      },
    });

    expect(result.stdout).toMatch(/max-lines/v);
    expect(result.stdout).toMatch(/Maximum allowed is 500/v);
  });
});

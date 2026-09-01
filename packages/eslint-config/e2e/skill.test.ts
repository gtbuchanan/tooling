import { faker } from '@faker-js/faker';
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

const skillName = (): string => faker.lorem.slug({ min: 1, max: 2 });

describe.concurrent('SKILL.md validation', () => {
  it('passes for a valid SKILL.md', async ({ fixture, expect }) => {
    const name = skillName();
    const result = await fixture.run({
      files: {
        [`skills/${name}/SKILL.md`]: skill(
          [
            `name: ${name}`,
            `description: ${faker.lorem.sentence()}`,
          ],
          ['# Example skill', '', 'Body content.', ''],
        ),
        [`skills/${name}/evals/evals.json`]: `${JSON.stringify({
          evals: [{
            expectations: ['Activates skill'],
            expected_output: 'Example output',
            files: [],
            id: 1,
            prompt: 'Example prompt',
          }],
          skill_name: name,
        }, undefined, 2)}\n`,
      },
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).not.toMatch(/md-frontmatter|agent-skills/v);
  });

  it('flags missing required frontmatter fields', async ({ fixture, expect }) => {
    const name = skillName();
    const result = await fixture.run({
      files: {
        [`skills/${name}/SKILL.md`]: skill([`name: ${name}`]),
      },
    });

    expect(result.stdout).toMatch(/md-frontmatter\/schema/v);
    expect(result.stdout).toMatch(/required property 'description'/v);
  });

  it('flags non-kebab-case name', async ({ fixture, expect }) => {
    const name = skillName();
    const result = await fixture.run({
      files: {
        [`skills/${name}/SKILL.md`]: skill([
          'name: ExampleSkill',
          `description: ${faker.lorem.sentence()}`,
        ]),
      },
    });

    expect(result.stdout).toMatch(/md-frontmatter\/schema/v);
    expect(result.stdout).toMatch(/must match pattern/v);
  });

  it('flags unknown frontmatter fields', async ({ fixture, expect }) => {
    const name = skillName();
    const result = await fixture.run({
      files: {
        [`skills/${name}/SKILL.md`]: skill([
          `name: ${name}`,
          `description: ${faker.lorem.sentence()}`,
          'unknown: value',
        ]),
      },
    });

    expect(result.stdout).toMatch(/md-frontmatter\/schema/v);
    expect(result.stdout).toMatch(/additional properties/v);
  });

  it('flags name not matching parent directory', async ({ fixture, expect }) => {
    const name = skillName();
    const result = await fixture.run({
      files: {
        [`skills/${name}/SKILL.md`]: skill([
          'name: wrong-name',
          `description: ${faker.lorem.sentence()}`,
        ]),
      },
    });

    expect(result.stdout).toMatch(/agent-skills\/name-matches-dir/v);
    expect(result.stdout).toMatch(
      new RegExp(`expected \`${name}\`, got \`wrong-name\``, 'v'),
    );
  });

  it('passes when referenced files exist within the skill root', async ({ fixture, expect }) => {
    const name = skillName();
    const result = await fixture.run({
      files: {
        [`skills/${name}/SKILL.md`]: skill(
          [
            `name: ${name}`,
            `description: ${faker.lorem.sentence()}`,
          ],
          [
            '# Example skill',
            '',
            'See [the reference](references/REFERENCE.md) for details.',
            '',
          ],
        ),
        [`skills/${name}/references/REFERENCE.md`]: '# Reference\n\nStub.\n',
      },
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).not.toMatch(/agent-skills\/file-references/v);
  });

  it('flags references to files that do not exist', async ({ fixture, expect }) => {
    const name = skillName();
    const result = await fixture.run({
      files: {
        [`skills/${name}/SKILL.md`]: skill(
          [
            `name: ${name}`,
            `description: ${faker.lorem.sentence()}`,
          ],
          [
            '# Example skill',
            '',
            'See [the reference](references/MISSING.md).',
            '',
          ],
        ),
      },
    });

    expect(result.stdout).toMatch(/agent-skills\/file-references/v);
    expect(result.stdout).toMatch(/not found.*references\/MISSING\.md/v);
  });

  it('caps file at the spec token budget', async ({ fixture, expect }) => {
    const name = skillName();
    /* Four UTF-8 bytes per estimated token, so this body lands one
       token past the 5000 the spec recommends for the instructions
       tier. One line, so a line count can't stand in for it. */
    const result = await fixture.run({
      files: {
        [`skills/${name}/SKILL.md`]: skill(
          [
            `name: ${name}`,
            `description: ${faker.lorem.sentence()}`,
          ],
          ['# Example skill', '', 'word'.repeat(5001), ''],
        ),
      },
    });

    expect(result.stdout).toMatch(/max-tokens/v);
    expect(result.stdout).toMatch(/Maximum recommended is 5000/v);
  });

  /* The recommended config gates length on tokens alone. `max-lines`
     still ships, but a repo has to opt into it, so a long file of cheap
     lines lints clean. */
  it('does not cap file by line count', async ({ fixture, expect }) => {
    const name = skillName();
    const lines = Array.from(
      { length: 600 },
      (_unused, index) => `Line ${String(index + 1)}`,
    );
    const result = await fixture.run({
      files: {
        [`skills/${name}/SKILL.md`]: skill(
          [
            `name: ${name}`,
            `description: ${faker.lorem.sentence()}`,
          ],
          ['# Example skill', '', ...lines, ''],
        ),
      },
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).not.toMatch(/max-lines/v);
  });
});

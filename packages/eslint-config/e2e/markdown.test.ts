import { it as base, describe } from 'vitest';
import {
  type Fixture,
  createFixture,
  requireOnlyWarnConfig,
} from './fixture.ts';

/* eslint-disable-next-line vitest/consistent-test-it --
   False positive on .extend() factory:
   https://github.com/vitest-dev/eslint-plugin-vitest/issues/884 */
const it = base.extend<{ fixture: Fixture }>({

  fixture: [async ({}, use) => {
    using fixture = createFixture();
    await use(fixture);
  }, { scope: 'file' }],
});

describe.concurrent('eslint CLI markdown integration', () => {
  it('detects markdownlint violations in markdown files', async ({ fixture, expect }) => {
    // MD026 (no-trailing-punctuation) — markdownlint-only, not covered
    // by `@eslint/markdown`'s recommended set.
    const result = await fixture.run({
      files: { 'doc.md': '# Title.\n' },
    });

    expect(result.stdout).toContain('markdownlint/lint');
    expect(result.stdout).toMatch(/MD026/v);
  });

  it('suppresses markdownlint rules disabled by prettier style', async ({ fixture, expect }) => {
    // heading-style (md003) is disabled — mixed ATX/setext should pass
    const result = await fixture.run({
      files: { 'doc.md': '# ATX heading\n\nSetext heading\n---\n' },
    });

    expect(result.stdout).not.toMatch(/MD003/v);
  });

  it('runs prettier, markdownlint, and markdown on the same file', async ({ fixture, expect }) => {
    /*
     * All three plugins target *.md. The misformatted table trips
     * format/prettier; trailing punctuation in the heading trips
     * markdownlint MD026; the duplicate H1 trips
     * markdown/no-multiple-h1 from `@eslint/markdown`.
     */
    const result = await fixture.run({
      files: {
        'doc.md': '# Title.\n\n| a|b |\n|---|---|\n| 1|2 |\n\n# Title.\n',
      },
    });

    expect(result.stdout).toContain('format/prettier');
    expect(result.stdout).toContain('markdownlint/lint');
    expect(result.stdout).toContain('markdown/no-multiple-h1');
  });

  it('applies markdownlint autofix via --fix', async ({ fixture, expect }) => {
    // MD034: no-bare-urls (fixable, not disabled by prettier conflicts)
    const result = await fixture.run({
      config: requireOnlyWarnConfig,
      files: { 'doc.md': '# Title\n\nVisit https://example.com today.\n' },
      flags: ['--fix'],
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.readFile('doc.md')).toBe(
      '# Title\n\nVisit <https://example.com> today.\n',
    );
  });

  it('ignores .changeset/ files for markdownlint', async ({ fixture, expect }) => {
    // Changeset file without a heading — would fail MD041 if not ignored
    const result = await fixture.run({
      files: {
        '.changeset/test-changeset.md': 'No heading here\n',
        'doc.md': '# Valid\n\nContent.\n',
      },
    });

    expect(result.stdout).not.toMatch(/MD041/v);
  });
});

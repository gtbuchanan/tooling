import { describe, it } from 'vitest';
import { configure } from '@/index.js';

describe('oxfmt configure', () => {
  it('enables singleQuote by default', ({ expect }) => {
    const config = configure();

    expect(config.singleQuote).toBe(true);
  });

  it('ignores JavaScript and TypeScript files by default', ({ expect }) => {
    const config = configure();

    expect(config.ignorePatterns).toEqual([
      '.claude/worktrees/**',
      '*.cjs',
      '*.cts',
      '*.js',
      '*.jsx',
      '*.mjs',
      '*.mts',
      '*.ts',
      '*.tsx',
    ]);
  });

  it('passes defaults to transform function', ({ expect }) => {
    const config = configure(defaults => ({
      ...defaults,
      printWidth: 80,
    }));

    expect(config.printWidth).toBe(80);
    expect(config.singleQuote).toBe(true);
  });

  it('allows replacing defaults via transform', ({ expect }) => {
    const config = configure(() => ({
      singleQuote: false,
    }));

    expect(config.singleQuote).toBe(false);
    expect(config.ignorePatterns).toBeUndefined();
  });

  it('does not share state between calls', ({ expect }) => {
    const first = configure();
    first.ignorePatterns?.push('*.vue');
    const second = configure();

    expect(second.ignorePatterns).not.toContain('*.vue');
  });
});

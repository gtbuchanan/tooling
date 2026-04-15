import { describe, it } from 'vitest';
import { configure, configureCli2 } from '#src/index.mjs';

describe(configure, () => {
  it('disables single-trailing-newline by default', ({ expect }) => {
    const config = configure();

    expect(config['single-trailing-newline']).toBe(false);
  });

  it('passes defaults to transform function', ({ expect }) => {
    const config = configure(defaults => ({
      ...defaults,
      'line-length': false,
    }));

    expect(config['line-length']).toBe(false);
    expect(config['single-trailing-newline']).toBe(false);
  });

  it('allows replacing defaults via transform', ({ expect }) => {
    const config = configure(() => ({
      'line-length': false,
    }));

    expect(config['line-length']).toBe(false);
    expect(config['single-trailing-newline']).toBeUndefined();
  });

  it('does not share state between calls', ({ expect }) => {
    const first = configure();
    first['custom-rule'] = true;
    const second = configure();

    expect(second).not.toHaveProperty('custom-rule');
  });
});

describe(configureCli2, () => {
  it('ignores .changeset by default', ({ expect }) => {
    const config = configureCli2();

    expect(config.ignores).toEqual(['.changeset/**']);
  });

  it('passes defaults to transform function', ({ expect }) => {
    const config = configureCli2(defaults => ({
      ...defaults,
      ignores: [...(defaults.ignores ?? []), 'vendor/**'],
    }));

    expect(config.ignores).toEqual(['.changeset/**', 'vendor/**']);
  });

  it('allows replacing defaults via transform', ({ expect }) => {
    const config = configureCli2(() => ({
      ignores: ['custom/**'],
    }));

    expect(config.ignores).toEqual(['custom/**']);
  });

  it('does not share state between calls', ({ expect }) => {
    const first = configureCli2();
    first.ignores?.push('leaked/**');
    const second = configureCli2();

    expect(second.ignores).not.toContain('leaked/**');
  });
});

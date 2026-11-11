import { describe, it } from 'vitest';
import { parseSyncScopes, syncScopes } from '#src/codegen/sync-scopes.js';

describe.concurrent(parseSyncScopes, () => {
  it('selects all scopes when no tokens are given', ({ expect }) => {
    expect(parseSyncScopes([])).toStrictEqual({ scopes: new Set(syncScopes) });
  });

  it('selects only the named scopes', ({ expect }) => {
    expect(parseSyncScopes(['scripts', 'turbo'])).toStrictEqual({
      scopes: new Set(['scripts', 'turbo']),
    });
  });

  it('reports unknown scopes as errors', ({ expect }) => {
    expect(parseSyncScopes(['scripts', 'bogus'])).toMatchObject({
      errors: [expect.stringContaining("unknown scope 'bogus'")],
    });
  });

  // The hk toolchain's plan owns mise.tasks.toml, under the toolchains scope
  it('no longer accepts the mise scope', ({ expect }) => {
    expect(parseSyncScopes(['mise'])).toMatchObject({
      errors: [expect.stringContaining("unknown scope 'mise'")],
    });
  });
});

import { describe, it } from 'vitest';
import { parseSyncScopes, syncScopes } from '#src/lib/sync-scopes.js';

describe.concurrent(parseSyncScopes, () => {
  it('selects all scopes when no tokens are given', ({ expect }) => {
    expect(parseSyncScopes([])).toStrictEqual({ scopes: new Set(syncScopes) });
  });

  it('selects only the named scopes', ({ expect }) => {
    expect(parseSyncScopes(['mise', 'turbo'])).toStrictEqual({
      scopes: new Set(['mise', 'turbo']),
    });
  });

  it('reports unknown scopes as errors', ({ expect }) => {
    expect(parseSyncScopes(['mise', 'bogus'])).toMatchObject({
      errors: [expect.stringContaining("unknown scope 'bogus'")],
    });
  });
});

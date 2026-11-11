import { describe, it } from 'vitest';
import { parseSyncScopes, syncScopes } from '#src/codegen/sync-scopes.js';

describe.concurrent(parseSyncScopes, () => {
  it('selects all scopes when no tokens are given', ({ expect }) => {
    expect(parseSyncScopes([])).toStrictEqual({ scopes: new Set(syncScopes) });
  });

  it('selects only the named scopes', ({ expect }) => {
    expect(parseSyncScopes(['toolchains', 'turbo'])).toStrictEqual({
      scopes: new Set(['toolchains', 'turbo']),
    });
  });

  it('reports unknown scopes as errors', ({ expect }) => {
    expect(parseSyncScopes(['turbo', 'bogus'])).toMatchObject({
      errors: [expect.stringContaining("unknown scope 'bogus'")],
    });
  });

  // Their plans run under the toolchains scope
  it.for(['mise', 'scripts'])('no longer accepts the %s scope', (scope, { expect }) => {
    expect(parseSyncScopes([scope])).toMatchObject({
      errors: [expect.stringContaining(`unknown scope '${scope}'`)],
    });
  });
});

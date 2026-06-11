/**
 * Selectable scopes shared by `gtb sync` and `gtb verify` — each maps to one
 * generated artifact. Passed as positional args (`gtb sync mise turbo`,
 * `gtb verify mise`); no args means all scopes.
 */
export const syncScopes = ['codecov', 'manifest', 'mise', 'scripts', 'tsconfig', 'turbo'] as const;

/** One {@link syncScopes} entry. */
export type SyncScope = (typeof syncScopes)[number];

/** Result of {@link parseSyncScopes}: the selected scopes, or parse errors. */
export type ParsedSyncScopes =
  | { readonly errors: readonly string[] }
  | { readonly scopes: ReadonlySet<SyncScope> };

/**
 * Resolves positional scope tokens to a {@link SyncScope} set. No tokens
 * selects every scope (the default); unknown tokens are errors.
 */
export const parseSyncScopes = (tokens: readonly string[]): ParsedSyncScopes => {
  if (tokens.length === 0) {
    return { scopes: new Set(syncScopes) };
  }
  const scopes = new Set<SyncScope>();
  const errors: string[] = [];
  for (const token of tokens) {
    const match = syncScopes.find(scope => scope === token);
    if (match === undefined) {
      errors.push(`unknown scope '${token}' (expected: ${syncScopes.join(', ')})`);
    } else {
      scopes.add(match);
    }
  }

  return errors.length > 0 ? { errors } : { scopes };
};

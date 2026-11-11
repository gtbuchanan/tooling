/**
 * Why a command that takes no positional arguments rejects the ones it got,
 * or nothing when it got none. `gtb sync` and `gtb verify` once took scopes
 * here, so a stale one fails rather than silently running everything.
 */
export const rejectPositionals = (
  command: string,
  positionals: readonly string[],
): string | undefined =>
  (positionals.length === 0
    ? undefined
    : `gtb ${command} takes no arguments, but got ${positionals.map(arg => `'${arg}'`).join(' ')}`);

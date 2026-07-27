/**
 * Policy for `pnpm/yaml-enforce-settings`, which lints the settings keys
 * of `pnpm-workspace.yaml` — the block that absorbed most of `.npmrc` in
 * pnpm 10. Catalogs and package globs are covered by the plugin's other
 * rules and are not part of this policy.
 */
export interface PnpmWorkspaceSettings {
  /** Keys that must be absent. Reported, never auto-fixed. */
  readonly forbiddenFields?: string[];
  /** Keys that must be present, with any value. Reported, never auto-fixed. */
  readonly requiredFields?: string[];
  /** Keys that must be present with exactly these values. Auto-fixable. */
  readonly settings?: Record<string, unknown>;
}

/**
 * House policy applied to `pnpm-workspace.yaml` by default. Pass a
 * replacement (or `false`) as `pnpmWorkspaceSettings` to opt out.
 */
export const defaultPnpmWorkspaceSettings: PnpmWorkspaceSettings = {
  /*
   * Settings that undo a control this policy relies on. Forbidding the key
   * rather than matching a value is deliberate: `settings` can only express
   * exact equality, never "anything but this". All are reported rather than
   * fixed — removing one can break an install that has come to depend on it.
   *
   * `dangerouslyAllowAllBuilds` runs every dependency's install scripts
   * without approval, bypassing the `allowBuilds` allowlist.
   * `publicHoistPattern` and `shamefullyHoist` both flatten dependencies
   * into the root `node_modules`, undoing `hoist: false` and letting
   * undeclared imports resolve — pnpm defines `shamefullyHoist` as
   * `publicHoistPattern: '*'`, so forbidding only one leaves the hole open.
   * `trustLockfile` skips the lockfile's supply-chain verification pass.
   */
  forbiddenFields: [
    'dangerouslyAllowAllBuilds',
    'publicHoistPattern',
    'shamefullyHoist',
    'trustLockfile',
  ],
  /*
   * The exclude list is required rather than value-matched: consumers add
   * their own scopes to it, and `settings` compares whole values, so an
   * exact match would make `--fix` delete those additions.
   */
  requiredFields: ['minimumReleaseAgeExclude'],
  settings: {
    engineStrict: true,
    hoist: false,
    // 4320 minutes = 3 days, matching the shared Renovate preset's quarantine.
    minimumReleaseAge: 4320,
    strictPeerDependencies: true,
  },
};

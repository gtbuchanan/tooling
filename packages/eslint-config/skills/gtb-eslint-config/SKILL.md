---
name: gtb-eslint-config
description: ESLint configuration guidance for projects using @gtbuchanan/eslint-config. Covers the configure() API and options, pre-commit isolated-environment setup via createRequire, the bundled plugin set, suppression conventions, the two-plugin Markdown lint split, gitignore-derived ignores, and the per-package vs. workspace-root config split. Trigger keywords - @gtbuchanan/eslint-config, eslint.config.ts, configure, ESLintConfigureOptions, eslint-disable, eslint-disable-next-line, gitignore, defaultIgnores, eslint-config-flat-gitignore, markdownlint-disable, --max-warnings, dist/.eslintcache, lint:eslint, ESLint flat config, ESLint suppression.
---

# @gtbuchanan/eslint-config

Shared ESLint flat-config factory for TypeScript projects. Bundles
`typescript-eslint` strict + stylistic presets and a curated plugin set,
plus Prettier-via-ESLint formatting for non-JS/TS files.

## Quickstart

Install peers and configure:

```sh
pnpm add -D @gtbuchanan/eslint-config eslint jiti
```

```typescript
// eslint.config.ts
import { configure } from '@gtbuchanan/eslint-config';

export default configure({
  tsconfigRootDir: import.meta.dirname,
});
```

`configure()` returns `Promise<Linter.Config[]>`; ESLint awaits async
flat configs natively.

## `configure()` options

All optional except `tsconfigRootDir` (recommended for type-aware rules):

- **`tsconfigRootDir`** — Root directory for the TypeScript project
  service. Pass `import.meta.dirname` from the config file.
- **`target`** — `'server'` (default) or `'browser'`. Server enables
  `require-unicode-regexp` with the `/v` flag. Browser enables
  `no-console` and `no-alert`; entry points are exempt from `no-console`.
- **`agentSkillsHost`** — Agent hosts whose `SKILL.md` frontmatter
  extensions are accepted. A host name, a property map for a host the
  plugin doesn't ship, or a list of either. Defaults to `'standard'`
  (the bare Agent Skills spec). See below.
- **`entryPoints`** — Glob patterns exempt from `process.exit` and
  hashbang restrictions (and from `no-console` in browser mode).
  Defaults to `**/bin/**/*.{js,mjs,cjs,ts,mts,cts}` and `**/scripts/**/*`.
- **`gitignore`** — Derives ignore patterns from `.gitignore` via
  `eslint-config-flat-gitignore`. Defaults to `true`. See below.
- **`ignores`** — Global ignore patterns applied on top of the
  `.gitignore`-derived ones, covering the **tracked** files another tool
  owns the format of. Defaults to `defaultIgnores`: lockfiles
  (`**/*-lock.json`, `**/*-lock.yaml`, `**/*.lock`, `**/*.lock.json`,
  `**/npm-shrinkwrap.json`) and `**/CHANGELOG.md`. Changesets formats the
  changelogs it generates with its own Prettier resolution, so linting
  them here reports diffs that are unfixable at the source. Passing this
  option replaces the list wholesale — spread `defaultIgnores` to extend
  it.
- **`onlyWarn`** — Downgrades all errors to warnings via
  `eslint-plugin-only-warn`. Defaults to `true`. Irreversible within
  a process — uses a side-effect import that monkey-patches the ESLint
  Linter class.
- **`pnpm`** — Enables `eslint-plugin-pnpm` rules for `package.json`
  and `pnpm-workspace.yaml`. Defaults to `true`.
- **`pnpmWorkspaceSettings`** — Policy for `pnpm/yaml-enforce-settings`,
  which lints the settings keys of `pnpm-workspace.yaml`. Defaults to
  `defaultPnpmWorkspaceSettings` (see below). Pass `false` to keep the
  catalog rules but drop the settings policy. Ignored when `pnpm` is
  `false`.

## Gitignore-derived ignores

`configure()` reads `.gitignore` through
[`eslint-config-flat-gitignore`](https://github.com/antfu/eslint-config-flat-gitignore)
and contributes the converted patterns as a global-ignores entry named
`gitignore`. This is why `ignores` lists only tracked files: build output,
caches, and generated files are already untracked, so `.gitignore` is the
single source of truth for them.

Two defaults differ from upstream, and a caller-supplied options object is
merged over them (unlike `ignores`, partial overrides keep the rest):

- **`recursive: true`** — also picks up per-package `.gitignore` files, so
  a workspace-root lint run honors the ones nested in each package.
  Discovery is a directory walk; pass
  `{ recursive: { skipDirs: [...] } }` to prune it in a large repo.
- **`strict: false`** — upstream throws when an ignore file is missing.
  A shared config is loaded by repos it knows nothing about, so a missing
  `.gitignore` contributes no patterns rather than failing the lint run.

```typescript
export default configure({ gitignore: false }); // opt out entirely
export default configure({
  gitignore: { files: ['.gitignore', '.eslintignore'] },
});
```

Opting out leaves only `ignores`, which no longer covers build output —
a repo that does so has to enumerate its own generated paths.

### Why per-package lint sees fewer patterns

Patterns are resolved relative to the directory ESLint runs in, and a
`.gitignore` entry containing a mid-string `/` is anchored to the
directory of the file that declared it. So when a per-package config
walks up to the workspace-root `.gitignore`:

- Depth-agnostic entries survive — `dist/` becomes `**/dist/`, which
  still matches inside the package.
- Root-anchored entries are **dropped** — `.claude/worktrees/` names a
  path outside the package, and no ESLint ignore pattern can reach a
  parent directory.

Nothing is lost, because the root config lints those root paths. It does
mean the `gitignore` entry legitimately holds different patterns
depending on which config loaded it.

## Agent Skills frontmatter hosts

`SKILL.md` frontmatter is validated against the
[Agent Skills spec](https://agentskills.io/specification), which closes
the object to unknown properties. The spec sanctions only the nested
`metadata` map for client-specific data, so a host that puts fields at
the top level — as Claude Code does — needs each one declared. There is
no reserved top-level namespace to pattern-match instead, which is why
this is a per-host list rather than a wildcard.

```typescript
export default configure({ agentSkillsHost: 'claude-code' });
```

Skills that target several hosts list them all — every name the plugin
ships, plus a JSON Schema property map for any host it doesn't. Fields
are unioned, so the result accepts every field any listed source
declares:

```typescript
export default configure({
  agentSkillsHost: ['claude-code', { 'x-team-owner': { type: 'string' } }],
});
```

An unrecognized host name throws rather than silently contributing no
fields, so a typo surfaces at config load rather than as unexplained
frontmatter errors.

`'claude-code'` adds the fields from Claude Code's
[frontmatter reference](https://code.claude.com/docs/en/skills), plus
the YAML-list spelling it accepts for `allowed-tools`. The plugin's
`skillFrontmatterHosts` registry is what each name resolves to.

Every form adds properties only: `name` and `description` stay required
and every shared constraint still applies, so a skill that validates
under a host is still portable to a spec-only host apart from the
extension fields themselves. There is no "valid under every host at
once" setting — that is `'standard'`, the default, which is also what
keeps a stray `user_invocable` typo an error rather than a
silently-ignored field.

## pnpm workspace settings policy

`pnpm/yaml-enforce-settings` lints the settings keys of
`pnpm-workspace.yaml` — the block that absorbed most of `.npmrc` in
pnpm 10. The other `eslint-plugin-pnpm` rules cover only catalogs and
package globs, so this is the one that keeps install behavior
consistent across repos. `defaultPnpmWorkspaceSettings` enforces:

- `settings` (exact key **and** value, auto-fixable) —
  `engineStrict: true`, `hoist: false`, `minimumReleaseAge: 4320`
  (3 days, matching the shared Renovate preset), and
  `strictPeerDependencies: true`
- `requiredFields` (key must exist, any value, never fixed) —
  `minimumReleaseAgeExclude`
- `forbiddenFields` (key must not exist, never fixed) —
  `dangerouslyAllowAllBuilds`, `publicHoistPattern`, `shamefullyHoist`,
  `trustLockfile`

Each `settings` entry is inserted into the consumer's file by `--fix`,
so the set is kept to values that differ from pnpm's own defaults.
Settings that merely restate a default add a line that changes nothing.

### Why the unsafe settings are forbidden keys

`settings` can only express exact equality — there is no "anything but
this value". A setting that is dangerous in one direction therefore has
to be banned outright by key. `dangerouslyAllowAllBuilds` runs every
dependency's install scripts without approval, bypassing `allowBuilds`.
`publicHoistPattern` and `shamefullyHoist` both flatten dependencies
into the root `node_modules`, undoing `hoist: false` and letting
undeclared imports resolve — pnpm defines `shamefullyHoist` as
`publicHoistPattern: '*'`, so banning one without the other leaves the
hole open. `trustLockfile` skips the lockfile's supply-chain
verification pass.

Because these are key-presence checks, they also flag a harmless
explicit value (`publicHoistPattern: []`), and a key absent from an
older pnpm simply never appears.

### Why the exclude list is required rather than value-matched

`settings` compares whole values with deep equality, and its fixer
replaces the entire key/value pair. For a list a consumer legitimately
extends, that combination is destructive: adding `'@acme/*'` to
`minimumReleaseAgeExclude` would read as a mismatch, and `--fix` would
delete it. Requiring the key without pinning its value keeps the
setting deliberate while leaving its contents to the consumer. Apply
the same reasoning before moving any future list-valued setting into
`settings`.

### Overriding the policy

`pnpmWorkspaceSettings` **replaces** the default rather than merging
into it, and spread is shallow — a bare `...defaultPnpmWorkspaceSettings`
still clobbers `settings` wholesale. Spread both levels:

```typescript
import {
  configure,
  defaultPnpmWorkspaceSettings as base,
} from '@gtbuchanan/eslint-config';

export default configure({
  pnpmWorkspaceSettings: {
    ...base,
    settings: { ...base.settings, hoist: true },
  },
});
```

A policy with no `settings`, `requiredFields`, or `forbiddenFields`
drops the rule instead of enabling it — the rule throws when given an
empty policy, so `{}` and `false` behave the same.

## Pre-commit isolation

[pre-commit](https://pre-commit.com/) and [prek](https://prek.dev) run
hooks in an isolated environment where the project's `node_modules` is
not available — the import `'@gtbuchanan/eslint-config'` would fail
under default ESM resolution. ([hk](https://hk.jdx.dev) runs steps in
the repo with `node_modules` present, so a `pnpm exec eslint` step
needs none of the below.)

Under pre-commit/prek, use `createRequire` to bridge ESM → CJS
resolution, which respects the `NODE_PATH` the hook manager sets:

```typescript
// eslint.config.ts
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type * as EslintConfig from '@gtbuchanan/eslint-config';

interface ModuleMap {
  '@gtbuchanan/eslint-config': typeof EslintConfig;
}

const { resolve } = createRequire(import.meta.url);

async function importModule<S extends keyof ModuleMap>(
  specifier: S,
): Promise<ModuleMap[S]> {
  const { href } = pathToFileURL(resolve(specifier));
  const module: ModuleMap[S] = await import(href);
  return module;
}

const { configure } = await importModule('@gtbuchanan/eslint-config');

export default configure({
  tsconfigRootDir: import.meta.dirname,
});
```

## Bundled plugins

Enabled by `configure()`. Each is a separate concern; per-plugin rule
depth lives in that plugin's own skill (where one exists).

- **`typescript-eslint`** — `strictTypeChecked` + `stylisticTypeChecked`
- **`eslint-plugin-unicorn`** — recommended modern JS/TS rules
- **`eslint-plugin-promise`** — promise hygiene
- **`eslint-plugin-regexp`** — regex correctness and safety
- **`eslint-plugin-jsdoc`** — JSDoc/TSDoc validation
- **`@stylistic/eslint-plugin`** — JS/TS formatting (semicolons, quotes,
  spacing)
- **`eslint-plugin-format`** — Prettier formatting for JSON, Markdown,
  YAML, CSS, XML via ESLint rules. JS/TS formatting goes through
  `@stylistic` instead.
- **`@eslint-community/eslint-plugin-eslint-comments`** — suppression
  comment hygiene
- **`eslint-plugin-import-x`** — import ordering
- **`@eslint/json`** — JSON file linting
- **`eslint-plugin-pnpm`** — workspace validation (gated by the `pnpm`
  option)
- **`eslint-plugin-n`** — Node.js best practices
- **`eslint-plugin-yml`** — YAML linting + key sorting
- **`@gtbuchanan/eslint-plugin-yamllint`** — yamllint gap rules
  (truthy, octal-values, anchors, document-start/end)
- **`@eslint/markdown`** — official Markdown plugin (commonmark AST,
  recommended rule set)
- **`@gtbuchanan/eslint-plugin-markdownlint`** — Markdown structural
  linting for the rules `@eslint/markdown` doesn't cover yet
- **`@gtbuchanan/eslint-plugin-md-frontmatter`** — Markdown frontmatter
  validation via JSON Schema (ajv-backed)
- **`@gtbuchanan/eslint-plugin-agent-skills`** — Agent Skills
  frontmatter schema + spec rules; plugs into `md-frontmatter`
- **`@vitest/eslint-plugin`** — test-specific rules
- **`eslint-config-flat-gitignore`** — turns `.gitignore` into global
  ignores (gated by the `gitignore` option). A config, not a plugin — it
  contributes no rules.
- **`eslint-plugin-only-warn`** — downgrades errors to warnings (gated
  by the `onlyWarn` option)

Prettier plugins (`prettier-plugin-sort-json`,
`prettier-plugin-multiline-arrays`, `prettier-plugin-packagejson`,
`prettier-plugin-css-order`, `@prettier/plugin-xml`) are resolved as
`file://` URLs from this package's dependencies for reliable resolution
under pnpm strict hoisting.

## Conventions

- **Warnings-only in IDE, errors in CI.** `onlyWarn: true` (the default)
  surfaces every lint violation as a warning so TypeScript diagnostics
  stand out in editors. Enforcement lives elsewhere: the hk pre-commit
  step runs `eslint --max-warnings=0` on staged files, and CI's SARIF
  ratchet fails only findings new relative to the merge base. The
  `gtb task lint:eslint` command itself is a reporter — it runs ESLint
  through its programmatic API with caching (`dist/.eslintcache`),
  writes `dist/sarif/eslint.sarif`, and never fails on warnings.
- **Inline suppressions require a `--` reason suffix.** Enforced by
  `@eslint-community/eslint-plugin-eslint-comments`. Use the multiline
  format for readability:

  ```ts
  /* eslint-disable-next-line rule-name-1, rule-name-2 --
     This is my reason */
  ```

- **Prefer `eslint-disable-next-line` over `eslint-disable`.** Scope
  suppressions to the narrowest possible range.
- **All exported functions, types, interfaces, and constants must have
  JSDoc comments.** Enforced by `eslint-plugin-jsdoc`.

## Markdown lint split

Two plugins lint Markdown together:

- `@eslint/markdown` runs its `recommended` rule set (CommonMark AST).
- `@gtbuchanan/eslint-plugin-markdownlint` fills the structural gaps
  `@eslint/markdown` doesn't cover yet. Rules `@eslint/markdown`
  already enforces are disabled in the markdownlint plugin to keep
  diagnostics single-sourced. As `@eslint/markdown` adds rules upstream,
  the markdownlint counterparts retire one by one.

Suppressions use different syntax for each:

```markdown
<!-- eslint-disable-next-line markdown/no-duplicate-headings --
     intentional -->

# Duplicate heading allowed here
```

```markdown
<!-- markdownlint-disable-next-line MD036 -->

**Bold paragraph used as heading**
```

`markdownlint/lint` runs as a single ESLint rule, so per-rule control
must use markdownlint's own directive — `<!-- eslint-disable
markdownlint/lint -->` would suppress every markdownlint rule at once.

## Per-package vs. workspace-root config

Monorepos using `@gtbuchanan/cli` follow a two-tier ESLint setup:

- **Per-package `eslint.config.ts`** — calls `configure()` and lints
  source under that package. The generated `lint:eslint` task runs
  ESLint through its programmatic API with caching; cache files live
  under each package's `dist/`.
- **Root `eslint.config.ts`** — when present, `gtb sync` also generates
  a `//#lint:eslint` turbo task and a root `lint:eslint` script. The
  root script lints workspace-root files (`package.json`,
  `pnpm-workspace.yaml`, `.github/`, etc.) that per-package lint never
  sees. Per-package directories are excluded automatically via
  `--ignore-pattern` flags derived from `pnpm-workspace.yaml` package
  globs — no manual upkeep.

Single-package repos only need the root config.

---
name: gtb-eslint-config
description: ESLint configuration guidance for projects using @gtbuchanan/eslint-config. Covers the configure() API and options, pre-commit isolated-environment setup via createRequire, the bundled plugin set, suppression conventions, the two-plugin Markdown lint split, and the per-package vs. workspace-root config split. Trigger keywords - @gtbuchanan/eslint-config, eslint.config.ts, configure, ESLintConfigureOptions, eslint-disable, eslint-disable-next-line, markdownlint-disable, --max-warnings, dist/.eslintcache, lint:eslint, ESLint flat config, ESLint suppression.
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
- **`entryPoints`** — Glob patterns exempt from `process.exit` and
  hashbang restrictions (and from `no-console` in browser mode).
  Defaults to `**/bin/**/*.{js,mjs,cjs,ts,mts,cts}` and `**/scripts/**/*`.
- **`ignores`** — Global ignore patterns. Defaults to
  `.claude/worktrees/**`, `**/.turbo/**`, `**/dist/**`,
  `**/pnpm-lock.yaml`, `**/skills-lock.json`.
- **`onlyWarn`** — Downgrades all errors to warnings via
  `eslint-plugin-only-warn`. Defaults to `true`. Irreversible within
  a process — uses a side-effect import that monkey-patches the ESLint
  Linter class.
- **`pnpm`** — Enables `eslint-plugin-pnpm` rules for `package.json`
  and `pnpm-workspace.yaml`. Defaults to `true`.

## Pre-commit isolation

[pre-commit](https://pre-commit.com/) and [prek](https://prek.dev) run
hooks in an isolated environment where the project's `node_modules` is
not available — the import `'@gtbuchanan/eslint-config'` would fail
under default ESM resolution.

Use `createRequire` to bridge ESM → CJS resolution, which respects the
`NODE_PATH` the hook manager sets:

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
  stand out in editors. CI runs `eslint --max-warnings=0` to enforce
  zero violations. The `gtb task lint:eslint` command sets this flag
  along with `--cache --cache-location dist/.eslintcache`.
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
  source under that package. The generated `lint:eslint` task runs with
  `--cache --cache-location dist/.eslintcache --max-warnings=0`. Cache
  files live under each package's `dist/`.
- **Root `eslint.config.ts`** — when present, `gtb sync` also generates
  a `//#lint:eslint` turbo task and a root `lint:eslint` script. The
  root script lints workspace-root files (`package.json`,
  `pnpm-workspace.yaml`, `.github/`, etc.) that per-package lint never
  sees. Per-package directories are excluded automatically via
  `--ignore-pattern` flags derived from `pnpm-workspace.yaml` package
  globs — no manual upkeep.

Single-package repos only need the root config.

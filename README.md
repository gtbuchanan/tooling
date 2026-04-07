# @gtbuchanan/tooling

Shared build configuration monorepo for JavaScript/TypeScript projects.

## Packages

| Package                                                         | Description                          |
| --------------------------------------------------------------- | ------------------------------------ |
| [@gtbuchanan/eslint-config](packages/eslint-config)             | Shared ESLint configuration          |
| [@gtbuchanan/markdownlint-config](packages/markdownlint-config) | Shared markdownlint configuration    |
| [@gtbuchanan/oxfmt-config](packages/oxfmt-config)               | Shared oxfmt configuration           |
| [@gtbuchanan/oxlint-config](packages/oxlint-config)             | Shared oxlint configuration          |
| [@gtbuchanan/tsconfig](packages/tsconfig)                       | Shared TypeScript base configuration |
| [@gtbuchanan/vitest-config](packages/vitest-config)             | Shared Vitest configuration          |

## Reusable Workflows

All workflows are reusable via `workflow_call`. Consuming repos create
thin wrappers that delegate to this repo's workflows:

```yaml
# .github/workflows/ci.yml
on:
  pull_request:
    branches: [main]
jobs:
  ci:
    uses: gtbuchanan/tooling/.github/workflows/ci.yml@main
```

```yaml
# .github/workflows/cd.yml
on:
  push:
    branches: [main]
jobs:
  cd:
    uses: gtbuchanan/tooling/.github/workflows/cd.yml@main
```

```yaml
# .github/workflows/changeset-check.yml
on:
  pull_request:
    branches: [main]
jobs:
  changeset-check:
    uses: gtbuchanan/tooling/.github/workflows/changeset-check.yml@main
```

```yaml
# .github/workflows/pre-commit.yml
on:
  pull_request:
    branches: [main]
jobs:
  pre-commit:
    uses: gtbuchanan/tooling/.github/workflows/pre-commit.yml@main
```

```yaml
# .github/workflows/pre-commit-seed.yml
on:
  push:
    branches: [main]
jobs:
  pre-commit-seed:
    uses: gtbuchanan/tooling/.github/workflows/pre-commit-seed.yml@main
```

| Workflow              | Trigger      | Description                              |
| --------------------- | ------------ | ---------------------------------------- |
| `ci.yml`              | PR           | Build + E2E test                         |
| `cd.yml`              | Push to main | CI + changesets version + publish (OIDC) |
| `changeset-check.yml` | PR           | Verify changeset exists                  |
| `pre-commit.yml`      | PR           | Run prek hooks on changed files          |
| `pre-commit-seed.yml` | Push to main | Warm prek cache for PR builds            |

Repos customize behavior through `package.json` scripts, not workflow
inputs. Required scripts and their expected outputs:

| Script     | Used by | Expected output                                                         |
| ---------- | ------- | ----------------------------------------------------------------------- |
| `build:ci` | CI      | `packages/*/dist/source/` (publishable) and `dist/packages/*.tgz` (e2e) |
| `test:e2e` | CI      | Runs with tarballs pre-downloaded to `dist/packages/`                   |

CD requires a `release` GitHub environment with npm trusted publishing
(OIDC) configured. Consuming repos must also have `@changesets/cli` as
a devDependency.

## Development

```sh
pnpm install
pnpm build
```

### Scripts

- `pnpm check` — Compile, lint, and test (fast, use during development)
- `pnpm build` — Full pipeline including pack + e2e (slower, use before commit)
- `pnpm compile` — TypeScript compilation
- `pnpm lint` — oxlint + ESLint
- `pnpm test` — Unit tests
- `pnpm test:e2e` — E2E tests (requires `pnpm pack` first)

### Versioning

Uses [changesets](https://github.com/changesets/changesets) for per-package
versioning. Every PR requires a changeset — CI enforces this.

- `pnpm changeset` — declare which packages changed and the bump type
- `pnpm changeset --empty` — for PRs that don't need a version bump
  (CI changes, docs, etc.)

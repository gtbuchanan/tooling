# @gtbuchanan/tooling

Shared build configuration monorepo for JavaScript/TypeScript projects.

## Packages

| Package                                                         | Description                          |
| --------------------------------------------------------------- | ------------------------------------ |
| [@gtbuchanan/cli](packages/cli)                                 | Shared build CLI (`gtb`)             |
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

Each workflow follows this same pattern — only the filename and trigger
differ:

| Workflow              | Trigger      | Description                              |
| --------------------- | ------------ | ---------------------------------------- |
| `ci.yml`              | PR           | Build + e2e + optional slow tests        |
| `cd.yml`              | Push to main | CI + changesets version + publish (OIDC) |
| `changeset-check.yml` | PR           | Verify changeset exists                  |
| `pre-commit.yml`      | PR           | Run prek hooks on changed files          |
| `pre-commit-seed.yml` | Push to main | Warm prek cache for PR builds            |

Repos customize behavior through `@gtbuchanan/cli` (`gtb`) commands
invoked from `package.json` scripts. `ci.yml` also accepts workflow
inputs (`run-e2e`, `run-slow-tests`) for toggling test tiers. See the
[CLI package](packages/cli) for available commands.

### Build pipeline conventions

The `build:ci` command produces two outputs:

- `packages/*/dist/source/` — publishable contents per package
- `dist/packages/*.tgz` — tarballs for e2e tests

The pipeline:

```text
compile → lint + test:fast (concurrent) → pack
```

Per-package hooks:

- **`compile`** — Non-TS build steps (e.g., flattening tsconfig extends
  chains). Runs after `tsc -b` via `pnpm -r --if-present run compile`.
- **`generate`** — Code generation (Paraglide, Prisma, etc.). Standalone
  command for CI slow-test jobs.
- **`publishConfig.directory`** — Set to `dist/source` for packages that
  need a clean publish directory. The `pack` command generates
  `package.json` and `.npmignore` there automatically.

Any gtb step can be replaced via `gtb:<step>` scripts. See the
[CLI package](packages/cli#customizing-steps) for details.

CD requires:

- `release` GitHub environment with npm trusted publishing (OIDC)
- A GitHub App with `contents: write` and `pull-requests: write`
  permissions installed on the repo (so changeset PRs trigger checks)
- Repo variable `APP_ID` and repo secret `APP_PRIVATE_KEY` from the App
- `@changesets/cli` as a devDependency

## Development

```sh
pnpm install
pnpm run gtb build
```

### Scripts

Run commands via `pnpm run gtb <command>`:

- `pnpm run gtb check` — Compile, lint, and test:fast (use during development)
- `pnpm run gtb build` — Full pipeline: check → test:slow + pack → test:e2e
- `pnpm run gtb compile` — TypeScript compilation + per-package `compile` scripts
- `pnpm run gtb generate` — Per-package code generation (standalone)
- `pnpm run gtb lint` — oxlint + ESLint
- `pnpm run gtb test` — All source tests (fast + slow, unified coverage)
- `pnpm run gtb test:fast` — Fast source tests only
- `pnpm run gtb test:slow` — Slow source tests only (tagged `slow`)
- `pnpm run gtb test:e2e` — E2E tests (requires packed tarballs)

See the [CLI package](packages/cli) for all available commands.

### Versioning

Uses [changesets](https://github.com/changesets/changesets) for per-package
versioning. Every PR requires a changeset — CI enforces this.

- `pnpm exec changeset` — declare which packages changed and the bump type
- `pnpm exec changeset --empty` — for PRs that don't need a version bump
  (CI changes, docs, etc.)

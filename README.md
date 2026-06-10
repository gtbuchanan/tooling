# @gtbuchanan/tooling

Shared build configuration monorepo for JavaScript/TypeScript projects.

## Packages

| Package                                                                           | Description                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [@gtbuchanan/cli](packages/cli)                                                   | Shared build CLI (`gtb`)                                      |
| [@gtbuchanan/eslint-config](packages/eslint-config)                               | Shared ESLint configuration                                   |
| [@gtbuchanan/eslint-plugin-agent-skills](packages/eslint-plugin-agent-skills)     | Agent Skills schema + spec-specific rule                      |
| [@gtbuchanan/eslint-plugin-markdownlint](packages/eslint-plugin-markdownlint)     | ESLint plugin wrapping markdownlint                           |
| [@gtbuchanan/eslint-plugin-md-frontmatter](packages/eslint-plugin-md-frontmatter) | ESLint plugin validating Markdown frontmatter via JSON Schema |
| [@gtbuchanan/eslint-plugin-yamllint](packages/eslint-plugin-yamllint)             | ESLint plugin for yamllint gap rules                          |
| [@gtbuchanan/pnpm-termux-shim](packages/pnpm-termux-shim)                         | pnpm bin shim for Termux/Android (`os: ["android"]`)          |
| [@gtbuchanan/tsconfig](packages/tsconfig)                                         | Shared TypeScript base configuration                          |
| [@gtbuchanan/vitest-config](packages/vitest-config)                               | Shared Vitest configuration                                   |

## Reusable Workflows

A consuming repo copies two pipeline workflows — one per trigger —
whose jobs call this repo's single-concern reusable workflows, each
delegating with `secrets: inherit`:

```yaml
# .github/workflows/pr.yml
name: PR
on:
  pull_request:
    branches: [main]
permissions:
  contents: read
  pull-requests: write # Dependencies posts a PR comment
jobs:
  ci:
    name: CI
    uses: gtbuchanan/tooling/.github/workflows/ci.yml@main
    secrets: inherit
  changeset:
    name: Changeset
    uses: gtbuchanan/tooling/.github/workflows/changeset-check.yml@main
  dependencies:
    name: Dependencies
    uses: gtbuchanan/tooling/.github/workflows/dependency-review.yml@main
  pre-commit:
    name: Pre-Commit
    uses: gtbuchanan/tooling/.github/workflows/pre-commit.yml@main
```

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  ci:
    name: CI
    uses: gtbuchanan/tooling/.github/workflows/ci.yml@main
    secrets: inherit
  cd:
    name: CD
    needs: ci
    permissions:
      contents: write # changesets release tags/PR
      id-token: write # npm trusted publishing (OIDC)
    uses: gtbuchanan/tooling/.github/workflows/cd.yml@main
    secrets: inherit
```

The reusable workflows each job calls:

| Reusable                | Description                              |
| ----------------------- | ---------------------------------------- |
| `ci.yml`                | Build + e2e + optional slow tests        |
| `cd.yml`                | changesets version + publish (OIDC)      |
| `changeset-check.yml`   | Verify changeset exists                  |
| `dependency-review.yml` | Scan PR dep changes for vulns + licenses |
| `pre-commit.yml`        | Run hk hooks on changed files            |

Permissions narrow down the call chain but never elevate, so each
pipeline grants the superset its jobs need (shown above). Required
status checks key on the leaf job name (`Build`, `E2E Test`,
`Dependency Review`, …), so the pipeline job names (`CI`, `CD`,
`Dependencies`) are just grouping.

### Coverage

CI automatically uploads coverage to [Codecov](https://codecov.io) via
a per-package turbo task. The workflow installs the
[Codecov CLI](https://docs.codecov.com/docs/codecov-cli) and runs
`coverage:codecov:upload` per package. Turbo caches uploads based on
coverage content — unchanged packages are skipped and Codecov carries
forward their last known data.

Add a `CODECOV_TOKEN` repository secret; `secrets: inherit` on the `CI`
job (shown in the pipelines above) forwards it. To pass it explicitly
instead:

```yaml
jobs:
  ci:
    uses: gtbuchanan/tooling/.github/workflows/ci.yml@main
    secrets:
      CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
```

To customize coverage targets, add a `codecov.yml` to your repo root.

**Drift risk:** The Codecov job uses `continue-on-error` so upload
failures never block PRs, and `gtb sync` forces
`codecov.require_ci_to_pass: false` so Codecov's status and PR comment —
informational here, never a merge gate — still post when an unrelated
check fails (e.g. a missing changeset) instead of being withheld. Flags
use `carryforward: true` because
Codecov treats missing flags as 0% coverage, which would cause false
failures on PRs that only touch a subset of packages. The tradeoff is
that a failed upload carries forward stale data. In practice this
self-corrects: `release.yml` re-runs CI on merge to main, uploading
fresh coverage. Drift only persists if that upload also fails — re-run
the Release workflow to correct it.

Repos customize behavior through Turborepo task graphs generated by
`gtb sync`. Per-package scripts delegate to `gtb task <name>` leaves,
and consumers can replace script values to customize individual tools.
`ci.yml` accepts inputs like `run-e2e` and `run-slow-tests` (pass via
`with:` on the `CI` job) to toggle test tiers. See the
[CLI package](packages/cli) for available commands.

### Dependency review

`dependency-review.yml` runs two PR-time gates on newly-changed
dependencies:

- **Review** —
  [`actions/dependency-review-action`](https://github.com/actions/dependency-review-action)
  fails on advisories at `moderate` severity or higher and on
  non-permissive licenses per this repo's shared policy
  (`.github/dependency-review-config.yml`). Consumer wrappers inherit
  the shared policy automatically — the `config-file` input defaults
  to a remote ref pointing at this repo's config.
- **Version check** — fails if any newly-added dep isn't at its
  latest version. Resolves the change set via GitHub's
  dependency-graph compare API; looks up latest versions via deps.dev
  (npm, pip, maven, nuget, rubygems, go, cargo) and GitHub Releases
  (Actions). SHA-pinned Actions are accepted as intentional.

Both jobs require GitHub's Dependency Graph to be enabled at
_Settings → Code security and analysis_. Coverage is limited to
ecosystems the dep graph indexes — for JS/TS projects, that's npm and
GitHub Actions. mise tools and `hk.pkl` steps aren't covered;
Renovate's managers handle those independently on their normal
cadence.

A failure summary is posted as a PR comment, so the PR pipeline must
grant `pull-requests: write` (shown in the setup above).

Override defaults — e.g. a repo-local license policy or a stricter
severity threshold — via `with:` on the `Dependencies` job:

```yaml
jobs:
  dependencies:
    name: Dependencies
    uses: gtbuchanan/tooling/.github/workflows/dependency-review.yml@main
    with:
      config-file: .github/dependency-review-config.yml
      fail-on-severity: low
```

### Build pipeline conventions

Turborepo manages task orchestration. The task graph is defined in
`turbo.json` (generated by `gtb sync`) and declares dependencies
between leaf tasks:

```text
typecheck:ts ─┬─ lint:eslint ── lint ──┐
              └─ test:vitest:fast ─────┤ check ─┬─ compile:ts → pack
                                       │        ├─ test:vitest:slow
                                       │        └─ test:vitest:e2e
                                       └────────────────── build
```

Turbo resolves the graph, caches results, and runs tasks in parallel
where dependencies allow.

The `build:ci` task produces two outputs:

- `packages/*/dist/source/` — publishable contents per package
- `dist/packages/*.tgz` — tarballs for e2e tests

Consumer customization:

- Consumers replace the **values** of generated `package.json` scripts to
  override individual tools. There is no hook system — `gtb sync`
  generates the scripts, and consumers edit them directly.
- **`publishConfig.directory`** — Set to `dist/source` for packages that
  need a clean publish directory. The `pack` command generates
  `package.json` and `.npmignore` there automatically.

The `CD` job (`cd.yml`) requires:

- `release` GitHub environment with npm trusted publishing (OIDC)
- A GitHub App with `contents: write` and `pull-requests: write`
  permissions installed on the repo (so changeset PRs trigger checks)
- Repo variable `APP_ID` and repo secret `APP_PRIVATE_KEY` from the App
- `@changesets/cli` as a devDependency

## Renovate preset

The repo publishes a shareable Renovate config as `default.json`.
Extend it from a consuming repo's Renovate config
(e.g., `.github/renovate.json`):

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>gtbuchanan/tooling"]
}
```

This pulls in `config:recommended` plus a small set of repo-wide
opinions: 3-day release-age quarantine, OSV vulnerability alerts,
`pnpm dedupe` after updates, verified-commit platform API, pre-commit
manager enabled, and `America/Chicago` timezone for the weekly
lockfile maintenance schedule.

## Consumer setup

Run `gtb sync` to generate `turbo.json`, tsconfigs, per-package scripts,
`codecov.yml`, and (in repos using mise) `mise.tasks.toml` from project
discovery. Use `--force` to overwrite existing scripts, or pass scope
args (e.g. `gtb sync mise`) to limit it. Run `gtb verify` to check
generated config hasn't drifted.

See the [CLI package](packages/cli) for all available commands.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, scripts,
and versioning workflow.

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
| [@gtbuchanan/hk-config](packages/hk-config)                                       | Shared hk pre-commit preset (Pkl, GitHub-release published)   |
| [@gtbuchanan/libsql-termux-shim](packages/libsql-termux-shim)                     | libsql binding shim for Termux/Android (`os: ["android"]`)    |
| [@gtbuchanan/pnpm-termux-shim](packages/pnpm-termux-shim)                         | pnpm bin shim for Termux/Android (`os: ["android"]`)          |
| [@gtbuchanan/tsconfig](packages/tsconfig)                                         | Shared TypeScript base configuration                          |
| [@gtbuchanan/vitest-config](packages/vitest-config)                               | Shared Vitest configuration                                   |

## Reusable Workflows

A consuming repo copies two pipeline workflows — one per trigger —
whose jobs call this repo's single-concern reusable workflows. Each call
passes only the secrets its workflow reads: `CODECOV_TOKEN` to CI, and
`APP_PRIVATE_KEY` to CD. The key lives in the `release` environment, so
the caller's value is empty, but a called workflow sees only the names
its caller passes, and CD's jobs read the value from the environment. Replace `<tag>` with a workflows
release tag (`v<version>`) rather than `main`: the
[Renovate preset](#renovate-preset) pins it to a commit and bumps it
once per release, where a `@main` ref would be bumped on every commit to
this repo:

```yaml
# .github/workflows/pr.yml
name: PR
concurrency:
  cancel-in-progress: true # a push supersedes the PR's earlier runs
  group: ${{ github.workflow }}-caller-${{ github.event.pull_request.number }}
on:
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  ci:
    name: CI
    uses: gtbuchanan/tooling/.github/workflows/ci.yml@<tag>
    secrets:
      CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
  changeset:
    name: Changeset
    uses: gtbuchanan/tooling/.github/workflows/changeset-check.yml@<tag>
  dependencies:
    name: Dependencies
    permissions:
      contents: read
      pull-requests: write # Dependency Review posts a PR comment
    uses: gtbuchanan/tooling/.github/workflows/dependency-review.yml@<tag>
  pre-commit:
    name: Pre-Commit
    uses: gtbuchanan/tooling/.github/workflows/pre-commit.yml@<tag>
```

```yaml
# .github/workflows/release.yml
name: Release
concurrency:
  cancel-in-progress: false # queue; never cancel CD mid-publish
  group: ${{ github.workflow }}-caller-${{ github.ref }}
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  ci:
    name: CI
    uses: gtbuchanan/tooling/.github/workflows/ci.yml@<tag>
    secrets:
      CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
  cd:
    name: CD
    needs: ci
    permissions:
      contents: read # checkout; every write goes through the App token
      id-token: write # npm trusted publishing (OIDC)
    uses: gtbuchanan/tooling/.github/workflows/cd.yml@<tag>
    secrets:
      APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }} # resolved from the release environment
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
`coverage:codecov:upload` per package. The task is uncached, so every
package uploads on every commit — that is what keeps Codecov's commit
statuses dependable enough to require in branch protection.

Add a `CODECOV_TOKEN` repository secret; the `CI` job (shown in the
pipelines above) passes it to `ci.yml`.

Each upload names its flag after the package's unscoped
`package.json` name (`@acme/utils` → `utils`). Codecov compares a flag
against its own history across commits, so the name has to mean the
same thing in every checkout — which rules out the directory basename,
since worktrees and clones rename it.

`codecov.yml` lists no flags. Per-package rules live in
`flag_management.default_rules`, which Codecov applies to whatever
flags it ingests, so adding a package needs no config change. Copy
this repo's `codecov.yml` as a starting point and edit the targets.

Two repo-wide checks come back from Codecov: `codecov/project`
(the whole report against itself, `auto` target with a 1% threshold)
and `codecov/patch` (lines the PR changed, 80% target). Neither names
a flag, so both cover every package under one context and both report
on any commit that uploads — which is what makes them safe to list as
required status checks. `flag_management` defines no per-flag statuses:
twelve more checks per commit would bury the packages that moved, and
the set would shift as packages come and go, so no such check could be
a stable requirement. Per-package numbers live in the Codecov comment
and the Flags tab.

**Drift risk:** A failed upload fails the `Codecov Upload` job, and
`require_ci_to_pass: false` keeps Codecov's status and comment posting
when an unrelated check fails.
`carryforward: true` holds a package's last known coverage on the run
that skips an upload anyway; without it Codecov reads the missing flag
as 0%. The cost is that Codecov cannot tell coverage it carried forward
from coverage that never arrived, so a failed upload reports stale data
until a later run replaces it. `release.yml` re-runs CI on merge to
main, which corrects a one-off failure.

Requiring these checks is a repository setting, not something `gtb
sync` writes — add `codecov/project` and `codecov/patch` to the branch
ruleset yourself.

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

A failure summary is posted as a PR comment, so the `Dependencies` job
must grant `pull-requests: write`, along with `contents: read` (shown in
the setup above).

Override defaults — e.g. a repo-local license policy or a stricter
severity threshold — via `with:` on the `Dependencies` job:

```yaml
jobs:
  dependencies:
    name: Dependencies
    permissions:
      contents: read
      pull-requests: write # Dependency Review posts a PR comment
    uses: gtbuchanan/tooling/.github/workflows/dependency-review.yml@<tag>
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

- `release` GitHub environment with npm trusted publishing (OIDC),
  limited to the default branch by a deployment branch policy
- A GitHub App with `contents: write`, `pull-requests: write` and
  `workflows: write` permissions installed on the repo (so changeset PRs
  trigger checks). Each job's token is narrowed to the permissions that
  job needs, and both ask for `workflows: write` in every repo
- Repo variable `APP_ID`, and `APP_PRIVATE_KEY` from the App as a secret
  of the `release` environment, so pull request runs can't read it
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
opinions: GitHub Actions pinned by commit with the version in a comment
(`owner/repo@<sha> # v1.2.3`), 3-day release-age quarantine, OSV vulnerability alerts,
`pnpm dedupe` after updates, verified-commit platform API, pre-commit
manager enabled, and `America/Chicago` timezone for the weekly
lockfile maintenance schedule.

## Consumer setup

Run `gtb sync` to generate `turbo.json`, tsconfigs, per-package scripts,
`codecov.yml`, and (in repos using mise) `mise.tasks.toml` from project
discovery. Use `--force` to overwrite existing scripts, or pass scope
args (e.g. `gtb sync turbo`) to limit it. Run `gtb verify` to check
generated config hasn't drifted.

See the [CLI package](packages/cli) for all available commands.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, scripts,
and versioning workflow.

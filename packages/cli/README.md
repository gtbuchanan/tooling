# @gtbuchanan/cli

Shared build CLI for JavaScript/TypeScript projects. Provides the `gtb`
binary: user-invoked commands (`verify`, `sync`, `turbo`, `prepare`)
at the root, and leaf tool wrappers under `gtb task <name>` for
Turborepo to call via generated `package.json` scripts.

## Install

```sh
pnpm add -D @gtbuchanan/cli
```

## Usage

After installing, generate your `turbo.json` and per-package scripts:

```sh
pnpm exec gtb sync
```

This reconciles `turbo.json`, tsconfigs, `package.json` scripts, and
`codecov.yml` with the current workspace. Re-run after adding packages
or changing capabilities.

Run the pipeline via the `gtb turbo` wrapper (generated root scripts
delegate to it so its PATH normalization applies everywhere):

```sh
pnpm exec gtb turbo run check   # compile → lint + test:fast (parallel)
pnpm exec gtb turbo run build   # full pipeline
pnpm exec gtb turbo run test:fast
```

Monorepos also get `pnpm check` / `pnpm build` aliases for these. A
single-package repo (where the root _is_ the package) gets none: a root
script named after an aggregate makes turbo re-enter itself, so the
`gtb turbo run` form above is the entry point there.

`gtb turbo` runs `turbo` with one adjustment: every PATH entry is
rewritten to an absolute path first. Turbo resolves the package manager
binary against PATH from the directory it was invoked in, keeps the path
that search produced, then runs each task with that package's directory
as the cwd. A match from a relative entry is therefore a relative
program path, re-interpreted against the child's directory — so turbo
reports `unable to spawn child process` instead of falling through to a
later absolute entry. pnpm always prepends a relative
`./node_modules/.bin`, so any bin named after the package manager that
lives there is affected.

That is the layout on Termux/Android, where
[`@gtbuchanan/pnpm-termux-shim`](../pnpm-termux-shim) supplies a working
`pnpm`. Add the shim to your **workspace root** `package.json`
`optionalDependencies` (not inside any individual package — under pnpm
strict layout, only the root's `node_modules/.bin/` is on turbo's PATH
at spawn time):

```jsonc
{
  "optionalDependencies": {
    "@gtbuchanan/pnpm-termux-shim": "^0.1.1",
  },
}
```

The shim's `os: ["android"]` filter keeps it off non-Android hosts,
where nothing named `pnpm` occupies `node_modules/.bin` and the
normalization is a no-op.

Turbo runs natively on Termux as of
[vercel/turborepo#12735](https://github.com/vercel/turborepo/pull/12735)
(turbo 2.10.8), which ships the `linux-arm64` binary under
`os: ["android", "linux"]`. Earlier versions require the Termux-packaged
turbo (`pkg install turbo`) instead — the npm launcher refuses to start
on Android and pnpm installs no platform binary.

The `prepare` script must be declared so pnpm runs it on install to
sync skills from installed packages:

```json
{
  "scripts": {
    "prepare": "gtb prepare"
  }
}
```

Use `verify` in CI to detect drift between the generated config and
the current workspace state:

```sh
pnpm exec gtb verify
```

## Commands

Root commands are user-invoked. `task <name>` dispatches to a single
leaf tool and forwards extra arguments; Turborepo invokes leaves through
generated `package.json` scripts (`"typecheck:ts": "gtb task typecheck:ts"`).

### Root commands

| Command   | Purpose                                                 |
| --------- | ------------------------------------------------------- |
| `verify`  | Validate generated config against workspace state       |
| `sync`    | Reconcile `turbo.json`, tsconfigs, scripts, codecov.yml |
| `turbo`   | Run turbo with cwd-independent PATH entries             |
| `prepare` | Sync skills from installed packages                     |

### Task leaves (`gtb task <name>`)

| Name                      | Tool                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `compile:skills`          | Copy `skills/` into `dist/source/skills/`                                                    |
| `compile:ts`              | `tsc -p tsconfig.build.json`                                                                 |
| `coverage:codecov:upload` | Upload lcov to Codecov (requires [`codecov` CLI](https://docs.codecov.com/docs/codecov-cli)) |
| `coverage:vitest:merge`   | `vitest --merge-reports` (fast + slow)                                                       |
| `deploy:skills`           | Symlink skills into project-local agent dirs via `skills add`                                |
| `typecheck:ts`            | `tsc --noEmit`                                                                               |
| `lint:eslint`             | `eslint --max-warnings=0`                                                                    |
| `pack:npm`                | Generate manifest + `pnpm pack` (per-pkg)                                                    |
| `test:vitest`             | `vitest run`                                                                                 |
| `test:vitest:fast`        | `vitest run --tags-filter='!slow'`                                                           |
| `test:vitest:slow`        | `vitest run --tags-filter=slow`                                                              |
| `test:vitest:e2e`         | `vitest run --config vitest.config.e2e.ts`                                                   |

Leaves forward extra arguments to the underlying tool:

```sh
gtb task test:vitest --reporter=verbose
gtb task test:vitest --tags-filter='!slow && !db'
gtb task lint:eslint --fix
gtb sync --force              # overwrite existing scripts
```

## Test tags

`test:vitest:fast` and `test:vitest:slow` use Vitest's `--tags-filter`
to split tests by the `slow` tag. See
[@gtbuchanan/vitest-config](../vitest-config/README.md#test-tags)
for how to tag tests and configure custom tags.

`gtb` commands are non-interactive (run-once). For watch mode and the
Vitest UI, run vitest directly:

```sh
pnpm exec vitest --ui --coverage.reporter=html
pnpm exec vitest --watch --tags-filter='!slow'
```

## Design

### Why a custom CLI alongside Turborepo?

Turborepo orchestrates scripts that each repo defines — consumers still
specify _what_ `lint` or `compile` means in every repo. `gtb` centralizes
those definitions so consumers inherit them by installing one package.
This is closer to what `react-scripts` does for Create React App.

Turborepo provides the orchestration layer (caching, dependency graphs,
incremental builds, parallel execution). `gtb` provides the tool
definitions layer (what each command runs, with what flags). The two are
complementary: `sync` generates the `turbo.json` pipeline and
`package.json` scripts that delegate to `gtb task <name>` leaves.

## Code generation

Projects that use code generation (Paraglide, Prisma, protobuf, etc.)
should define `generate:<tool>` scripts in their `package.json`:

```json
{
  "scripts": {
    "generate:prisma": "prisma generate",
    "generate:paraglide": "paraglide-js compile"
  }
}
```

`sync` discovers these scripts and wires them into the pipeline
automatically. The `generate` aggregate runs before `typecheck:ts`,
`compile:ts`, and all lint tasks, so generated code is always available
when those steps execute.

**Prefer standalone generation over build plugins.** Embedding generation
in a build plugin (e.g., Vite Paraglide plugin) breaks Turborepo's cache
granularity — the generation step can't be cached independently, and
typecheck can't run until the full build completes. Standalone
`generate:<tool>` scripts have explicit inputs and outputs that Turborepo
caches individually.

Define inputs and outputs in a per-package `turbo.json`:

```json
{
  "extends": ["//"],
  "tasks": {
    "generate:prisma": {
      "inputs": ["prisma/schema.prisma"],
      "outputs": ["src/generated/**"]
    }
  }
}
```

## Agent Skills

`gtb` ships opt-in support for
[Agent Skills](https://agentskills.io/specification).

### Consuming skills from installed packages

Add `skills-npm` as a devDep:

```sh
pnpm add -D skills-npm
```

`gtb prepare` invokes `skills-npm --recursive --yes` on every `pnpm
install`, symlinking skills from every installed package into the
directories of the coding agents detected on your machine. Silently
skipped if `skills-npm` isn't installed. See
[`skills-npm`](https://github.com/antfu/skills-npm) for a
`skills-npm.config.ts` if you need to pin specific agents or filter
which packages get scanned.

### Authoring skills in your packages

Place `SKILL.md` files under `packages/<pkg>/skills/<name>/` with the
required frontmatter (`name`, `description`). Pick a globally unique
name — prefix with your scope (e.g. `acme-foo`) to avoid collision
with other published packages.

Run `gtb sync`. Packages with a `skills/` directory gain:

- `compile:skills` — copies `skills/` into `dist/source/skills/` before
  `pack:npm`, shipping them to consumers via the published tarball
- `deploy:skills` — symlinks skills into project-local agent directories
  (`./.claude/skills/`, `./.codex/skills/`, etc.) for dogfooding;
  requires `skills` (Vercel Labs) as a devDep:

```sh
pnpm add -D skills
pnpm deploy:skills
```

## Workspace detection

`pack` supports both monorepo and single-package layouts:

- **Monorepo** — Detected via `pnpm-workspace.yaml` with a non-empty
  `packages` field. Iterates over all resolved package directories.
- **Single-package** — Fallback when no workspace file or packages are
  found. Operates on the current working directory.

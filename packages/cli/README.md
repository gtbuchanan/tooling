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
delegate to it so Android/Termux users get a transparent escape hatch):

```sh
pnpm exec gtb turbo run check   # compile → lint + test:fast (parallel)
pnpm exec gtb turbo run build   # full pipeline
pnpm exec gtb turbo run test:fast
```

`gtb turbo` is a thin pass-through to `turbo` on every supported
platform. On Android, `process.platform === 'android'` causes the
node_modules launcher to refuse to start; the wrapper resolves the
native turbo from Termux's package registry and execs it directly.
Install it once per Termux environment:

```sh
pkg install turbo
```

That puts a Bionic-built `turbo` at `$PREFIX/bin/turbo` (typically
`/data/data/com.termux/files/usr/bin/turbo`), which `gtb turbo`
resolves and execs.

The Termux-pkg turbo is Bionic-built, so its child-process spawns
honor Termux's `LD_PRELOAD` shebang rewriter and resolve
`#!/usr/bin/env <name>` correctly.
[`@gtbuchanan/pnpm-termux-shim`](../pnpm-termux-shim) is retained
defensively in case turbo reintroduces a glibc npm distribution, or
another glibc binary in the graph needs to spawn `pnpm`. Add it to
your **workspace root** `package.json` `optionalDependencies` (not
inside any individual package — under pnpm strict layout, only the
root's `node_modules/.bin/` is on turbo's PATH at spawn time). The
shim's `os: ["android"]` filter keeps it off non-Android hosts.

The `prepare` script must be declared so pnpm runs it on install to set
up pre-commit hooks via prek:

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
| `turbo`   | Run turbo (with an Android escape hatch)                |
| `prepare` | Install pre-commit hooks via prek                       |

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

# @gtbuchanan/cli

Shared build CLI for JavaScript/TypeScript projects. Provides the `gtb`
binary that orchestrates compile, lint, test, pack, and publish workflows.

## Install

```sh
pnpm add -D @gtbuchanan/cli
```

## Usage

Run commands directly via `pnpm exec gtb <command>` — no `package.json`
scripts required. The CI workflows detect `gtb` automatically.

The `prepare` script is the one exception — it must be declared so pnpm
runs it on install to set up pre-commit hooks via prek:

```json
{
  "scripts": {
    "prepare": "gtb prepare"
  }
}
```

Other script aliases are optional convenience shortcuts:

```json
{
  "scripts": {
    "build": "gtb build",
    "check": "gtb check",
    "lint": "gtb lint",
    "test": "gtb test"
  }
}
```

## Commands

Commands are split into two tiers:

- **Composed commands** orchestrate the build pipeline. They don't
  forward extra arguments — their behavior is fixed so that adding
  new toolchains (e.g., C#) later doesn't break consumers.
- **Leaf commands** target a single tool and forward extra arguments.

### Composed

| Command     | Description                                          |
| ----------- | ---------------------------------------------------- |
| `build`     | Full pipeline: check → test:slow + pack → test:e2e   |
| `build:ci`  | CI pipeline: check → pack (slow/e2e are separate CI) |
| `check`     | Fast dev check: compile → lint + test:fast           |
| `compile`   | All compilation steps (currently `tsc -b`)           |
| `generate`  | Per-package code generation (standalone)             |
| `lint`      | All linters in parallel                              |
| `pack`      | Generate manifests + `pnpm pack` each package        |
| `test`      | All source tests (unified coverage)                  |
| `test:fast` | Source tests excluding tests tagged `slow`           |
| `test:slow` | Source tests tagged `slow` only                      |
| `test:e2e`  | E2e tests (requires packed tarballs)                 |

### Leaf

| Command            | Tool                                       |
| ------------------ | ------------------------------------------ |
| `compile:ts`       | `tsc -b`                                   |
| `lint:eslint`      | `eslint --max-warnings=0`                  |
| `lint:oxlint`      | `oxlint`                                   |
| `generate`         | `pnpm -r --if-present run generate`        |
| `prepare`          | `prek install`                             |
| `test:vitest`      | `vitest run`                               |
| `test:vitest:fast` | `vitest run --tags-filter='!slow'`         |
| `test:vitest:slow` | `vitest run --tags-filter=slow`            |
| `test:vitest:e2e`  | `vitest run --config vitest.config.e2e.ts` |

Leaf commands forward extra arguments:

```sh
gtb test:vitest --reporter=verbose
gtb test:vitest --tags-filter='!slow && !db'
gtb lint:eslint --fix
```

## Customizing steps

Any gtb step can be replaced by defining a `gtb:<step>` script in the
root `package.json`. When a step runs, gtb checks for a matching hook
and delegates to `pnpm run gtb:<step>` instead of the default.

```json
{
  "scripts": {
    "build": "gtb build",
    "gtb:compile:ts": "vue-tsc -b",
    "gtb:lint:eslint": "my-custom-lint"
  }
}
```

Hooks apply at every level — both top-level commands and sub-steps
within composed commands. For example, `gtb:compile:ts` replaces just
the type-checker without affecting per-package `compile` scripts, while
`gtb:compile` replaces the entire compile step.

Hooking a composed command (e.g., `gtb:check`) replaces it everywhere
— both standalone and when called from `build`.

## Generate

`gtb generate` runs per-package `generate` scripts via
`pnpm -r --if-present run generate`. Use it for code generation that
slow tests need without a full compile (Paraglide, Prisma, etc.).

`generate` is a standalone command — not part of `build` or `build:ci`
pipelines. In the `build` pipeline, `compile` handles code generation
(e.g., Vite with Paraglide plugin). For isolated CI slow-test jobs,
run `gtb generate` before `gtb test:slow`.

## Test tags

`test:fast` and `test:slow` use Vitest's `--tags-filter` to split tests
by the `slow` tag. See
[@gtbuchanan/vitest-config](../vitest-config/README.md#test-tags)
for how to tag tests and configure custom tags.

`gtb` commands are non-interactive (run-once). For watch mode and the
Vitest UI, run vitest directly:

```sh
pnpm exec vitest --ui --coverage.reporter=html
pnpm exec vitest --watch --tags-filter='!slow'
```

## Design

### Why a custom CLI instead of Turborepo / Nx / Gulp?

Those tools orchestrate scripts that each repo defines — consumers still
specify _what_ `lint` or `compile` means in every repo. `gtb` centralizes
those definitions so consumers inherit them by installing one package.
This is closer to what `react-scripts` does for Create React App.

The overlap is in the orchestration layer (parallel groups, sequential
pipelines). Turborepo/Nx do that better — with caching, dependency
graphs, and incremental builds. But they don't replace the "install
one package, get all build commands" value.

The two approaches are complementary: `gtb` could use Turborepo or Nx
internally for orchestration without changing the consumer-facing surface.
Consumers would still run `gtb build` and never know the difference.

### Composed vs leaf command split

Composed commands (`compile`, `lint`, `test`, etc.) don't forward
arguments because they may dispatch to multiple toolchains in the
future. For example, if a repo adds C# alongside TypeScript, `compile`
would run both `tsc -b` and `dotnet build` — pass-through args would
be ambiguous.

Leaf commands (`compile:ts`, `lint:eslint`, `test:vitest`, etc.) target
a single tool and forward all extra arguments. This split ensures
consumers can always reach tool-specific flags without the composed
commands needing to know about them.

## Workspace detection

`pack` supports both monorepo and single-package layouts:

- **Monorepo** — Detected via `pnpm-workspace.yaml` with a non-empty
  `packages` field. Iterates over all resolved package directories.
- **Single-package** — Fallback when no workspace file or packages are
  found. Operates on the current working directory.

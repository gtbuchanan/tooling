# @gtbuchanan/cli

Shared build CLI for JavaScript/TypeScript projects. Provides the `gtb`
binary with leaf commands that wrap individual tools and Turborepo
integration for pipeline orchestration.

## Install

```sh
pnpm add -D @gtbuchanan/cli
```

## Usage

After installing, generate your `turbo.json` and per-package scripts:

```sh
pnpm exec gtb turbo:init
```

This scaffolds `turbo.json` task definitions and adds the necessary
`package.json` scripts so Turborepo can orchestrate the pipeline. Re-run
after adding packages or changing capabilities.

Run the pipeline via Turborepo:

```sh
turbo run check       # compile → lint + test:fast (parallel)
turbo run build       # full pipeline
turbo run test:fast   # fast source tests only
```

The `prepare` script must be declared so pnpm runs it on install to set
up pre-commit hooks via prek:

```json
{
  "scripts": {
    "prepare": "gtb prepare"
  }
}
```

Use `turbo:check` in CI to detect drift between the generated config and
the current workspace state:

```sh
pnpm exec gtb turbo:check
```

## Commands

All commands are leaf commands — they target a single tool and forward
extra arguments. Turborepo handles orchestration (parallel groups,
sequential pipelines, caching, dependency graphs).

| Command            | Tool                                       |
| ------------------ | ------------------------------------------ |
| `compile:ts`       | `tsc -p tsconfig.build.json`               |
| `typecheck:ts`     | `tsc --noEmit`                             |
| `lint:eslint`      | `eslint --max-warnings=0`                  |
| `lint:oxlint`      | `oxlint`                                   |
| `pack`             | Generate manifests + `pnpm pack`           |
| `prepare`          | `prek install`                             |
| `test:vitest`      | `vitest run`                               |
| `test:vitest:fast` | `vitest run --tags-filter='!slow'`         |
| `test:vitest:slow` | `vitest run --tags-filter=slow`            |
| `test:vitest:e2e`  | `vitest run --config vitest.config.e2e.ts` |
| `turbo:init`       | Scaffold `turbo.json` and package scripts  |
| `turbo:check`      | Validate config against workspace state    |

Leaf commands forward extra arguments:

```sh
gtb test:vitest --reporter=verbose
gtb test:vitest --tags-filter='!slow && !db'
gtb lint:eslint --fix
gtb turbo:init --force   # overwrite existing scripts
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
complementary: `turbo:init` generates the `turbo.json` pipeline and
`package.json` scripts that delegate to `gtb` leaf commands.

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

`turbo:init` discovers these scripts and wires them into the pipeline
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

## Workspace detection

`pack` supports both monorepo and single-package layouts:

- **Monorepo** — Detected via `pnpm-workspace.yaml` with a non-empty
  `packages` field. Iterates over all resolved package directories.
- **Single-package** — Fallback when no workspace file or packages are
  found. Operates on the current working directory.

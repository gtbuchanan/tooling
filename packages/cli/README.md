# @gtbuchanan/cli

Shared build CLI for JavaScript/TypeScript projects. Provides the `gtb`
binary that orchestrates compile, lint, test, pack, and publish workflows.

## Install

```sh
pnpm add -D @gtbuchanan/cli
```

## Usage

Add scripts to your `package.json` that delegate to `gtb`:

```json
{
  "scripts": {
    "prepare": "gtb prepare",
    "build": "gtb build",
    "build:ci": "gtb build:ci",
    "check": "gtb check",
    "compile": "gtb compile",
    "lint": "gtb lint",
    "test": "gtb test",
    "test:e2e": "gtb test:e2e"
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

| Command    | Description                                    |
| ---------- | ---------------------------------------------- |
| `build`    | Full pipeline: compile, lint+test, pack, e2e   |
| `build:ci` | CI pipeline: compile, lint+test, pack (no e2e) |
| `check`    | Fast dev check: compile, lint+test (no pack)   |
| `compile`  | All compilation steps (currently `tsc -b`)     |
| `lint`     | All linters in parallel                        |
| `pack`     | Prepack + `pnpm pack` each publishable package |
| `prepack`  | Generate `dist/source/` manifests              |
| `test`     | All unit test runners                          |
| `test:e2e` | All e2e test runners                           |

### Leaf

| Command           | Tool                                       |
| ----------------- | ------------------------------------------ |
| `compile:ts`      | `tsc -b`                                   |
| `lint:eslint`     | `eslint --max-warnings=0`                  |
| `lint:oxlint`     | `oxlint`                                   |
| `prepare`         | `prek install`                             |
| `test:vitest`     | `vitest run`                               |
| `test:vitest:e2e` | `vitest run --config vitest.config.e2e.ts` |

Leaf commands forward extra arguments:

```sh
gtb test:vitest --reporter=verbose
gtb lint:eslint --fix
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

`pack` and `prepack` support both monorepo and single-package layouts:

- **Monorepo** — Detected via `pnpm-workspace.yaml` with a non-empty
  `packages` field. Iterates over all resolved package directories.
- **Single-package** — Fallback when no workspace file or packages are
  found. Operates on the current working directory.

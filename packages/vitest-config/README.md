# @gtbuchanan/vitest-config

Shared Vitest configuration for unit and end-to-end tests, with API layers for
different project structures.

## Install

```sh
pnpm add -D @gtbuchanan/vitest-config vitest @vitest/coverage-v8
```

## Usage

### Single-project

```typescript
// vitest.config.ts
import { configure } from '@gtbuchanan/vitest-config/configure';
import { defineConfig } from 'vitest/config';

export default defineConfig(configure());
```

```typescript
// vitest.config.e2e.ts
import { configureEndToEnd } from '@gtbuchanan/vitest-config/configure-e2e';
import { defineConfig } from 'vitest/config';

export default defineConfig(configureEndToEnd({ testTimeout: 60_000 }));
```

### Monorepo — root config only

The `projects` option resolves glob patterns to directories and generates
inline project entries automatically. No per-package vitest configs needed.

```typescript
// vitest.config.ts
import { configureGlobal } from '@gtbuchanan/vitest-config/configure';

export default configureGlobal({ projects: ['packages/*'] });
```

```typescript
// vitest.config.e2e.ts
import { configureEndToEndGlobal } from '@gtbuchanan/vitest-config/configure-e2e';

export default configureEndToEndGlobal({ projects: ['packages/*'] });
```

### Monorepo — per-package configs

If any package needs custom settings, add a `vitest.config.ts` in that package
directory. Directories with their own config are included as-is when using the
`projects` option; directories without one get an auto-generated inline config.

Alternatively, omit the `projects` option and manage project entries manually:

```typescript
// vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config';
import { configureGlobal } from '@gtbuchanan/vitest-config/configure';

export default mergeConfig(
  configureGlobal(),
  defineConfig({
    test: {
      projects: ['packages/*'],
    },
  }),
);
```

```typescript
// packages/my-lib/vitest.config.ts
import { configureProject } from '@gtbuchanan/vitest-config/configure';
import { defineProject } from 'vitest/config';

export default defineProject(configureProject(import.meta.dirname));
```

The same pattern applies to e2e with `configureEndToEndGlobal` and
`configureEndToEndProject`:

```typescript
// vitest.config.e2e.ts
import { defineConfig, mergeConfig } from 'vitest/config';
import { configureEndToEndGlobal } from '@gtbuchanan/vitest-config/configure-e2e';

export default mergeConfig(
  configureEndToEndGlobal(),
  defineConfig({
    test: {
      projects: ['packages/*'],
    },
  }),
);
```

```typescript
// packages/my-lib/vitest.config.e2e.ts
import { configureEndToEndProject } from '@gtbuchanan/vitest-config/configure-e2e';
import { defineProject } from 'vitest/config';

export default defineProject(configureEndToEndProject(import.meta.dirname));
```

## API

### Unit test configuration (`configure`)

- `configure(options?)` — Combined config for single-project consumers.
  Includes alias, coverage, setupFiles, and test settings.
- `configureGlobal(options?)` — Global-only settings for monorepo root:
  coverage, setupFiles, mockReset, unstubEnvs. Pass `projects` to
  auto-discover packages.
- `configureProject(root?)` — Per-project settings: `@` alias to `src/`,
  test includes (`test/**/*.test.ts`). Only needed when a package overrides
  the auto-generated config.

### End-to-end configuration (`configure-e2e`)

- `configureEndToEnd(options?)` — Combined e2e config for single-project
  consumers. Includes alias, coverage (to `dist/coverage-e2e`), testTimeout,
  and test settings.
- `configureEndToEndGlobal(options?)` — Global e2e settings for monorepo
  root. Pass `projects` to auto-discover packages.
- `configureEndToEndProject(root?)` — Per-project e2e settings: `@` alias
  to `src/`, e2e includes (`e2e/**/*.test.ts`).

### Shared utilities

- `buildWorkspaceEntry(dir, configureFn)` — Builds an inline project entry
  from a directory and config factory. Adds `test.name` and `test.root`.
- `resolveProjectDirs(patterns)` — Resolves glob patterns to directory paths.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `consoleFailTest` | `boolean` | `true` | Fail tests that call `console.*` methods |
| `hasAssertions` | `boolean` | `true` | Require every test to have at least one assertion |
| `projects` | `string[]` | — | Glob patterns for auto-discovering project directories (global configs only) |
| `testTimeout` | `number` | `300000` | Test timeout in milliseconds (e2e configs only) |

## Setup files

Two opt-in setup files (enabled by default):

- `@gtbuchanan/vitest-config/setup` — Calls `expect.hasAssertions()` in `beforeEach`
- `@gtbuchanan/vitest-config/console-fail-test` — Fails tests that use `console.*`

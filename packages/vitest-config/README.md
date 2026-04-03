# @gtbuchanan/vitest-config

Shared Vitest configuration with three API layers for different project
structures.

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

### Monorepo (vitest projects)

Root config:

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

Per-package config:

```typescript
// packages/my-lib/vitest.config.ts
import { configureProject } from '@gtbuchanan/vitest-config/configure';
import { defineProject } from 'vitest/config';

export default defineProject(configureProject(import.meta.dirname));
```

## API

### `configure(options?)`

Combined config for single-project consumers. Includes alias, coverage,
setupFiles, and test settings.

### `configureGlobal(options?)`

Global-only settings for monorepo root: coverage, setupFiles, mockReset,
unstubEnvs.

### `configureProject(root?)`

Per-project settings for vitest projects: `@` alias to `src/`, test includes.
Pass `import.meta.dirname` as `root` in monorepos.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `consoleFailTest` | `boolean` | `true` | Fail tests that call `console.*` methods |
| `hasAssertions` | `boolean` | `true` | Require every test to have at least one assertion |

## Setup files

Two opt-in setup files (enabled by default):

- `@gtbuchanan/vitest-config/setup` — Calls `expect.hasAssertions()` in `beforeEach`
- `@gtbuchanan/vitest-config/console-fail-test` — Fails tests that use `console.*`

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

## Setup files

Two opt-in setup files (enabled by default):

- `@gtbuchanan/vitest-config/setup` — Calls `expect.hasAssertions()` in `beforeEach`
- `@gtbuchanan/vitest-config/console-fail-test` — Fails tests that use `console.*`

# @gtbuchanan/eslint-config

Shared ESLint configuration for TypeScript projects.

## Install

```sh
pnpm add -D @gtbuchanan/eslint-config eslint jiti
```

## Usage

```typescript
// eslint.config.ts
import { configure } from '@gtbuchanan/eslint-config';

export default configure({
  tsconfigRootDir: import.meta.dirname,
});
```

### Pre-commit

[pre-commit](https://pre-commit.com/) runs hooks in an isolated environment
where your project's `node_modules` is not available. Use `createRequire` so
that `@gtbuchanan/eslint-config` resolves in both local development and the
pre-commit isolated environment:

```typescript
// eslint.config.ts
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type * as EslintConfig from '@gtbuchanan/eslint-config';

interface ModuleMap {
  '@gtbuchanan/eslint-config': typeof EslintConfig;
}

// createRequire bridges ESM→CJS resolution, which respects NODE_PATH (set by pre-commit)
const { resolve } = createRequire(import.meta.url);

async function importModule<S extends keyof ModuleMap>(specifier: S): Promise<ModuleMap[S]> {
  const { href } = pathToFileURL(resolve(specifier));
  const module: ModuleMap[S] = await import(href);
  return module;
}

const { configure } = await importModule('@gtbuchanan/eslint-config');

export default configure({
  tsconfigRootDir: import.meta.dirname,
});
```

## Included plugins

- `typescript-eslint` — strictTypeChecked + stylisticTypeChecked presets
- `eslint-plugin-unicorn` — Recommended modern JS/TS rules
- `eslint-plugin-promise` — Promise best practices
- `@stylistic/eslint-plugin` — Formatting rules (semicolons, quotes, etc.)
- `@eslint-community/eslint-plugin-eslint-comments` — Suppression comment hygiene
- `eslint-plugin-import-x` — Import ordering
- `@eslint/json` — JSON file linting
- `@vitest/eslint-plugin` — Vitest test-specific rules
- `eslint-plugin-n` — Node.js best practices
- `eslint-plugin-pnpm` — pnpm workspace validation (opt-in)
- `eslint-plugin-yml` — YAML linting and key sorting
- `eslint-plugin-only-warn` — Downgrades errors to warnings (opt-in)

# @gtbuchanan/oxfmt-config

Shared oxfmt configuration. Formats non-JS/TS files (JSON, Markdown, YAML, etc.).
JS/TS files are ignored because `@stylistic` handles formatting through ESLint.

## Install

```sh
pnpm add -D @gtbuchanan/oxfmt-config oxfmt
```

## Usage

```typescript
// oxfmt.config.ts
import { configure } from '@gtbuchanan/oxfmt-config';

export default configure();
```

### Pre-commit

[pre-commit](https://pre-commit.com/) runs hooks in an isolated environment
where your project's `node_modules` is not available. Use `createRequire` so
that `@gtbuchanan/oxfmt-config` resolves in both local development and the
pre-commit isolated environment:

```typescript
// oxfmt.config.ts
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type * as OxfmtConfig from '@gtbuchanan/oxfmt-config';

interface ModuleMap {
  '@gtbuchanan/oxfmt-config': typeof OxfmtConfig;
}

// createRequire bridges ESM→CJS resolution, which respects NODE_PATH (set by pre-commit)
const { resolve } = createRequire(import.meta.url);

async function importModule<S extends keyof ModuleMap>(specifier: S): Promise<ModuleMap[S]> {
  const { href } = pathToFileURL(resolve(specifier));
  const module: ModuleMap[S] = await import(href);
  return module;
}

const { configure } = await importModule('@gtbuchanan/oxfmt-config');

export default configure();
```

## Customization

Pass a transform function to override defaults:

```typescript
export default configure((defaults) => ({
  ...defaults,
  printWidth: 80,
}));
```

# @gtbuchanan/eslint-config

Shared ESLint configuration for TypeScript projects. Supplementary linter
alongside oxlint.

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

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `tsconfigRootDir` | `string` | — | Root directory for TypeScript project service |
| `ignores` | `string[]` | `['**/dist/**']` | Global ignore patterns |
| `entryPoints` | `string[]` | `['**/bin/**/*.ts', '**/main.ts']` | Files where `process.exit` is allowed |
| `onlyWarn` | `boolean` | `true` | Downgrade all errors to warnings |
| `pnpm` | `boolean` | `false` | Enable pnpm workspace lint rules |
| `extraConfigs` | `Linter.Config[]` | `[]` | Additional ESLint configs to merge |

## Included plugins

- `eslint-plugin-n` — Node.js best practices
- `eslint-plugin-pnpm` — pnpm workspace validation (opt-in)
- `eslint-plugin-oxlint` — Disables rules already covered by oxlint (applied last)
- `eslint-plugin-only-warn` — Downgrades errors to warnings (opt-in)
- `typescript-eslint` — TypeScript parser and type-aware linting

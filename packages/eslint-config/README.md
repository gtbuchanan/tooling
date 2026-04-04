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

## Included plugins

- `eslint-plugin-n` — Node.js best practices
- `eslint-plugin-pnpm` — pnpm workspace validation (opt-in)
- `eslint-plugin-oxlint` — Disables rules already covered by oxlint (applied last)
- `eslint-plugin-only-warn` — Downgrades errors to warnings (opt-in)
- `typescript-eslint` — TypeScript parser and type-aware linting

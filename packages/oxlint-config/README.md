# @gtbuchanan/oxlint-config

Shared oxlint configuration. Primary linter with all categories enabled at
`warn` severity and `denyWarnings` for CI enforcement.

## Install

```sh
pnpm add -D @gtbuchanan/oxlint-config oxlint
```

## Usage

```typescript
// oxlint.config.ts
import { configure } from '@gtbuchanan/oxlint-config';

export default configure();
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `categories` | `Partial<OxlintConfig['categories']>` | All `'warn'` | Override category severities |
| `ignorePatterns` | `string[]` | `['**/dist/**']` | File patterns to ignore |
| `options` | `Partial<OxlintConfig['options']>` | `{ denyWarnings: true, typeAware: true }` | Oxlint options |
| `overrides` | `OxlintOverride[]` | `[]` | Additional rule overrides |
| `stylistic` | `StylisticOptions` | `{ semi: true, severity: 'warn' }` | `@stylistic/eslint-plugin` options |

## Defaults

- All categories (`correctness`, `pedantic`, `perf`, `style`, `suspicious`) at `warn`
- `@stylistic/eslint-plugin` for formatting rules (max-len: 100, single quotes, semicolons)
- Vitest overrides for test files (relaxed `max-statements`, `no-magic-numbers`, etc.)
- `denyWarnings: true` — warnings fail CI

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


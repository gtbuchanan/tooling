# @gtbuchanan/oxfmt-config

Shared oxfmt configuration. Formats non-JS/TS files (JSON, YAML, etc.).
JS/TS files are ignored because `@stylistic` handles formatting through oxlint.

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

## Customization

Pass a transform function to override defaults:

```typescript
export default configure(defaults => ({
  ...defaults,
  printWidth: 80,
}));
```

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

## Android / Termux

oxlint has two known issues on Android:

- **jsPlugins crash** — `@stylistic/eslint-plugin` triggers a panic in
  `oxc_allocator` ([oxc#21045](https://github.com/oxc-project/oxc/issues/21045)).
  `configure()` auto-detects Android and omits jsPlugins + stylistic rules.
- **Missing tsgolint binary** — `oxlint-tsgolint` has no `android-arm64`
  package ([tsgolint#866](https://github.com/oxc-project/tsgolint/issues/866)).
  The `linux-arm64` binary works. To use it:

  ```sh
  # Install linux binaries alongside android
  pnpm install --os current --os linux

  # Point oxlint to the linux-arm64 binary
  export OXLINT_TSGOLINT_PATH=/path/to/tsgolint-wrapper
  ```


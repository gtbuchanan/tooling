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

### Pre-commit

[pre-commit](https://pre-commit.com/) runs hooks in an isolated environment
where your project's `node_modules` is not available. Use `createRequire` so
that `@gtbuchanan/oxlint-config` resolves in both local development and the
pre-commit isolated environment:

```typescript
// oxlint.config.ts
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type * as OxlintConfig from '@gtbuchanan/oxlint-config';

interface ModuleMap {
  '@gtbuchanan/oxlint-config': typeof OxlintConfig;
}

// createRequire bridges ESM→CJS resolution, which respects NODE_PATH (set by pre-commit)
const { resolve } = createRequire(import.meta.url);

async function importModule<S extends keyof ModuleMap>(specifier: S): Promise<ModuleMap[S]> {
  const { href } = pathToFileURL(resolve(specifier));
  const module: ModuleMap[S] = await import(href);
  return module;
}

const { configure } = await importModule('@gtbuchanan/oxlint-config');

export default configure();
```

## Suppression comments

oxlint jsPlugins (`@stylistic`, `eslint-plugin-import-x`,
`@eslint-community/eslint-plugin-eslint-comments`) use `eslint-disable`
directives — not `oxlint-disable`. Always use `eslint-disable` for ESLint
plugin rules regardless of whether oxlint or ESLint is running the rule.
Use `oxlint-disable` only for oxlint-native rules (e.g., `no-debugger`,
`typescript/*`).

## Platform limitations

oxlint jsPlugins (`@stylistic/eslint-plugin`, `eslint-plugin-import-x`,
`@eslint-community/eslint-plugin-eslint-comments`) crash on certain
platforms. `configure()` auto-detects these platforms and omits jsPlugins +
stylistic rules. The exported ESLint fallback rules (`stylisticRuleOverrides`,
`importOrderRules`, `eslintCommentsRuleOverrides`) can be used to restore
coverage via ESLint on affected platforms.

- **Windows** — intermittent failures
  ([oxc#19395](https://github.com/oxc-project/oxc/issues/19395))
- **Android / Termux** — `oxc_allocator` thread-local pool panic
  ([oxc#21045](https://github.com/oxc-project/oxc/issues/21045))

### Android / Termux additional issues

- **Missing tsgolint binary** — `oxlint-tsgolint` has no `android-arm64`
  package ([tsgolint#866](https://github.com/oxc-project/tsgolint/issues/866)).
  The `linux-arm64` binary works. To use it:

  ```sh
  # Install linux binaries alongside android
  pnpm install --os current --os linux

  # Point oxlint to the linux-arm64 binary
  export OXLINT_TSGOLINT_PATH=/path/to/tsgolint-wrapper
  ```

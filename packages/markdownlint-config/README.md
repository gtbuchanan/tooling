# @gtbuchanan/markdownlint-config

Shared markdownlint configuration. Extends `markdownlint/style/prettier` to
disable rules that conflict with Prettier formatting (via `eslint-plugin-format`).

## Install

```sh
pnpm add -D @gtbuchanan/markdownlint-config markdownlint-cli2
```

## Usage

[pre-commit](https://pre-commit.com/) runs hooks in an isolated environment
where your project's `node_modules` is not available. Use `createRequire` so
that `@gtbuchanan/markdownlint-config` resolves in both local development and
the pre-commit isolated environment:

```javascript
// .markdownlint.mjs
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// createRequire bridges ESM→CJS resolution, which respects NODE_PATH (set by pre-commit)
const { resolve } = createRequire(import.meta.url);
const { href } = pathToFileURL(resolve('@gtbuchanan/markdownlint-config'));
const { configure } = await import(href);

export default configure();
```

### Pre-commit

Add to `.pre-commit-config.yaml` with `additional_dependencies` so the
config package is available in the hook environment:

```yaml
- repo: https://github.com/DavidAnson/markdownlint-cli2
  rev: v0.22.0
  hooks:
    - id: markdownlint-cli2
      additional_dependencies:
        - '@gtbuchanan/markdownlint-config@0.0.0'
      args: [--fix]
```

## Customization

Pass a transform function to override defaults:

```javascript
export default configure((defaults) => ({
  ...defaults,
  'no-duplicate-heading': false,
}));
```

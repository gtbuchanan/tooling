# @gtbuchanan/eslint-plugin-yamllint

ESLint plugin implementing [yamllint](https://github.com/adrienverge/yamllint)-equivalent
rules as native ESLint rules using the [yaml](https://eemeli.org/yaml/) npm
package. No Python dependency required.

## Why?

[Prettier](https://prettier.io/) and
[eslint-plugin-yml](https://ota-meshi.github.io/eslint-plugin-yml/) cover most
of yamllint's rules, but several high-impact rules have no equivalent. This
plugin fills those gaps.

### yamllint rule coverage

| yamllint rule           | Covered by                             | Notes                                                           |
| ----------------------- | -------------------------------------- | --------------------------------------------------------------- |
| anchors                 | **eslint-plugin-yamllint**             | Unused/duplicate anchors, undeclared aliases                    |
| braces                  | eslint-plugin-yml + Prettier           |                                                                 |
| brackets                | eslint-plugin-yml + Prettier           |                                                                 |
| colons                  | eslint-plugin-yml + Prettier           |                                                                 |
| commas                  | Prettier                               |                                                                 |
| comments                | eslint-plugin-yml (partial)            | `min-spaces-from-content` not covered                           |
| comments-indentation    | _not covered_                          |                                                                 |
| document-end            | **eslint-plugin-yamllint**             | Require or forbid `...` markers                                 |
| document-start          | **eslint-plugin-yamllint**             | Require or forbid `---` markers                                 |
| empty-lines             | eslint-plugin-yml + Prettier           |                                                                 |
| empty-values            | eslint-plugin-yml                      |                                                                 |
| float-values            | eslint-plugin-yml (partial)            | Only trailing zeros; no leading-dot/scientific/NaN/Inf          |
| hyphens                 | Prettier                               |                                                                 |
| indentation             | eslint-plugin-yml + Prettier           |                                                                 |
| key-duplicates          | YAML parser                            | Hard parse error, not configurable                              |
| key-ordering            | eslint-plugin-yml                      | `yml/sort-keys` is a superset                                   |
| line-length             | Prettier (partial)                     | `printWidth` is a soft target, not a hard limit                 |
| new-line-at-end-of-file | Prettier                               |                                                                 |
| new-lines               | Prettier                               |                                                                 |
| octal-values            | **eslint-plugin-yamllint**             | Implicit (`0777`) and explicit (`0o777`) octals                 |
| quoted-strings          | eslint-plugin-yml + Prettier (partial) | Basic style only; `required`/`extra-*`/`check-keys` not covered |
| trailing-spaces         | Prettier                               |                                                                 |
| truthy                  | **eslint-plugin-yamllint**             | Unquoted YAML 1.1 boolean-like values (auto-fixable)            |

## Install

```sh
pnpm add -D @gtbuchanan/eslint-plugin-yamllint eslint
```

## Usage

```typescript
// eslint.config.ts
import yamllint from '@gtbuchanan/eslint-plugin-yamllint';

export default [
  {
    files: ['**/*.yaml', '**/*.yml'],
    plugins: { yamllint },
    rules: {
      'yamllint/anchors': 'warn',
      'yamllint/document-end': 'warn',
      'yamllint/document-start': 'warn',
      'yamllint/octal-values': 'warn',
      'yamllint/truthy': ['warn', { 'allowed-values': ['true', 'false'] }],
    },
  },
];
```

## Rules

### `yamllint/truthy`

Flags unquoted YAML 1.1 boolean-like values (`yes`, `no`, `on`, `off`, `y`,
`n`, `true`, `false`, and case variants) that may be silently coerced.
Auto-fixable — wraps values in double quotes.

| Option           | Type       | Default | Description              |
| ---------------- | ---------- | ------- | ------------------------ |
| `allowed-values` | `string[]` | `[]`    | Values to allow unquoted |
| `check-keys`     | `boolean`  | `false` | Also check mapping keys  |

### `yamllint/octal-values`

Flags implicit (`0777`) and explicit (`0o777`) YAML 1.1 octal literals that
may be interpreted differently across YAML versions.

| Option                  | Type      | Default | Description               |
| ----------------------- | --------- | ------- | ------------------------- |
| `forbid-implicit-octal` | `boolean` | `true`  | Flag `0777`-style octals  |
| `forbid-explicit-octal` | `boolean` | `true`  | Flag `0o777`-style octals |

### `yamllint/anchors`

Detects unused anchors, duplicate anchors, and undeclared aliases.

| Option                      | Type      | Default | Description                          |
| --------------------------- | --------- | ------- | ------------------------------------ |
| `forbid-duplicated-anchors` | `boolean` | `true`  | Flag duplicate `&name` anchors       |
| `forbid-undeclared-aliases` | `boolean` | `true`  | Flag `*name` without matching anchor |
| `forbid-unused-anchors`     | `boolean` | `true`  | Flag anchors with no alias reference |

### `yamllint/document-start`

Requires or forbids `---` document start markers. Auto-fixable.

| Option    | Type      | Default | Description                                     |
| --------- | --------- | ------- | ----------------------------------------------- |
| `present` | `boolean` | `true`  | Require (`true`) or forbid (`false`) the marker |

### `yamllint/document-end`

Requires or forbids `...` document end markers. Auto-fixable.

| Option    | Type      | Default | Description                                     |
| --------- | --------- | ------- | ----------------------------------------------- |
| `present` | `boolean` | `false` | Require (`true`) or forbid (`false`) the marker |

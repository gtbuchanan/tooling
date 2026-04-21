# @gtbuchanan/eslint-plugin-markdownlint

ESLint plugin wrapping [markdownlint](https://github.com/DavidAnson/markdownlint)
for structural Markdown linting. Uses markdownlint's sync API directly — no
worker threads.

## Install

```sh
pnpm add -D @gtbuchanan/eslint-plugin-markdownlint eslint
```

## Usage

```typescript
// eslint.config.ts
import markdownlint from '@gtbuchanan/eslint-plugin-markdownlint';
import { parser } from '@gtbuchanan/eslint-plugin-markdownlint';

export default [
  {
    files: ['**/*.md'],
    languageOptions: { parser },
    plugins: { markdownlint },
    rules: {
      'markdownlint/lint': [
        'warn',
        {
          default: true,
          'line-length': false,
        },
      ],
    },
  },
];
```

The rule accepts a
[markdownlint Configuration](https://github.com/DavidAnson/markdownlint#configuration)
object as its option. Rules can be referenced by alias (`line-length`) or code
(`MD013`).

## Inline suppression

Use markdownlint's own comment syntax to suppress specific rules:

```markdown
<!-- markdownlint-disable-next-line MD024 -->

# Duplicate heading allowed here
```

This keeps files compatible with standalone `markdownlint` / `markdownlint-cli2`
usage. ESLint's `<!-- eslint-disable -->` comments control the `markdownlint/lint`
rule as a whole but cannot target individual markdownlint rules.

See the [markdownlint configuration docs](https://github.com/DavidAnson/markdownlint#configuration)
for the full inline directive syntax.

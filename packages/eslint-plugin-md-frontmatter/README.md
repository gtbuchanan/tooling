# @gtbuchanan/eslint-plugin-md-frontmatter

ESLint plugin validating Markdown YAML frontmatter against a JSON Schema.
Generic — knows nothing about specific schemas. Consumers supply the schema
via the rule option.

## Why?

Markdown frontmatter often follows a strict shape (Agent Skills, blog posts,
docusaurus pages, changesets, etc.). JSON Schema is the standard way to
describe that shape. This plugin runs the same kind of structural check as
[`remark-lint-frontmatter-schema`](https://github.com/JulianCataldo/remark-lint-frontmatter-schema)
but inside ESLint, so problems surface inline in the editor and inside the
existing `lint:eslint` task.

## Install

```sh
pnpm add -D @gtbuchanan/eslint-plugin-md-frontmatter eslint
```

## Usage

```typescript
// eslint.config.ts
import frontmatter from '@gtbuchanan/eslint-plugin-md-frontmatter';

const blogPostSchema = {
  type: 'object',
  required: ['title', 'date'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 100 },
    date: { type: 'string', format: 'date' },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

export default [
  {
    files: ['content/posts/**/*.md'],
    plugins: { 'md-frontmatter': frontmatter },
    rules: {
      'md-frontmatter/schema': ['warn', { schema: blogPostSchema }],
    },
  },
];
```

The plugin needs a parser that exposes the source as text. Pair it with
`@gtbuchanan/eslint-plugin-markdownlint`'s parser (already wired for `*.md`
files in `@gtbuchanan/eslint-config`), or any plain-text parser like
`eslint-plugin-format`'s `parserPlain`.

## Rules

### `md-frontmatter/schema`

Validates frontmatter against a JSON Schema. Each Ajv error is reported
with a source location pointing at the offending YAML node.

| Option   | Type     | Required | Description                      |
| -------- | -------- | -------- | -------------------------------- |
| `schema` | `object` | Yes      | JSON Schema (Draft-07 supported) |

The rule also reports when frontmatter is missing entirely. If you only
want to validate frontmatter when present, gate the rule's `files` glob
to files that should have frontmatter.

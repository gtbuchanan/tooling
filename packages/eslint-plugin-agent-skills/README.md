# @gtbuchanan/eslint-plugin-agent-skills

Agent Skills-specific ESLint rules and the canonical
[Agent Skills frontmatter JSON Schema](./src/schema.json).

Most validation is expressed in the schema and runs via
`@gtbuchanan/eslint-plugin-md-frontmatter`'s `schema` rule. This package
ships:

- The Agent Skills frontmatter JSON Schema (exported as
  `skillFrontmatterSchema`).
- One rule, `agent-skills/name-matches-dir`, covering the one
  [spec](https://agentskills.io/specification) constraint that pure
  schemas can't express: `name` must equal the parent directory name.
- A `configs.recommended` flat-config block that wires both plugins
  plus core `max-lines: 500` for `**/skills/*/SKILL.md`.

## Install

```sh
pnpm add -D \
  @gtbuchanan/eslint-plugin-md-frontmatter \
  @gtbuchanan/eslint-plugin-agent-skills \
  eslint
```

## Usage

The recommended config wires everything in one line:

```typescript
// eslint.config.ts
import { configs } from '@gtbuchanan/eslint-plugin-agent-skills';

export default [...configs.recommended];
```

The plugin needs a parser that exposes the file source as text. If you
also use `@gtbuchanan/eslint-plugin-markdownlint`, its parser is already
wired up for `*.md` files. Otherwise, register a plain-text parser
(e.g. `eslint-plugin-format`'s `parserPlain`).

To customize the wiring (different file glob, different rule severity,
extra rules), reference the schema and rule directly:

```typescript
// eslint.config.ts
import frontmatter from '@gtbuchanan/eslint-plugin-md-frontmatter';
import agentSkills, {
  skillFrontmatterSchema,
} from '@gtbuchanan/eslint-plugin-agent-skills';

export default [
  {
    files: ['custom/path/*/SKILL.md'],
    plugins: {
      'agent-skills': agentSkills,
      'md-frontmatter': frontmatter,
    },
    rules: {
      'agent-skills/name-matches-dir': 'error',
      'md-frontmatter/schema': ['error', { schema: skillFrontmatterSchema }],
      'max-lines': ['error', { max: 500 }],
    },
  },
];
```

## What's covered

- **Schema-driven** (via `md-frontmatter/schema` + `skillFrontmatterSchema`):
  required `name`/`description`, length limits, kebab-case `name`,
  `metadata` map of strings, optional `license`/`compatibility`/`allowed-tools`,
  no unknown top-level fields.
- **Rule-driven** (this plugin): `name === parent directory name`.
- **File length** via core `max-lines` (≤ 500 lines per the spec).

## Rules

### `agent-skills/name-matches-dir`

Flags when `name` in `SKILL.md` frontmatter doesn't match the parent
directory name. No options.

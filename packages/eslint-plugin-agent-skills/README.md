# @gtbuchanan/eslint-plugin-agent-skills

Agent Skills-specific ESLint rules and the canonical
[Agent Skills frontmatter JSON Schema](./src/schema.json).

Most validation is expressed in the schema and runs via
`@gtbuchanan/eslint-plugin-md-frontmatter`'s `schema` rule. This package
ships:

- The Agent Skills frontmatter JSON Schema (exported as
  `skillFrontmatterSchema`).
- Rules covering [spec](https://agentskills.io/specification)
  constraints that pure schemas can't express:
  - `agent-skills/name-matches-dir` — `name` must equal the parent
    directory name.
  - `agent-skills/file-references` — markdown link/image/reference
    targets must exist within the skill root and stay within the
    spec's "one level deep" depth guidance.
  - `agent-skills/max-lines` — markdown-aware version of core's
    `max-lines` that fires under any markdown parser/language.
  - `agent-skills/min-evals` — each skill must ship at least N
    eval cases in `evals/evals.json`.
- A `configs.recommended` flat-config that wires the plugin's rules
  plus the schema rule for `**/skills/*/SKILL.md`, and applies a
  smaller `max-lines` cap (300) to `**/skills/*/references/**/*.md`.

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
      'agent-skills/file-references': 'error',
      'agent-skills/max-lines': ['error', { max: 500 }],
      'agent-skills/min-evals': 'error',
      'agent-skills/name-matches-dir': 'error',
      'md-frontmatter/schema': ['error', { schema: skillFrontmatterSchema }],
    },
  },
];
```

## What's covered

- **Schema-driven** (via `md-frontmatter/schema` + `skillFrontmatterSchema`):
  required `name`/`description`, length limits, kebab-case `name`,
  `metadata` map of strings, optional `license`/`compatibility`/`allowed-tools`,
  no unknown top-level fields.
- **Rule-driven** (this plugin): `name === parent directory name`,
  link/image/reference targets exist within the skill root and stay
  within the spec's depth guidance, file length cap, and minimum
  eval coverage.

## Rules

### `agent-skills/file-references`

Enforces the [File references](https://agentskills.io/specification#file-references)
section of the Agent Skills spec, which calls for relative paths from
the skill root and references kept "one level deep" so progressive
disclosure can load resources on demand.

Flags markdown link, image, and reference-style definition URLs in the
body of `SKILL.md` when they:

- resolve to a file that does not exist on disk (`notFound`),
- escape the skill root with `..` or absolute paths (`outsideRoot`), or
- nest deeper than the spec's "one level deep" guidance (`tooDeep`).

External URLs (any `scheme:`, `//host`, or `#fragment`) are ignored, as
are URLs inside fenced code blocks, inline code spans, and HTML
comments. Fragments and query strings are stripped before the existence
check (`[ref](references/REFERENCE.md#heading)` validates the file, not
the heading).

Options:

- `maxDepth` — maximum number of directories between the skill root and
  a referenced file. Defaults to `1` per the spec. Set to `0` to forbid
  any subdirectory references; raise to allow deeper layouts.

```json
{
  "agent-skills/file-references": ["error", { "maxDepth": 1 }]
}
```

### `agent-skills/max-lines`

Caps a markdown file at a maximum line count. Mirrors core ESLint's
`max-lines` but fires under any markdown parser or language (the core
rule's `Program` visitor never runs against `@eslint/markdown`'s
`root` mdast node).

The recommended config applies it twice, with different caps for
different file roles per the spec's
[Progressive disclosure](https://agentskills.io/specification#progressive-disclosure)
guidance:

- `**/skills/*/SKILL.md` — 500 lines ("Keep your main `SKILL.md` under
  500 lines.").
- `**/skills/*/references/**/*.md` — 300 lines, since the spec calls
  for ancillary reference files to be focused and smaller than
  `SKILL.md`. 300 sits just above the p90 line count observed across
  popular published skills.

Options:

- `max` — maximum line count. Defaults to `500`.

### `agent-skills/min-evals`

Requires every skill to ship at least N eval cases in its sibling
`evals/evals.json` file. Missing file, malformed JSON, and empty
`evals` array all count as zero. Reports on `SKILL.md`.

Options:

- `min` — minimum number of eval cases. Defaults to `1`. Raise for
  a stricter coverage bar.

```json
{
  "agent-skills/min-evals": ["error", { "min": 3 }]
}
```

### `agent-skills/name-matches-dir`

Flags when `name` in `SKILL.md` frontmatter doesn't match the parent
directory name, per the spec's [`name` field](https://agentskills.io/specification#name-field)
requirement. No options.

# @gtbuchanan/eslint-plugin-agent-skills

Agent Skills-specific ESLint rules plus the canonical
[SKILL.md frontmatter JSON Schema](./src/schema.json) and
[evals.json JSON Schema](./src/schemas/evals.json).

Most validation is expressed in JSON Schemas; the rules cover spec
constraints that pure schemas can't express. This package ships:

- JSON Schemas (exported as `skillFrontmatterSchema` and
  `skillEvalsSchema`), plus `defineSkillFrontmatterSchema` to extend the
  frontmatter schema with host-specific fields.
- Rules covering [spec](https://agentskills.io/specification)
  constraints that pure schemas can't express:
  - `agent-skills/name-matches-dir` — `name` must equal the parent
    directory name.
  - `agent-skills/file-references` — markdown link/image/reference
    targets must exist within the skill root and stay within the
    spec's "one level deep" depth guidance.
  - `agent-skills/max-lines` — markdown-aware version of core's
    `max-lines` that fires under any markdown parser/language.
  - `agent-skills/max-tokens` — a markdown body must stay under an
    estimated token budget, defaulting to the spec's recommended
    instruction-tier figure.
  - `agent-skills/min-evals` — each skill must ship at least N
    eval cases in `evals/evals.json`.
  - `agent-skills/evals-schema` — `evals/evals.json` matches the
    canonical schema, with sequential unique `id` values and a
    `skill_name` that matches the sibling `SKILL.md`.
- A `configs.recommended` flat-config that wires the plugin's rules
  for `**/skills/*/SKILL.md` (5000 estimated tokens),
  `**/skills/*/references/**/*.md` (a 5000-token backstop), and
  `**/skills/*/evals/evals.json`. Length is gated on tokens alone;
  `max-lines` ships but is opt-in.
- A `defineSkillFrontmatterConfig` composer that overlays the
  frontmatter extensions of one or more agent hosts.

## Install

```sh
pnpm add -D \
  @eslint/json \
  @eslint/markdown \
  @gtbuchanan/eslint-plugin-md-frontmatter \
  @gtbuchanan/eslint-plugin-agent-skills \
  eslint
```

`@eslint/json` and `@eslint/markdown` are peer dependencies rather than
regular ones because `configs.recommended` registers them under the
`json` and `markdown` plugin namespaces. ESLint rejects a namespace that
is registered twice unless both configs pass the identical plugin
object, so any config that also registers `markdown` (including
`@gtbuchanan/eslint-config`) must resolve to the same copy this plugin
imports. A peer dependency is what guarantees that; a regular dependency
lets the two pins drift and installs a second copy.

## Usage

The recommended config wires everything in one line:

```typescript
// eslint.config.ts
import { configs } from '@gtbuchanan/eslint-plugin-agent-skills';

export default [...configs.recommended];
```

### Host extensions

`configs.recommended` validates frontmatter against the bare spec, which
closes the object to unknown properties — so a host's own field reads as
an error. The spec sanctions only the nested `metadata` map for
client-specific data, so a host that puts fields at the top level (as
[Claude Code](https://code.claude.com/docs/en/skills) does) is describing
its own surface, and each field has to be declared. There is no reserved
top-level namespace to pattern-match instead.

`defineSkillFrontmatterConfig` composes an overlay for the hosts a repo
targets:

```typescript
// eslint.config.ts
import {
  configs,
  defineSkillFrontmatterConfig,
} from '@gtbuchanan/eslint-plugin-agent-skills';

export default [
  ...configs.recommended,
  ...defineSkillFrontmatterConfig('claude-code'),
];
```

It takes any number of sources — a host name from `skillFrontmatterHosts`,
or a property map of your own for a host this package doesn't ship:

```typescript
defineSkillFrontmatterConfig('claude-code', {
  'x-team-owner': { type: 'string' },
});
```

Pass them all to **one** call. The overlay re-points a single rule and
relies on flat config's last-match-wins merge, so spreading one overlay
per host leaves only the last host's schema in force — and spreading the
overlay _before_ `recommended` lets the spec schema win.

Sources are unioned: the result accepts every field any of them declares,
which is what a repo whose skills run under several hosts needs. It
cannot express "valid under _every_ host at once" — that is the spec
schema, which is what `configs.recommended` alone already gives you. A
field two sources both declare takes its definition from the later one,
so your own map can override a shipped host's field.

Whatever the sources, only property definitions are layered on: `name`
and `description` stay required and every spec constraint (kebab-case
`name`, length caps) still applies.

#### Shipped hosts

- **`claude-code`** — the fields in Claude Code's
  [frontmatter reference](https://code.claude.com/docs/en/skills), plus
  the YAML-list spelling it accepts for the spec's `allowed-tools`. See
  [`src/hosts/claude-code.ts`](./src/hosts/claude-code.ts) for the
  declarations this package actually enforces.

Where the fields are pinned is a judgment call rather than a
transcription: `context`, `effort`, and `shell` are held to their
documented value sets, so a typo is caught and a new upstream value
needs a bump here; `model` and `hooks` stay open, since their value
spaces are not closed.

Use `defineSkillFrontmatterSchema` with the same arguments if you want
the composed schema rather than the config block.

### Parser

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
      'agent-skills/max-tokens': ['error', { max: 5000 }],
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
  no unknown top-level fields (see [Host extensions](#host-extensions)
  to accept a host's own).
- **Rule-driven** (this plugin): `name === parent directory name`,
  link/image/reference targets exist within the skill root and stay
  within the spec's depth guidance, file length cap, minimum eval
  coverage, and `evals.json` shape and cross-file integrity.

## Rules

### `agent-skills/evals-schema`

Validates an Agent Skill's `evals/evals.json` against
[`skillEvalsSchema`](./src/schemas/evals.json), and also enforces
invariants the schema can't express:

- `id` values are unique.
- `id` values are sequential starting at `1`.
- `skill_name` matches the sibling `SKILL.md` frontmatter `name`,
  and a sibling `SKILL.md` exists at all.

No options.

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

**Not enabled by `configs.recommended`** — opt in explicitly if you
want it. It remains exported because the spec does state a line figure
("Keep your main `SKILL.md` under 500 lines."), so a repo that wants
that enforced literally can wire it:

```js
{
  files: ['**/skills/*/SKILL.md'],
  rules: { 'agent-skills/max-lines': ['warn', { max: 500 }] },
}
```

The recommended config gates length on `max-tokens` alone. Both rules
proxy for how much context a skill costs to load, and tokens measure it
directly. At the ~10–14 tokens per line typical of prose skills, 500
lines works out to 5200–7000 tokens, so `max-tokens` is the one that
fires. The line cap leads only below ~10 tokens per line — semantic line
breaks, one-item-per-line lists, reflowed tables — and there it reports
formatting, since none of those change what the agent loads.

Note that this rule counts physical lines: there is no
`skipBlankLines` / `skipComments` equivalent to core's `max-lines`.

Options:

- `max` — maximum line count. Defaults to `500`.

### `agent-skills/max-tokens`

Caps the `SKILL.md` body at a maximum estimated token count, per the
spec's
[Progressive disclosure](https://agentskills.io/specification#progressive-disclosure)
budget for the instructions tier ("**Instructions** (< 5000 tokens
recommended)").

The recommended config applies it to `**/skills/*/SKILL.md` and to
`**/skills/*/references/**/*.md`, both at 5000. On `SKILL.md` that is
the spec's own figure. On `references/` it is a backstop rather than a
spec limit — the spec caps no reference file, so the threshold worth
flagging is a reference file that costs more to load than the entire
instructions tier it was split out of.

Frontmatter is excluded from the count. The spec accounts for `name`
and `description` separately, as the ~100-token metadata tier loaded at
startup, so a long description shouldn't eat the instruction budget.

Options:

- `max` — maximum estimated token count. Defaults to `5000`.

#### How `agent-skills/max-tokens` estimates tokens

The count is an estimate — four UTF-8 bytes per token — not a real BPE
tokenization. Every agent host tokenizes differently, and no bundled
tokenizer would be authoritative across them, so the rule approximates
rather than taking on a dependency that implies a precision it can't
deliver.

Measured against a real BPE tokenizer over a corpus of published
`SKILL.md` bodies, the estimate landed between 1.0x and 1.15x of the
true count. Treat a report within a few percent of the cap as "close
enough to review", not as a precise measurement.

The unit is bytes rather than characters because that is what a
byte-pair tokenizer merges over. For ASCII the two are identical, so
the calibration above is unaffected either way; outside it they
diverge sharply. A CJK character is one UTF-16 unit but three UTF-8
bytes, so a character count under-reads a Chinese or Japanese body by
roughly 3x — passing a skill far over any real budget.

Where the estimate still under-reads is content a tokenizer fragments
past one token per few bytes: long base64 blobs, dense runs of table
punctuation, and emoji, which measured at about 2x. That needs a body
made mostly of such content to matter — the table-heavy skills in the
corpus land inside the band above — but it does mean a pass is
evidence rather than proof.

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

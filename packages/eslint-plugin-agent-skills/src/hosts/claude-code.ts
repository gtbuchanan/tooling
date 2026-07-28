import type { SkillFrontmatterExtensions } from '../frontmatter-schema.ts';

/*
 * Claude Code accepts either a scalar or a YAML list wherever the bare
 * spec types a single delimited string, so the widened fields share one
 * shape. `allowed-tools` is a spec field Claude Code widens this way;
 * the rest are extensions.
 */
const stringOrList = {
  anyOf: [
    { minLength: 1, type: 'string' },
    { items: { minLength: 1, type: 'string' }, minItems: 1, type: 'array' },
  ],
};

/**
 * Frontmatter fields from Claude Code's
 * [frontmatter reference](https://code.claude.com/docs/en/skills), which
 * documents itself as a superset of the Agent Skills specification —
 * invocation control, subagent execution, tool grants, and the rest —
 * plus the list spelling it also accepts for the spec's `allowed-tools`.
 *
 * `context`, `effort`, and `shell` are pinned to the documented value
 * sets so a typo is caught; a new upstream value needs a bump here.
 * `model` and `hooks` stay open, since their value spaces are not.
 *
 * Text fields carry no length limit: Claude Code's cap applies to
 * `description` and `when_to_use` combined and truncates the listing
 * rather than rejecting the skill, so no per-field limit expresses it.
 */
export const claudeCodeFrontmatterExtensions: SkillFrontmatterExtensions = {
  'agent': { minLength: 1, type: 'string' },
  'allowed-tools': stringOrList,
  'argument-hint': { minLength: 1, type: 'string' },
  'arguments': stringOrList,
  'background': { type: 'boolean' },
  'context': { enum: ['fork'] },
  'disable-model-invocation': { type: 'boolean' },
  'disallowed-tools': stringOrList,
  'effort': { enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
  /* Shape is owned by the hooks reference; validated as a mapping only. */
  'hooks': { type: 'object' },
  'model': { minLength: 1, type: 'string' },
  'paths': stringOrList,
  'shell': { enum: ['bash', 'powershell'] },
  'user-invocable': { type: 'boolean' },
  'when_to_use': { minLength: 1, type: 'string' },
};

---
'@gtbuchanan/eslint-plugin-agent-skills': major
---

Gate skill length on tokens rather than lines

`configs.recommended` now caps both `SKILL.md` and
`**/skills/*/references/**/*.md` with `agent-skills/max-tokens` at 5000,
and applies `agent-skills/max-lines` to neither. The rule still ships, so
a repo wanting the spec's 500-line figure can wire it explicitly:

```js
{
  files: ['**/skills/*/SKILL.md'],
  rules: { 'agent-skills/max-lines': ['warn', { max: 500 }] },
}
```

Both rules proxy for how much context a skill costs to load, and tokens
measure it directly. At the ~10-14 tokens per line typical of prose
skills, 500 lines does not bind until well past 5000 tokens, so the line
cap cannot fire first — and where a line count does move independently
(semantic line breaks, one-item-per-line lists, reflowed tables) it moves
without changing what the agent loads.

The 300-line cap on `references/` had no upstream basis. The spec's third
progressive-disclosure tier is "Resources (as needed)" and `skill-creator`
calls bundled resources "unlimited, loaded as needed"; the only nearby
number is a table-of-contents threshold, not a cap. The 5000 there is a
backstop for a reference file costing more to load than the instructions
tier it was split out of.

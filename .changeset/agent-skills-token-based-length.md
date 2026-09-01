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
skills, 500 lines works out to 5200-7000 tokens, so the token cap is the
one that fires. The line cap leads only below ~10 tokens per line, where
it reports formatting — semantic line breaks and dense lists raise a line
count without changing what the agent loads.

The 300-line cap on `references/` had no upstream basis: the spec's third
tier is "Resources (as needed)" and `skill-creator` calls bundled
resources "unlimited, loaded as needed". The 5000 there is a backstop for
a reference file costing more to load than the instructions tier it was
split out of.

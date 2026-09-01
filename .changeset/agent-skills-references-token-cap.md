---
'@gtbuchanan/eslint-plugin-agent-skills': minor
---

Cap `references/` files by estimated tokens instead of lines

`configs.recommended` now applies `agent-skills/max-tokens` to
`**/skills/*/references/**/*.md` at 5000 and no longer applies
`agent-skills/max-lines` there.

Nothing upstream caps a reference file: the spec's third
progressive-disclosure tier is "Resources (as needed)" and its
`references/` guidance is qualitative, while Anthropic's `skill-creator`
calls bundled resources "unlimited, loaded as needed". The previous
300-line cap read as a hard limit derived from a table-of-contents
threshold, and it bounded the wrong quantity — the cost of a reference
file is the context it occupies when loaded, which a line count tracks
poorly.

---
'@gtbuchanan/eslint-plugin-agent-skills': minor
---

Add composable host extensions for `SKILL.md` frontmatter

`skillFrontmatterSchema` closes frontmatter to unknown properties, per
the Agent Skills spec, so a skill using a host's own field — say
`user-invocable: false` on a building block that shouldn't reach Claude
Code's `/` menu — had no lever short of replacing the schema wholesale,
which drops the spec validation entirely.

```js
export default [
  ...configs.recommended,
  ...defineSkillFrontmatterConfig('claude-code', myExtensions),
];
```

A source is a host name from the new `skillFrontmatterHosts` registry
(`claude-code` ships today) or a JSON Schema property map for a host
this package doesn't. Pass every host a repo targets to one call —
sources union, and a second overlay would replace the first rather than
merge with it. `defineSkillFrontmatterSchema` returns the same schema
for callers wiring the rule themselves.

Only property definitions are layered on, and `configs.recommended` is
unchanged, so repos targeting the bare standard keep the stricter
validation.

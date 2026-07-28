---
'@gtbuchanan/eslint-config': minor
---

Add an `agentSkillsHost` option for `SKILL.md` frontmatter extensions

`SKILL.md` frontmatter is validated against the Agent Skills spec, which
rejects the fields agent hosts document on top of the standard.
`agentSkillsHost` names the hosts to accept — a host name, a JSON Schema
property map for a host the plugin doesn't ship, or a list of either for
skills targeting several at once:

```js
configure({ agentSkillsHost: ['claude-code', myExtensions] });
```

Listed hosts union their fields. The default, `'standard'`, keeps
validating against the bare spec — which is also the "valid under every
host" setting — so existing configs are unaffected.

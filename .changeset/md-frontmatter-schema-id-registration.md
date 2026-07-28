---
'@gtbuchanan/eslint-plugin-md-frontmatter': patch
---

Stop `md-frontmatter/schema` throwing on a schema that declares `$id`

Ajv registers a schema under its `$id` process-wide and throws
`schema with key or id "..." already exists` on a second registration.
The rule guarded against that with a compile cache keyed on schema-object
identity, but ESLint hands the rule a fresh options object every time a
config is resolved, so the cache missed and Ajv saw the same id twice —
one lint pass succeeded and the next died inside the rule.

The rule's Ajv instance now sets `addUsedSchema: false`, so compiling a
schema no longer registers it under its `$id`. The id still establishes
the base URI, so a `$ref` written against it resolves as before.

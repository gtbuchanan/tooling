---
---

Exclude `@gtbuchanan/*` from mise's release-age quarantine

Set a soft mise `min_version` of 2026.6.2 (the floor that supports
`minimum_release_age_excludes`) and pin the `mise-setup` action to mise
2026.6.11, then set `minimum_release_age_excludes = ["npm:@gtbuchanan/*"]`
so fuzzy/`latest` resolution picks up our own just-cut releases without
waiting out the 3-day supply-chain quarantine.

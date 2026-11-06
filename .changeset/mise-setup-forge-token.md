---
'@gtbuchanan/github-workflows': patch
---

Pass the job token to mise only on github.com. On Forgejo and Gitea, `github.token` is the forge's own token, which GitHub rejects, so `mise-setup` no longer sends it there. The `MISE_GITHUB_TOKEN` preset that worked around jdx/mise-action#292 is gone, since mise-action v5 authenticates its own GitHub API calls.

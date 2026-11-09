---
'@gtbuchanan/github-workflows': patch
---

Key the `mise-setup` cache by OS release as well as architecture, so a runner image change doesn't restore tools installed on the previous image. The first run after updating installs every tool again.

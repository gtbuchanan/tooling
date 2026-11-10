---
'@gtbuchanan/github-workflows': patch
---

Key the `mise-setup` cache by OS release as well as architecture

A runner image change no longer restores tools installed on the previous image.
The first run after updating installs every tool again.

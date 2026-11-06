---
'@gtbuchanan/github-workflows': patch
---

Drop `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` from the reusable workflows. Node.js 24 has been the default JavaScript action runtime since GitHub removed Node.js 20, so the variable no longer does anything.

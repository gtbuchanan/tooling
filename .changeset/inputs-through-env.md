---
'@gtbuchanan/github-workflows': patch
---

Pass `inputs.gtb-from-source` and `pnpm-resolve-pinned`'s `package` input to their `run:` scripts through environment variables instead of expanding them into the script text. A `package` value holding shell syntax could previously run as a command in the caller's job.

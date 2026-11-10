---
'@gtbuchanan/github-workflows': patch
---

Stop expanding inputs into `run:` script text

`inputs.gtb-from-source` and `pnpm-resolve-pinned`'s `package` input now reach
their scripts through environment variables. A `package` value holding shell
syntax could previously run as a command in the caller's job.

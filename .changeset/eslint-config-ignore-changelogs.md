---
'@gtbuchanan/eslint-config': minor
---

Ignore generated `CHANGELOG.md` files by default

Changesets writes `CHANGELOG.md` through its own Prettier resolution,
which cannot see the options this config hands `format/prettier`. A
changeset whose body contains a fenced code block comes back reformatted
— stock Prettier double-quotes string literals where this config's
`singleQuote` does not — and the diff is unfixable at the source, since
the `.changeset/*.md` the snippet was authored in is linted the other
way. Every version PR failed lint on a file no one can correct.

The generated changelog joins build output, lockfiles, and generated
skills in the default `ignores`: paths another tool generates and owns
the format of. Authored `.changeset/*.md` are unaffected and stay
linted.

Repos passing their own `ignores` replace the default list wholesale, so
add `**/CHANGELOG.md` to keep this behavior.

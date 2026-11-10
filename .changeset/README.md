# Changesets

A changeset declares a release: the packages a change releases, each with its
bump type, and a summary that `gtb version` writes into each package's
`CHANGELOG.md`.

```markdown
---
'@gtbuchanan/eslint-config': patch
---

Fix rule conflict
```

A PR that changes a package needs one, and CI enforces it. Edits confined to a
package's `test/`, `e2e/`, `eslint.config.ts` or `vitest.config*.ts` don't
count, since none of them ship (`changedFilePatterns` in `config.json`). A
change that releases nothing takes an empty changeset, with no packages in its
frontmatter:

```markdown
---
---

Update CI workflow
```

`changeset status` asserts only that _some_ changeset exists once a versionable
package changed. It never checks that one covers the package that changed, so
read the frontmatter against the diff yourself.

## One changeset per release, not per pull request

What earns a changeset entry is a change a consumer of the package can observe.
A structural change observes as nothing (an extraction, a rename, a refactor
behind an unchanged interface), so it takes an empty changeset.

A change spread over several PRs keeps **one** changeset and amends it, so the
changelog describes the feature rather than each step towards it. Both CI gates
accept an amendment: `changeset status` counts every changeset the PR adds or
modifies, and `gtb changeset check` reads every pending changeset. When a later
step releases another package, add it to the frontmatter. Once a release
consumes the changeset, the next PR starts a fresh one.

Amending a changeset that the open "Version Packages" PR already consumed makes
that PR conflict, since its branch deletes the file the amendment modifies. The
next push to `main` regenerates and force-pushes the branch, which clears it.

## Changeset summary style

Write the summary for whoever upgrades the package: what changed for them, and
what they have to do about it. "Add `gtb changeset check`" tells them
something; "split the catalog gate into its own module" tells them about code
they never call.

- **Title**: one imperative line of at most 69 characters, so the
  `- <sha>: ` prefix changesets adds keeps it within 80 columns.
- **Body**: a blank line, then paragraphs hard-wrapped at 80 columns. Omit it
  when the title says everything.

Changesets copies the summary into the CHANGELOG verbatim, and the `hk fix`
that `gtb version` runs afterwards preserves its wrapping, so a paragraph
written as one line lands as one line.

Name the file after the change. Nothing reads the name, so it only has to
differ from the changesets already pending.

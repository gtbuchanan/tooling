---
'@gtbuchanan/cli': patch
---

Make `gtb publish` resilient to partial release failures

A release run no longer aborts on the first problem it meets. Failures are
collected and re-thrown together, so one package or channel can't strand the
rest, and the run reports everything that went wrong instead of only the first
thing.

The skip-if-exists check now reads a single `gh release list` rather than a
`gh release view` per package, and a failed listing raises instead of being
read as "nothing is released" — which previously sent every package on to a
create that could only fail. A create GitHub rejects because the tag is
already taken now counts as released, covering both a race with the listing
and a tag reserved by a deleted immutable release.

---
'@gtbuchanan/cli': major
---

Remove the `codecov` sync and verify scope

`gtb sync` no longer writes `codecov.yml` and `gtb verify` no longer checks it
for drift. `gtb sync codecov` and `gtb verify codecov` now exit non-zero as
unknown scopes.

Codecov's `flag_management.default_rules` applies per-package rules to every
flag it ingests, so the enumerated `flags` and `component_management` blocks
the generator existed to write are no longer needed. Hand-author `codecov.yml`
instead; a new package earns the rules the moment it first uploads, which the
generator could only manage on a re-sync.

---
---

Authenticate the remote config fetch in `dependency-review.yml`

`dependency-review.yml` passes a remote `config-file`
(`gtbuchanan/tooling/.github/dependency-review-config.yml@main`) and never
passed `external-repo-token`. The action reads two separate tokens:
`repo-token` covers the dependency-graph calls and defaults to `github.token`,
while `external-repo-token` covers the `config-file` fetch alone and has no
default. That fetch therefore went out unauthenticated.

Unauthenticated requests get 60 per hour per IP, and GitHub-hosted runners
share public IPs, so the budget belongs to every job on the host rather than to
the run. A run that landed on an exhausted IP logged `Request quota exhausted
for request GET /repos/{owner}/{repo}/contents/{path}` and then hung until the
window reset — octokit's throttling plugin waits out a rate limit instead of
failing — pinning the `Dependency Review` required check for as much as an
hour. Sibling runs on other IPs finished in under ten seconds, which is what
made it read as an intermittent hang rather than a token problem.

Passing `github.token` moves the fetch onto the caller's 1,000-per-hour
per-repository budget. A consumer pointing `config-file` at a private
repository still needs a token with access to it; that case did not work
before either.

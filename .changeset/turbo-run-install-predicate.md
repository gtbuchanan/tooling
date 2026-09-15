---
---

Install dependencies unless every turbo task is a cache hit

`turbo-run` weighed only tasks that declare outputs when deciding whether the
turbo cache covered the run, on the reasoning that output-less tasks are not
cached anyway. A task with `cache: false` and no outputs therefore fell out of
the set entirely, and a run holding nothing else left an empty set, zero
misses, and a cache hit concluded from no evidence. `pnpm install` was skipped
while the task itself still ran, because `cache: false` means it always runs.

The Codecov upload job is exactly that shape, so it never installed. Each
package's script then found `node_modules` missing and, under pnpm's default
`verifyDepsBeforeRun`, started a workspace install of its own; a dozen of them
raced, collided in the virtual store, and the first casualty took the rest down
with it. The job failed often enough to leave `codecov/project` and
`codecov/patch` unreported, which is the state that blocks a pull request
permanently.

The check now weighs every task that has a command, and requires at least one
of them. A cache hit replays outputs instead of running the command, so that is
the only condition under which the install is dispensable. Output-less tasks
are cached and report hits, so the fast path survives; a `cache: false` task
reports a miss and keeps the install it needs.

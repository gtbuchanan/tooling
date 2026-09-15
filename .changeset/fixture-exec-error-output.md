---
---

Surface npm's output when a test fixture's install fails

`exec` ran `npm init` and `npm install` with `stdio: 'ignore'`, so a failed
fixture reported only `npm install … exited with 1`. The line naming the cause —
`npm error notarget No matching version found for …` — went to a discarded
stream, and diagnosing a stale packument meant re-running the command by hand
with the output restored.

It now captures both streams and appends the tail to the thrown error, bounded
to the last 40 lines because the diagnosis sits at the end.

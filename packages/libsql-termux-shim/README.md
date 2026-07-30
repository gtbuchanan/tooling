# @gtbuchanan/libsql-termux-shim

Stand-in for [libsql](https://github.com/tursodatabase/libsql-js)'s native
binding on Termux/Android, implemented on Node's built-in `node:sqlite`.

## Why

libsql publishes prebuilt bindings for darwin, linux, and win32 only — there is
no `@libsql/android-arm64`. Anything that reaches libsql therefore fails at
startup on Termux. [promptfoo](https://promptfoo.dev) is the motivating case: its
results database is mandatory and reached through drizzle, so it dies before
running a single eval.

```text
Database migration failed: Cannot find module '@libsql/android-arm64'
```

Node 24 ships SQLite in core, so the binding can be reimplemented in JavaScript
rather than cross-compiled.

## Install

Alias the missing target, gated to Android so every other platform keeps the real
binding:

```json
{
  "optionalDependencies": {
    "@libsql/android-arm64": "npm:@gtbuchanan/libsql-termux-shim@^0.1.0"
  }
}
```

Node resolves `require("@libsql/android-arm64")` from inside libsql by walking up
to the project's `node_modules`, so a root-level install is found even under
pnpm's isolated layout.

`libsql` itself declares an `os` allowlist that omits android, which makes pnpm
refuse to resolve the workspace before it ever reaches this shim. Ungate it in
`.pnpmfile.cjs` — in both hooks, since `readPackage` ungates resolution while
`afterAllResolved` drops the field pnpm records in the lockfile and rechecks on
every later install:

```js
const readPackage = (pkg) => {
  if (pkg.name !== 'libsql') return pkg;
  const { os, ...ungated } = pkg;
  return ungated;
};
```

## Scope

Local databases only. Embedded replicas (`syncUrl`, `sync()`, `syncUntil()`) need
libsql's replication protocol, which has no `node:sqlite` equivalent, so those
entry points throw rather than silently misbehave.

Extension loading throws for a different reason: libsql permits it per call, but
`node:sqlite` decides it when the connection is constructed. Opting every database
in to `allowExtension` so an unused call could work would trade real capability
for hypothetical fidelity, so the shim reports the gap instead.

## How it works

libsql's JS wrapper calls each native function as `fn.call(handle, ...)`, where
the handle is whatever `databaseOpen` or `databasePrepareSync` returned. Both
sides belong to the binding, so plain objects serve as handles.
`node:sqlite`'s `DatabaseSync`/`StatementSync` are synchronous like libsql's
`*Sync` natives, and `run()` already returns libsql's
`{ changes, lastInsertRowid }` shape, so most of the mapping is direct.

Three places where it isn't, all load-bearing:

- **`raw(true)` must throw for a statement returning no columns.**
  `@libsql/client` calls it inside a `try`/`catch` purely to detect whether a
  statement yields rows, routing `BEGIN`/`COMMIT`/`INSERT` to `run()` when it
  throws. Succeeding sends `BEGIN` down the query path, and the client then fails
  the batch with `TRANSACTION_CLOSED`.
- **Transaction state is tracked from the SQL.** `node:sqlite` exposes no
  autocommit flag. Both entry points matter: libsql's own `transaction()` issues
  `BEGIN` through `exec()`, while `@libsql/client` issues it through
  `prepare().run()`.
- **Rows are rebuilt as plain objects.** `node:sqlite` returns null-prototype
  rows where the real binding returns ordinary ones, a difference that otherwise
  leaks to anything inspecting a row's prototype.

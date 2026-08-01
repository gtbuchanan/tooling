/*
 * Stand-in for libsql's native binding on Termux/Android, implemented on Node's
 * built-in `node:sqlite`.
 *
 * libsql publishes prebuilt bindings for darwin/linux/win32 only, so
 * `require("@libsql/android-arm64")` fails on Termux and every dependent dies at
 * startup — for promptfoo, before it can run a single eval, because its results
 * database is mandatory and reached through drizzle.
 *
 * This works because libsql's JS wrapper calls each native function as
 * `fn.call(handle, ...)` where the handle is whatever `databaseOpen` or
 * `databasePrepareSync` returned. Both sides are ours, so plain objects serve as
 * handles. `node:sqlite`'s `DatabaseSync`/`StatementSync` are synchronous like
 * libsql's `*Sync` natives and `run()` already returns libsql's
 * `{ changes, lastInsertRowid }` shape, so most of the mapping is direct.
 *
 * Install it by aliasing the missing target, gated to Android so other platforms
 * keep the real binding:
 *
 *     "optionalDependencies": {
 *       "@libsql/android-arm64": "npm:@gtbuchanan/libsql-termux-shim@^0.1.0"
 *     }
 *
 * Local databases only. Embedded replicas need libsql's replication protocol,
 * which has no `node:sqlite` equivalent, so those entry points throw.
 *
 * @module
 */

/* eslint-disable unicorn/no-this-outside-of-class, unicorn/consistent-boolean-name --
   Both are dictated by the binding contract, module-wide. libsql invokes every
   native function as `fn.call(handle, ...)`, so `this` is the handle and these
   cannot become class methods without breaking the call convention. The exported
   names (`databaseInTransaction`, `statementIsReader`) are the identifiers
   libsql destructures by, so they cannot be renamed to a boolean-name prefix. */

const { DatabaseSync } = require('node:sqlite');

/**
 * @typedef {object} DatabaseHandle
 * @property {boolean} inTransaction Whether a transaction is currently open.
 * @property {boolean} safeIntegers Whether new statements read integers as BigInt.
 * @property {import('node:sqlite').DatabaseSync} sqlite Underlying connection.
 */

/**
 * @typedef {object} StatementHandle
 * @property {DatabaseHandle} db Owning database, for transaction bookkeeping.
 * @property {boolean} raw Whether rows are returned as arrays.
 * @property {string} sql Source text, used to detect transaction statements.
 * @property {import('node:sqlite').StatementSync} stmt Prepared statement.
 */

/**
 * @typedef {object} RowsHandle
 * @property {number} index Position of the next row to hand back.
 * @property {unknown[]} rows Materialized result set.
 */

/**
 * @param {string} feature Operation that needs the real binding.
 * @returns {never}
 */
const unsupported = (feature) => {
  throw new Error(
    `@gtbuchanan/libsql-termux-shim: ${feature} requires the native libsql binding`,
  );
};

/**
 * `node:sqlite` exposes no autocommit flag, so transaction state is derived from
 * the SQL itself. SQLite clears autocommit the moment `BEGIN` executes — even
 * `DEFERRED`, which only defers lock acquisition — so this matches what the real
 * binding reports.
 *
 * @param {DatabaseHandle} db Database whose state should be updated.
 * @param {string} sql Statement that just executed.
 * @returns {void}
 */
const noteTransaction = (db, sql) => {
  const pattern = /^\s*(?<verb>BEGIN|COMMIT|END|ROLLBACK)\b/iv;
  const verb = pattern.exec(sql)?.groups?.['verb']?.toUpperCase();
  /* eslint-disable-next-line no-param-reassign --
     The handle is mutable state owned by this binding: libsql reads it back
     through databaseInTransaction, so the update has to land on the caller's
     object rather than a copy. */
  if (verb === 'BEGIN') db.inTransaction = true;
  /* eslint-disable-next-line no-param-reassign -- See above. */
  else if (verb !== undefined) db.inTransaction = false;
};

/**
 * libsql passes either a single object of named parameters or a flat array of
 * positional ones; `node:sqlite` wants the object as one argument and positional
 * values spread.
 *
 * @param {unknown} params Bind parameters as libsql supplies them.
 * @returns {unknown[]} Arguments to spread into a `node:sqlite` call.
 */
const bind = (params) => {
  if (params === undefined) return [];

  return Array.isArray(params) ? params : [params];
};

/**
 * `node:sqlite` returns rows as null-prototype objects; the real binding returns
 * ordinary ones. Left alone, that difference leaks to anything testing a row's
 * prototype — `instanceof`, `constructor`, deep-equality helpers — so rows are
 * rebuilt as plain objects. Array rows (raw mode) already match and pass through.
 *
 * @param {unknown} row Row as `node:sqlite` produced it.
 * @returns {unknown} Row with the prototype libsql callers expect.
 */
const plainRow = (row) => {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return row;

  return { ...row };
};

/**
 * Opens a local database.
 *
 * @param {string} path File path, or `:memory:`.
 * @returns {DatabaseHandle} Handle the wrapper passes back as `this`.
 */
const databaseOpen = path => ({
  inTransaction: false,
  safeIntegers: false,
  sqlite: new DatabaseSync(path === '' ? ':memory:' : path),
});

/**
 * Rejects embedded replicas, which need libsql's replication protocol.
 *
 * @returns {never}
 */
const databaseOpenWithSync = () => unsupported('embedded replicas (syncUrl)');

/**
 * Reports whether a transaction is open. Called with the handle as an argument
 * rather than as `this`, matching the wrapper's `inTransaction` getter.
 *
 * @param {DatabaseHandle} db Database to inspect.
 * @returns {boolean} Whether a transaction is open.
 */
const databaseInTransaction = db => db.inTransaction;

/**
 * Executes one or more statements without returning rows.
 *
 * @this {DatabaseHandle}
 * @param {string} sql Statements to execute.
 * @returns {void}
 */
function databaseExecSync(sql) {
  this.sqlite.exec(sql);
  noteTransaction(this, sql);
}

/**
 * Prepares a statement.
 *
 * @this {DatabaseHandle}
 * @param {string} sql Statement to prepare.
 * @returns {StatementHandle} Handle the wrapper passes back as `this`.
 */
function databasePrepareSync(sql) {
  const stmt = this.sqlite.prepare(sql);
  stmt.setAllowBareNamedParameters(true);
  if (this.safeIntegers) stmt.setReadBigInts(true);

  return { db: this, raw: false, sql, stmt };
}

/**
 * Closes the database.
 *
 * @this {DatabaseHandle}
 * @returns {void}
 */
function databaseClose() {
  this.sqlite.close();
}

/**
 * No-op. `node:sqlite` has no interrupt, and these queries are synchronous and
 * local, so there is no in-flight work to cancel.
 *
 * @returns {void}
 */
/* eslint-disable-next-line @typescript-eslint/no-empty-function --
   Genuinely nothing to do: the binding must expose this entry point, but
   node:sqlite runs every query synchronously, so none is ever in flight. */
const databaseInterrupt = () => {};

/**
 * Sets whether statements prepared afterwards read integers as BigInt.
 *
 * @this {DatabaseHandle}
 * @param {boolean} toggle Whether to read integers as BigInt.
 * @returns {void}
 */
function databaseDefaultSafeIntegers(toggle) {
  this.safeIntegers = toggle;
}

/**
 * Installs an authorizer callback.
 *
 * @this {DatabaseHandle}
 * @param {Parameters<import('node:sqlite').DatabaseSync['setAuthorizer']>[0]} rules Authorizer.
 * @returns {void}
 */
function databaseAuthorizer(rules) {
  this.sqlite.setAuthorizer(rules);
}

/**
 * Rejects extension loading.
 *
 * libsql permits this per call, but `node:sqlite` decides it at construction:
 * without `allowExtension` on the `DatabaseSync`, `enableLoadExtension` throws.
 * Opting every database in to support a call libsql's own dependents don't make
 * would trade real capability for hypothetical fidelity, so this reports the gap
 * directly rather than surfacing node:sqlite's construction-time complaint.
 *
 * @returns {never}
 */
const databaseLoadExtension = () => unsupported('loadExtension()');

/**
 * Rejects replica synchronization.
 *
 * @returns {never}
 */
const databaseSyncSync = () => unsupported('sync()');

/**
 * Rejects replica synchronization.
 *
 * @returns {never}
 */
const databaseSyncUntilSync = () => unsupported('syncUntil()');

/**
 * Reports no replication index, there being no replica.
 *
 * @returns {undefined} Always undefined.
 */
/* eslint-disable-next-line @typescript-eslint/no-empty-function --
   Local databases have no replication index; returning undefined is how libsql
   signals "not a replica". */
const databaseMaxWriteReplicationIndex = () => {};

/**
 * Toggles array rows.
 *
 * Throwing for a statement that returns no columns is load-bearing rather than
 * incidental: `@libsql/client` calls this inside a `try`/`catch` purely to detect
 * whether a statement yields rows, and routes `BEGIN`/`COMMIT`/`INSERT` to
 * `run()` when it throws. Succeeding here sends `BEGIN` down the query path, and
 * the client then fails the batch with `TRANSACTION_CLOSED`.
 *
 * @this {StatementHandle}
 * @param {boolean} raw Whether to return rows as arrays.
 * @returns {void}
 */
function statementRaw(raw) {
  if (this.stmt.columns().length === 0) {
    throw new TypeError('The raw() method is only for statements that return data');
  }
  this.raw = raw;
  this.stmt.setReturnArrays(raw);
}

/**
 * Reports whether the statement returns rows.
 *
 * @this {StatementHandle}
 * @returns {boolean} Whether the statement returns rows.
 */
function statementIsReader() {
  return this.stmt.columns().length > 0;
}

/**
 * Executes the statement and returns its first row.
 *
 * @this {StatementHandle}
 * @param {unknown} [params] Bind parameters.
 * @returns {unknown} First row, or undefined when there are none.
 */
function statementGet(params) {
  return plainRow(this.stmt.get(...bind(params)));
}

/**
 * Executes the statement without returning rows.
 *
 * @this {StatementHandle}
 * @param {unknown} [params] Bind parameters.
 * @returns {{changes: number | bigint, lastInsertRowid: number | bigint}} Write summary.
 */
function statementRun(params) {
  const info = this.stmt.run(...bind(params));
  noteTransaction(this.db, this.sql);

  return info;
}

/**
 * Executes the statement and returns a handle for iterating its rows.
 *
 * @this {StatementHandle}
 * @param {unknown} [params] Bind parameters.
 * @returns {RowsHandle} Handle consumed by {@link rowsNext}.
 */
function statementRowsSync(params) {
  return { index: 0, rows: this.stmt.all(...bind(params)).map(plainRow) };
}

/**
 * @typedef {object} ColumnMetadata
 * @property {string | null} database_name Source database, or null.
 * @property {string | null} decl_type Declared column type, or null.
 * @property {string} name Column name as returned.
 * @property {string | null} origin_name Underlying column name, or null.
 * @property {string | null} table_name Source table, or null.
 */

/**
 * Describes the statement's result columns, renamed to libsql's field names.
 *
 * @this {StatementHandle}
 * @returns {ColumnMetadata[]} Column metadata.
 */
function statementColumns() {
  /* eslint-disable unicorn/no-null --
     libsql reports absent column metadata as null, and callers (drizzle among
     them) compare against it; substituting undefined would change the shape
     this shim exists to reproduce. */
  return this.stmt.columns().map(column => ({
    database_name: column.database ?? null,
    decl_type: column.type ?? null,
    name: column.name,
    origin_name: column.column ?? null,
    table_name: column.table ?? null,
  }));
  /* eslint-enable unicorn/no-null -- Restore for the rest of the module. */
}

/**
 * Sets whether this statement reads integers as BigInt.
 *
 * @this {StatementHandle}
 * @param {boolean} toggle Whether to read integers as BigInt.
 * @returns {void}
 */
function statementSafeIntegers(toggle) {
  this.stmt.setReadBigInts(toggle);
}

/**
 * No-op, for the same reason as {@link databaseInterrupt}.
 *
 * @returns {void}
 */
/* eslint-disable-next-line @typescript-eslint/no-empty-function --
   See databaseInterrupt. */
const statementInterrupt = () => {};

/**
 * Fills the next batch of rows.
 *
 * The wrapper's `iterate()` reuses one fixed-size array and stops at the first
 * falsy slot, so trailing slots must be cleared rather than left holding rows
 * from an earlier batch.
 *
 * @this {RowsHandle}
 * @param {unknown[]} buffer Caller-owned array to fill.
 * @returns {void}
 */
function rowsNext(buffer) {
  for (let slot = 0; slot < buffer.length; slot += 1) {
    const isRemaining = this.index < this.rows.length;
    /* eslint-disable-next-line no-param-reassign --
       Filling the caller's array *is* the contract: libsql's iterate() hands in
       a reused 100-slot buffer and reads the rows back out of it. */
    buffer[slot] = isRemaining ? this.rows[this.index] : undefined;
    if (isRemaining) this.index += 1;
  }
}

module.exports = {
  databaseAuthorizer,
  databaseClose,
  databaseDefaultSafeIntegers,
  databaseExecSync,
  databaseInTransaction,
  databaseInterrupt,
  databaseLoadExtension,
  databaseMaxWriteReplicationIndex,
  databaseOpen,
  databaseOpenWithSync,
  databasePrepareSync,
  databaseSyncSync,
  databaseSyncUntilSync,
  rowsNext,
  statementColumns,
  statementGet,
  statementInterrupt,
  statementIsReader,
  statementRaw,
  statementRowsSync,
  statementRun,
  statementSafeIntegers,
};

/* eslint-enable unicorn/no-this-outside-of-class, unicorn/consistent-boolean-name --
   End of the binding surface. */

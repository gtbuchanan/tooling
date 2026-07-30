/* eslint-disable-next-line n/no-unsupported-features/node-builtins --
   Stale plugin data, not a real gap: eslint-plugin-n records node:sqlite as
   experimental from 22.5.0 with no stabilization entry, so no engines range
   clears it, yet Node emits no ExperimentalWarning for it on the versions this
   package supports. Drop this once the plugin records stabilization. */
import { constants as sqliteConstants } from 'node:sqlite';
import { describe, it } from 'vitest';
import shim from '#src/index.cjs';

/*
 * libsql invokes every native function as `fn.call(handle, ...)`, where the
 * handle is whatever databaseOpen/databasePrepareSync returned. These tests
 * drive the binding the same way, so they exercise the contract libsql
 * actually depends on rather than a friendlier wrapper of our own.
 */
type Database = ReturnType<typeof shim.databaseOpen>;
type Rows = ReturnType<typeof shim.statementRowsSync>;

const openDb = (): Database => {
  const db = shim.databaseOpen(':memory:');
  shim.databaseExecSync.call(db, 'CREATE TABLE t(num INTEGER, txt TEXT)');
  return db;
};

const prepare = (db: Database, sql: string) =>
  shim.databasePrepareSync.call(db, sql);

const insert = (db: Database, num: number, txt: string) =>
  shim.statementRun.call(prepare(db, 'INSERT INTO t VALUES(?,?)'), [num, txt]);

/** Drains a rows handle the way libsql's iterate() does: 100-slot batches. */
const drain = (rows: Rows): unknown[] => {
  const out: unknown[] = [];
  for (;;) {
    const buffer = Array.from({ length: 100 });
    shim.rowsNext.call(rows, buffer);
    const batch = buffer.filter(row => row !== undefined);
    out.push(...batch);
    if (batch.length < buffer.length) return out;
  }
};

describe.concurrent('statement execution', () => {
  it('round-trips inserted rows through the rows iterator', ({ expect }) => {
    const db = openDb();
    insert(db, 1, 'x');
    insert(db, 2, 'y');

    const rows = shim.statementRowsSync.call(prepare(db, 'SELECT * FROM t'), []);

    expect(drain(rows)).toStrictEqual([
      { num: 1, txt: 'x' },
      { num: 2, txt: 'y' },
    ]);
  });

  it('reports changes and lastInsertRowid from run', ({ expect }) => {
    const db = openDb();

    expect(insert(db, 7, 'seven')).toMatchObject({ changes: 1, lastInsertRowid: 1 });
  });

  it('returns the first matching row from get', ({ expect }) => {
    const db = openDb();
    insert(db, 3, 'three');

    const stmt = prepare(db, 'SELECT txt FROM t WHERE num = ?');

    expect(shim.statementGet.call(stmt, [3])).toStrictEqual({ txt: 'three' });
  });

  it('returns undefined from get when nothing matches', ({ expect }) => {
    const db = openDb();

    const stmt = prepare(db, 'SELECT txt FROM t WHERE num = ?');

    expect(shim.statementGet.call(stmt, [404])).toBeUndefined();
  });

  it('binds named parameters passed as an object', ({ expect }) => {
    const db = openDb();
    insert(db, 5, 'five');

    const stmt = prepare(db, 'SELECT txt FROM t WHERE num = :num');

    expect(shim.statementGet.call(stmt, { num: 5 })).toStrictEqual({ txt: 'five' });
  });
});

describe.concurrent('raw mode', () => {
  /*
   * Load-bearing, not incidental: @libsql/client calls raw(true) inside a
   * try/catch purely to decide whether a statement yields rows, routing it to
   * run() when it throws. A shim that succeeds here sends BEGIN down the query
   * path and the client then fails the whole batch with TRANSACTION_CLOSED.
   */
  it('throws for a statement that returns no columns', ({ expect }) => {
    const db = openDb();
    const stmt = prepare(db, 'INSERT INTO t VALUES(1, \'x\')');

    const toggleRaw = () => {
      shim.statementRaw.call(stmt, true);
    };

    expect(toggleRaw).toThrow(TypeError);
  });

  it('does not throw for a statement that returns columns', ({ expect }) => {
    const db = openDb();
    const stmt = prepare(db, 'SELECT * FROM t');

    const toggleRaw = () => {
      shim.statementRaw.call(stmt, true);
    };

    expect(toggleRaw).not.toThrow();
  });

  it('returns to object rows when raw mode is switched back off', ({ expect }) => {
    const db = openDb();
    insert(db, 4, 'four');
    const stmt = prepare(db, 'SELECT num, txt FROM t');
    shim.statementRaw.call(stmt, true);

    shim.statementRaw.call(stmt, false);

    expect(drain(shim.statementRowsSync.call(stmt, [])))
      .toStrictEqual([{ num: 4, txt: 'four' }]);
  });

  it('yields array rows once raw mode is on', ({ expect }) => {
    const db = openDb();
    insert(db, 9, 'nine');
    const stmt = prepare(db, 'SELECT num, txt FROM t');
    shim.statementRaw.call(stmt, true);

    const rows = shim.statementRowsSync.call(stmt, []);

    expect(drain(rows)).toStrictEqual([[9, 'nine']]);
  });
});

describe.concurrent('transaction state', () => {
  /*
   * Both paths matter: libsql's own transaction() issues BEGIN via exec(),
   * while @libsql/client issues it via prepare().run().
   */
  it('tracks a transaction opened through run', ({ expect }) => {
    const db = openDb();

    expect(shim.databaseInTransaction(db)).toBe(false);

    shim.statementRun.call(prepare(db, 'BEGIN DEFERRED'), []);

    expect(shim.databaseInTransaction(db)).toBe(true);
  });

  it('clears the flag on commit', ({ expect }) => {
    const db = openDb();
    shim.statementRun.call(prepare(db, 'BEGIN DEFERRED'), []);

    shim.statementRun.call(prepare(db, 'COMMIT'), []);

    expect(shim.databaseInTransaction(db)).toBe(false);
  });

  it('tracks a transaction opened through exec', ({ expect }) => {
    const db = openDb();

    shim.databaseExecSync.call(db, 'BEGIN');

    expect(shim.databaseInTransaction(db)).toBe(true);
  });

  it('clears the flag on rollback through exec', ({ expect }) => {
    const db = openDb();
    shim.databaseExecSync.call(db, 'BEGIN');

    shim.databaseExecSync.call(db, 'ROLLBACK');

    expect(shim.databaseInTransaction(db)).toBe(false);
  });
});

describe.concurrent('metadata', () => {
  it('maps column metadata to libsql field names', ({ expect }) => {
    const db = openDb();

    const stmt = prepare(db, 'SELECT num FROM t');

    expect(shim.statementColumns.call(stmt)).toStrictEqual([
      {
        database_name: 'main',
        decl_type: 'INTEGER',
        name: 'num',
        origin_name: 'num',
        table_name: 't',
      },
    ]);
  });

  /* An expression column has no source database, table, or origin column. */
  it('reports absent column metadata as null', ({ expect }) => {
    const db = openDb();

    const stmt = prepare(db, 'SELECT 1 AS one');

    /* eslint-disable unicorn/no-null --
       Asserting the shape libsql actually reports; see statementColumns. */
    expect(shim.statementColumns.call(stmt)).toStrictEqual([
      {
        database_name: null,
        decl_type: null,
        name: 'one',
        origin_name: null,
        table_name: null,
      },
    ]);
    /* eslint-enable unicorn/no-null -- Restore for the rest of the suite. */
  });

  it('reports whether a statement returns data', ({ expect }) => {
    const db = openDb();

    expect(shim.statementIsReader.call(prepare(db, 'SELECT * FROM t'))).toBe(true);
    expect(shim.statementIsReader.call(prepare(db, 'DELETE FROM t'))).toBe(false);
  });

  it('reads integers as BigInt once safe integers are on', ({ expect }) => {
    const db = openDb();
    insert(db, 42, 'answer');
    const stmt = prepare(db, 'SELECT num FROM t');

    shim.statementSafeIntegers.call(stmt, true);

    expect(shim.statementGet.call(stmt, [])).toStrictEqual({ num: 42n });
  });
});

describe.concurrent('connection lifecycle', () => {
  it('treats an empty path as an in-memory database', ({ expect }) => {
    const db = shim.databaseOpen('');

    shim.databaseExecSync.call(db, 'CREATE TABLE t(num INTEGER)');

    expect(shim.statementIsReader.call(prepare(db, 'SELECT num FROM t'))).toBe(true);
  });

  it('closes the connection', ({ expect }) => {
    const db = openDb();

    shim.databaseClose.call(db);

    expect(() => prepare(db, 'SELECT 1')).toThrow(/database is not open/v);
  });

  it('applies database-level safe integers to later statements', ({ expect }) => {
    const db = openDb();
    insert(db, 8, 'eight');

    shim.databaseDefaultSafeIntegers.call(db, true);

    expect(shim.statementGet.call(prepare(db, 'SELECT num FROM t'), []))
      .toStrictEqual({ num: 8n });
  });

  it('installs an authorizer that can deny access', ({ expect }) => {
    const db = openDb();

    shim.databaseAuthorizer.call(db, () => sqliteConstants.SQLITE_DENY);

    expect(() => shim.statementGet.call(prepare(db, 'SELECT num FROM t'), []))
      .toThrow(/not authorized/v);
  });

  it('accepts a statement invoked without bind parameters', ({ expect }) => {
    const db = openDb();
    insert(db, 6, 'six');

    const stmt = prepare(db, 'SELECT num FROM t');

    expect(shim.statementGet.call(stmt)).toStrictEqual({ num: 6 });
  });
});

describe.concurrent('unsupported operations', () => {
  it('rejects embedded replicas', ({ expect }) => {
    expect(() => shim.databaseOpenWithSync()).toThrow(/native libsql binding/v);
  });

  it('rejects sync', ({ expect }) => {
    const db = openDb();

    expect(() => shim.databaseSyncSync.call(db)).toThrow(/native libsql binding/v);
  });

  it('rejects syncUntil', ({ expect }) => {
    const db = openDb();

    expect(() => shim.databaseSyncUntilSync.call(db)).toThrow(/native libsql binding/v);
  });

  /*
   * node:sqlite gates extension loading at construction, so the shim cannot
   * honor libsql's per-call form. Reporting that beats surfacing node:sqlite's
   * construction-time error from an unrelated-looking call.
   */
  it('rejects extension loading', ({ expect }) => {
    const db = openDb();

    expect(() => shim.databaseLoadExtension.call(db))
      .toThrow(/native libsql binding/v);
  });

  it('reports no replication index', ({ expect }) => {
    const db = openDb();

    /* eslint-disable-next-line @typescript-eslint/no-confusing-void-expression --
       The shim returns nothing here by design; asserting that is the point. */
    const index = shim.databaseMaxWriteReplicationIndex.call(db);

    expect(index).toBeUndefined();
  });
});

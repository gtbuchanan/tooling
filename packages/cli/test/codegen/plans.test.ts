import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { reportFindings, syncPlans } from '#src/codegen/plans.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import type { Plan } from '#src/tasks/toolchain.js';
import { capabilities } from '#src/toolchains/index.js';
import { captureLogger, createTempDir, writeJson } from '#test/helpers.js';

const readOrUndefined = (filePath: string): string | undefined =>
  (existsSync(filePath) ? readFileSync(filePath, 'utf8') : undefined);

/*
 * A plan that plans `content` into `filePath` until the file holds it,
 * as a real plan only writes what would change.
 */
const writing = (filePath: string, content: string): Plan => () =>
  (readOrUndefined(filePath) === content
    ? []
    : [{ changes: ['creates it'], content, kind: 'write', path: filePath }]);

const handEdit: Plan = () => [{ kind: 'problem', message: 'out.txt: hand-edit this' }];

const createRoot = (): string => {
  const root = createTempDir();
  writeJson(root, 'package.json', { name: 'root' });
  return root;
};

const discoverAt = (root: string) => () => discoverWorkspace({ capabilities, cwd: root });

describe.concurrent(reportFindings, () => {
  it('prefixes each change with its path and names the sync once', ({ expect }) => {
    expect(reportFindings([
      { changes: ['adds a', 'adds b'], content: '', kind: 'write', path: 'one.json' },
      { kind: 'problem', message: 'two.json: hand-edit this' },
      { changes: ['adds c'], content: '', kind: 'write', path: 'three.json' },
    ])).toStrictEqual([
      'one.json: adds a',
      'one.json: adds b',
      'two.json: hand-edit this',
      'three.json: adds c',
      'run gtb sync to apply these changes',
    ]);
  });

  it('names no sync when only problems remain', ({ expect }) => {
    expect(reportFindings([{ kind: 'problem', message: 'two.json: hand-edit this' }]))
      .toStrictEqual(['two.json: hand-edit this']);
  });
});

describe.concurrent(syncPlans, () => {
  it('writes each planned file and logs its changes', ({ expect }) => {
    const root = createRoot();
    const filePath = path.join(root, 'out.txt');
    const { logger, out } = captureLogger();

    syncPlans([writing(filePath, 'content')], {
      discover: discoverAt(root), discovery: discoverAt(root)(), force: false, logger,
    });

    expect(readOrUndefined(filePath)).toBe('content');
    expect(out()).toBe(`wrote ${filePath}\n  creates it\n`);
  });

  /*
   * A write can change what discovery finds, such as a tsconfig giving a
   * package the typescript capability, and a plan reading the stale
   * discovery would miss what follows from it until the next sync.
   */
  it('re-plans against fresh discovery until a pass writes nothing', ({ expect }) => {
    const root = createRoot();
    const first = path.join(root, 'first.txt');
    const second = path.join(root, 'second.txt');
    let wasFirstDiscovered = false;
    const discover = () => {
      wasFirstDiscovered = existsSync(first);
      return discoverAt(root)();
    };
    const followsFirst: Plan = () => (wasFirstDiscovered && !existsSync(second)
      ? [{ changes: ['follows first'], content: 'second', kind: 'write', path: second }]
      : []);
    const { logger } = captureLogger();

    syncPlans([followsFirst, writing(first, 'first')], {
      discover, discovery: discover(), force: false, logger,
    });

    expect(readOrUndefined(second)).toBe('second');
  });

  it('throws when the plans never settle', ({ expect }) => {
    const root = createRoot();
    const filePath = path.join(root, 'out.txt');
    const restless: Plan = () => [
      { changes: ['rewrites it'], content: 'same', kind: 'write', path: filePath },
    ];
    const { logger } = captureLogger();

    expect(() => {
      syncPlans([restless], {
        discover: discoverAt(root), discovery: discoverAt(root)(), force: false, logger,
      });
    }).toThrow(filePath);
  });

  it('hands each plan the force flag and no ignored names', ({ expect }) => {
    const root = createRoot();
    const seen: { force: boolean; ignored: ReadonlySet<string> }[] = [];
    const { logger } = captureLogger();

    const recording: Plan = ({ force, ignored }) => {
      seen.push({ force, ignored });
      return [];
    };

    syncPlans([recording], {
      discover: discoverAt(root), discovery: discoverAt(root)(), force: true, logger,
    });

    expect(seen).toStrictEqual([{ force: true, ignored: new Set() }]);
  });

  it('creates the directories a planned file needs', ({ expect }) => {
    const root = createRoot();
    const filePath = path.join(root, 'nested', 'deeper', 'out.txt');
    const { logger } = captureLogger();

    syncPlans([writing(filePath, 'content')], {
      discover: discoverAt(root), discovery: discoverAt(root)(), force: false, logger,
    });

    expect(readOrUndefined(filePath)).toBe('content');
  });

  /*
   * Two plans writing one file would overwrite each other on every pass, so
   * the loop would report a plan that never settles rather than the clash.
   */
  it('throws when two plans write the same file in one pass', ({ expect }) => {
    const root = createRoot();
    const filePath = path.join(root, 'out.txt');
    const { logger } = captureLogger();

    expect(() => {
      syncPlans([writing(filePath, 'first'), writing(filePath, 'second')], {
        discover: discoverAt(root), discovery: discoverAt(root)(), force: false, logger,
      });
    }).toThrow(/more than one plan writes .*out\.txt/v);
  });

  it('plans the first pass from the discovery it was given', ({ expect }) => {
    const root = createRoot();
    let discoveries = 0;
    const discover = () => {
      discoveries += 1;
      return discoverAt(root)();
    };
    const { logger } = captureLogger();

    syncPlans([() => []], {
      discover, discovery: discoverAt(root)(), force: false, logger,
    });

    expect(discoveries).toBe(0);
  });

  it('returns the problems the settled pass finds', ({ expect }) => {
    const root = createRoot();
    const filePath = path.join(root, 'out.txt');
    const { logger } = captureLogger();

    expect(syncPlans([writing(filePath, 'content'), handEdit], {
      discover: discoverAt(root), discovery: discoverAt(root)(), force: false, logger,
    })).toStrictEqual(['out.txt: hand-edit this']);
  });
});

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import {
  type CatalogGateDeps,
  changesetCheckCommand,
  checkCatalogGate,
  readBaseWorkspace,
  runChangesetCheck,
} from '#src/commands/root/changeset.js';
import {
  catalogOf,
  createCatalogWorkspace,
  depsFor,
  depsShowing,
  fail,
  ok,
  publishedConsumer,
  recordingDeps,
} from './changeset-check.helpers.ts';
import { captureLogger, createTempDir, writeJson } from './helpers.ts';

describe.concurrent(checkCatalogGate, () => {
  it('reports a published consumer of a re-ranged entry', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const drift = checkCatalogGate({
      baseWorkspace: catalogOf(dependency, '^1.0.0'),
      changesetSources: [],
      headWorkspace: catalogOf(dependency, '^2.0.0'),
      ignored: new Set(),
      packages: [publishedConsumer(packageName, dependency)],
    });

    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain(packageName);
    expect(drift[0]).toContain(dependency);
  });

  it('reports nothing when the catalog is untouched', ({ expect }) => {
    const dependency = build.packageName();
    const source = catalogOf(dependency, '^1.0.0');

    const drift = checkCatalogGate({
      baseWorkspace: source,
      changesetSources: [],
      headWorkspace: source,
      ignored: new Set(),
      packages: [publishedConsumer(build.scopedPackageName(), dependency)],
    });

    expect(drift).toStrictEqual([]);
  });

  it('accepts a changeset naming the affected package', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const drift = checkCatalogGate({
      baseWorkspace: catalogOf(dependency, '^1.0.0'),
      changesetSources: [`---\n'${packageName}': patch\n---\n\nBump it\n`],
      headWorkspace: catalogOf(dependency, '^2.0.0'),
      ignored: new Set(),
      packages: [publishedConsumer(packageName, dependency)],
    });

    expect(drift).toStrictEqual([]);
  });

  /*
   * An empty changeset is the documented way to say "no release", which is
   * exactly the claim this gate exists to challenge.
   */
  it('rejects an empty changeset as coverage', ({ expect }) => {
    const dependency = build.packageName();
    const packageName = build.scopedPackageName();

    const drift = checkCatalogGate({
      baseWorkspace: catalogOf(dependency, '^1.0.0'),
      changesetSources: ['---\n---\n\nUpdate CI workflow\n'],
      headWorkspace: catalogOf(dependency, '^2.0.0'),
      ignored: new Set(),
      packages: [publishedConsumer(packageName, dependency)],
    });

    expect(drift).toHaveLength(1);
  });

  it('accepts a changeset for one package while flagging another', ({ expect }) => {
    const dependency = build.packageName();
    const covered = build.scopedPackageName();
    const uncovered = build.scopedPackageName();

    const drift = checkCatalogGate({
      baseWorkspace: catalogOf(dependency, '^1.0.0'),
      changesetSources: [`---\n'${covered}': patch\n---\n\nBump it\n`],
      headWorkspace: catalogOf(dependency, '^2.0.0'),
      ignored: new Set(),
      packages: [
        publishedConsumer(covered, dependency),
        publishedConsumer(uncovered, dependency),
      ],
    });

    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain(uncovered);
  });
});

describe.concurrent(readBaseWorkspace, () => {
  it('returns the base revision of the workspace file', async ({ expect }) => {
    const source = catalogOf(build.packageName(), '^1.0.0');
    const deps = depsFor({
      'ls-tree': ok('pnpm-workspace.yaml'),
      'rev-parse': ok('abc123'),
      'show': ok(source),
    });

    const result = await readBaseWorkspace('origin/main', '/repo', deps);

    expect(result).toBe(source);
  });

  it('treats a base predating the file as having no catalogs', async ({ expect }) => {
    const deps = depsFor({
      'ls-tree': ok(''),
      'rev-parse': ok('abc123'),
    });

    const result = await readBaseWorkspace('origin/main', '/repo', deps);

    expect(result).toBe('');
  });

  /*
   * The absent-file and unreadable-object cases must not collapse: only the
   * first may answer `''`, or a corrupt base silently reports every catalog
   * entry as newly added.
   */
  it('throws when the historical file lookup itself fails', async ({ expect }) => {
    const deps = depsFor({
      'ls-tree': fail('fatal: not a tree object'),
      'rev-parse': ok('abc123'),
    });

    await expect(readBaseWorkspace('origin/main', '/repo', deps))
      .rejects.toThrow('not a tree object');
  });

  it('throws naming the base ref when it cannot be resolved', async ({ expect }) => {
    const base = 'origin/nope';
    const deps = depsFor({ 'rev-parse': fail('unknown revision') });

    await expect(readBaseWorkspace(base, '/repo', deps)).rejects.toThrow(base);
  });

  /*
   * Folding a git failure into the empty-base answer would report every
   * catalog entry in the workspace as newly added.
   */
  it('throws rather than reporting an empty catalog when show fails', async ({ expect }) => {
    const deps = depsFor({
      'ls-tree': ok('pnpm-workspace.yaml'),
      'rev-parse': ok('abc123'),
      'show': fail('corrupt object'),
    });

    await expect(readBaseWorkspace('origin/main', '/repo', deps)).rejects.toThrow('corrupt object');
  });
});

describe.concurrent(runChangesetCheck, () => {
  it('flags an uncovered catalog change in a real workspace', async ({ expect }) => {
    const workspace = createCatalogWorkspace();

    const drift = await runChangesetCheck(
      { cwd: workspace.root },
      depsShowing(workspace.baseWorkspace),
    );

    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain(workspace.packageName);
  });

  /*
   * Without `-C`, git reads the process working directory while the rest of
   * the gate reads the discovered root — so a `--cwd` elsewhere would diff two
   * unrelated workspaces and report every catalog entry as newly added.
   */
  it('runs every git command against the discovered workspace root', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const deps = recordingDeps(workspace.baseWorkspace);

    await runChangesetCheck({ cwd: workspace.root }, deps);

    const prefixes = deps.calls.map(args => args.slice(0, 2));

    expect(prefixes.length).toBeGreaterThan(0);
    expect(prefixes).toStrictEqual(
      prefixes.map(() => ['-C', workspace.root]),
    );
  });

  it('runs changeset status against the same base ref', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const deps = recordingDeps(workspace.baseWorkspace);
    const base = 'origin/release';

    await runChangesetCheck({ base, cwd: workspace.root }, deps);

    expect(deps.spawned).toStrictEqual([
      {
        command: 'pnpm',
        options: {
          args: ['exec', 'changeset', 'status', `--since=${base}`],
          cwd: workspace.root,
        },
      },
    ]);
  });

  /*
   * With no changesets at all, every catalog finding would be uncovered too,
   * so the stock gate's failure subsumes this one rather than doubling it.
   */
  it('fails without diffing the catalog when changeset status fails', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const gitCalls: string[][] = [];
    const deps: CatalogGateDeps = {
      execute: (_command, args) => {
        gitCalls.push([...args]);

        return Promise.resolve(ok(''));
      },
      run: () => Promise.reject(new Error('exited with code 1')),
    };

    await expect(runChangesetCheck({ cwd: workspace.root }, deps))
      .rejects.toThrow('changeset status');
    expect(gitCalls).toStrictEqual([]);
  });

  it('reads a pending changeset off disk as coverage', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    writeFileSync(
      path.join(workspace.root, '.changeset', 'cover.md'),
      `---\n'${workspace.packageName}': patch\n---\n\nBump\n`,
    );

    const drift = await runChangesetCheck(
      { cwd: workspace.root },
      depsShowing(workspace.baseWorkspace),
    );

    expect(drift).toStrictEqual([]);
  });

  it('skips a package the changesets config ignores', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    writeJson(path.join(workspace.root, '.changeset'), 'config.json', {
      ignore: [workspace.packageName],
    });

    const drift = await runChangesetCheck(
      { cwd: workspace.root },
      depsShowing(workspace.baseWorkspace),
    );

    expect(drift).toStrictEqual([]);
  });

  /*
   * A repo with no catalog, no `.changeset` directory, and no changesets
   * config is a valid consumer of this reusable workflow — it must no-op
   * rather than throw on the missing files.
   */
  it('no-ops on a bare directory with none of the files it reads', async ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', { name: build.packageName(), private: true });

    const drift = await runChangesetCheck({ cwd: root }, depsShowing(''));

    expect(drift).toStrictEqual([]);
  });

  it('skips a package passed through the ignored option', async ({ expect }) => {
    const workspace = createCatalogWorkspace();

    const drift = await runChangesetCheck(
      { cwd: workspace.root, ignored: new Set([workspace.packageName]) },
      depsShowing(workspace.baseWorkspace),
    );

    expect(drift).toStrictEqual([]);
  });
});

describe.concurrent(changesetCheckCommand, () => {
  it('exits zero and reports the pass on a clean workspace', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const captured = captureLogger();

    const exitCode = await changesetCheckCommand(
      [],
      { cwd: workspace.root },
      captured.logger,
      // Base identical to HEAD, so nothing changed.
      depsShowing(catalogOf(workspace.dependency, '^2.0.0')),
    );

    expect(exitCode).toBe(0);
    expect(captured.out()).toContain('no uncovered catalog changes');
  });

  it('exits non-zero and reports the drift plus a remedy', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const captured = captureLogger();

    const exitCode = await changesetCheckCommand(
      [],
      { cwd: workspace.root },
      captured.logger,
      depsShowing(workspace.baseWorkspace),
    );

    expect(exitCode).toBe(1);
    expect(captured.err()).toContain(workspace.packageName);
    expect(captured.err()).toContain('changeset --empty');
  });

  it('reports a hard failure as a non-zero exit, not a rejection', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const captured = captureLogger();
    const deps: CatalogGateDeps = {
      execute: () => Promise.resolve(ok('')),
      run: () => Promise.reject(new Error('exited with code 1')),
    };

    const exitCode = await changesetCheckCommand(
      [], { cwd: workspace.root }, captured.logger, deps,
    );

    expect(exitCode).toBe(1);
    expect(captured.err()).toContain('changeset status');
  });

  it('honors a --ignore flag from raw args', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const captured = captureLogger();

    const exitCode = await changesetCheckCommand(
      ['--ignore', workspace.packageName],
      { cwd: workspace.root },
      captured.logger,
      depsShowing(workspace.baseWorkspace),
    );

    expect(exitCode).toBe(0);
  });
});

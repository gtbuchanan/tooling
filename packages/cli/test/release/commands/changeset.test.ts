import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import {
  type CatalogGateDeps,
  changesetCheckCommand,
  checkCatalogGate,
  runChangesetCheck,
} from '#src/release/commands/changeset.js';
import { captureLogger, createTempDir, writeJson } from '#test/helpers.js';
import {
  catalogOf,
  createCatalogWorkspace,
  depsShowing,
  ok,
  publishedConsumer,
  recordingDeps,
} from '#test/release/commands/fixtures.js';

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

  /*
   * Changesets resolves `ignore` entries as globs against the workspace's
   * package names, so an exact-name lookup would demand a changeset for a
   * package no changeset can release.
   */
  it('skips a package a changesets config glob ignores', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const [scope = ''] = workspace.packageName.split('/', 1);
    writeJson(path.join(workspace.root, '.changeset'), 'config.json', {
      ignore: [`${scope}/*`],
    });

    const drift = await runChangesetCheck(
      { cwd: workspace.root },
      depsShowing(workspace.baseWorkspace),
    );

    expect(drift).toStrictEqual([]);
  });

  /*
   * Only an absent path earns the empty default. An unreadable one hides the
   * changesets that would have covered the change, or the catalog itself.
   */
  it('throws when the changesets directory is unreadable', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const changesetDir = path.join(workspace.root, '.changeset');
    rmSync(changesetDir, { recursive: true });
    writeFileSync(changesetDir, '');

    await expect(runChangesetCheck(
      { cwd: workspace.root },
      depsShowing(workspace.baseWorkspace),
    )).rejects.toThrow('ENOTDIR');
  });

  it('throws when the head workspace file is unreadable', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const workspaceFile = path.join(workspace.root, 'pnpm-workspace.yaml');
    rmSync(workspaceFile);
    mkdirSync(workspaceFile);

    await expect(runChangesetCheck(
      { cwd: workspace.root },
      depsShowing(workspace.baseWorkspace),
    )).rejects.toThrow('EISDIR');
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
    expect(captured.err()).toContain('add a changeset that releases');
  });

  /*
   * The gate deliberately refuses an empty changeset as coverage, so a remedy
   * offering one sends the author straight back into the same failure.
   */
  it('offers no remedy the gate itself rejects', async ({ expect }) => {
    const workspace = createCatalogWorkspace();
    const captured = captureLogger();

    await changesetCheckCommand(
      [],
      { cwd: workspace.root },
      captured.logger,
      depsShowing(workspace.baseWorkspace),
    );

    expect(captured.err()).not.toContain('--empty');
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

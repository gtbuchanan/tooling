import path from 'node:path';
import * as v from 'valibot';
import {
  forbiddenRootScripts, generatePackageScripts, generateRootScripts,
} from '#src/codegen/turbo-config.js';
import { type WorkspaceDiscovery, isGtbBuild } from '#src/core/discovery.js';
import { jsonContent, readJsonFile, sortKeysDeep } from '#src/core/file-writer.js';
import { ManifestSchema } from '#src/core/manifest.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';

/*
What a script needs, or nothing when it already holds what it should. Without
force an existing value is the author's, so only a missing script changes.
*/
const scriptChange = (
  existing: Readonly<Record<string, string>>,
  name: string,
  value: string,
  isForce: boolean,
): string | undefined => {
  if (!Object.hasOwn(existing, name)) {
    return `missing script '${name}'`;
  }

  return isForce && existing[name] !== value ? `script '${name}' should be '${value}'` : undefined;
};

const planManifestScripts = (
  dir: string,
  expected: Readonly<Record<string, string>>,
  { force, ignored }: PlanContext,
): readonly Finding[] => {
  const filePath = path.join(dir, 'package.json');
  /*
  Rewrites the raw object rather than the parsed one, since the schema
  reorders keys and package.json has a conventional order.
  */
  const raw = readJsonFile(filePath);
  const existing = v.parse(ManifestSchema, raw).scripts ?? {};
  const changed = Object.entries(expected)
    .filter(([name]) => !ignored.has(name))
    .flatMap(([name, value]) => {
      const change = scriptChange(existing, name, value, force);
      return change === undefined ? [] : { change, name, value };
    });
  const [first, ...rest] = changed.map(({ change }) => change);
  if (first === undefined) {
    return [];
  }
  const scripts = {
    ...existing,
    ...Object.fromEntries(changed.map(({ name, value }) => [name, value])),
  };

  return [{
    changes: [first, ...rest],
    content: jsonContent({ ...raw, scripts: sortKeysDeep(scripts) }),
    kind: 'write',
    path: filePath,
  }];
};

/**
 * Flags root scripts that shadow a turbo aggregate. Only single-package repos
 * can hit this, as `forbiddenRootScripts` explains. The fix is deleting the
 * script, which no sync does, so each is a problem rather than a write.
 */
const planShadowedAggregates = (
  discovery: WorkspaceDiscovery,
  ignored: ReadonlySet<string>,
): readonly Finding[] => {
  const forbidden = forbiddenRootScripts(discovery).filter(name => !ignored.has(name));
  if (forbidden.length === 0) {
    return [];
  }
  const scripts = v.parse(ManifestSchema, readJsonFile(
    path.join(discovery.rootDir, 'package.json'),
  )).scripts ?? {};

  return forbidden
    .filter(name => Object.hasOwn(scripts, name))
    .map(name => ({
      kind: 'problem',
      message: `${discovery.rootDir}: script '${name}' shadows the turbo task of the ` +
        `same name — delete it and run 'gtb turbo run ${name}' instead`,
    }));
};

interface ScriptTarget {
  readonly dir: string;
  readonly scripts: Readonly<Record<string, string>>;
}

const mergeScripts = (targets: readonly ScriptTarget[]): Record<string, string> =>
  Object.fromEntries(targets.flatMap(({ scripts }) => Object.entries(scripts)));

/**
 * The `package.json` scripts every package and the root run their tasks
 * through. A repo that doesn't build with gtb gets none.
 */
export const planScripts = (context: PlanContext): readonly Finding[] => {
  const { discovery, ignored } = context;
  if (!isGtbBuild(discovery)) {
    return [];
  }
  const targets: readonly ScriptTarget[] = [
    ...discovery.packages.map(pkg => ({
      dir: pkg.dir,
      scripts: generatePackageScripts(pkg, discovery.cli),
    })),
    { dir: discovery.rootDir, scripts: generateRootScripts(discovery) },
  ];
  // A single-package root is also its package, and one file takes one write
  const byDir = Map.groupBy(targets, ({ dir }) => dir);

  return [
    ...[...byDir].flatMap(([dir, group]) =>
      planManifestScripts(dir, mergeScripts(group), context)),
    ...planShadowedAggregates(discovery, ignored),
  ];
};

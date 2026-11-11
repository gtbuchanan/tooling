import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import * as v from 'valibot';
import { describe, it } from 'vitest';
import { planScripts } from '#src/codegen/plan-scripts.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import { StringRecord } from '#src/core/schemas.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';
import { capabilities } from '#src/toolchains/index.js';
import { createTempDir, writeJson } from '#test/helpers.js';

interface Root {
  readonly manifestPath: string;
  readonly name: string;
  readonly root: string;
}

/**
 * A single-package root that lints with eslint-config, so its scripts include
 * `lint:eslint`.
 */
const createRoot = (
  scripts: Record<string, string> = {},
  hasCliDependency = true,
): Root => {
  const root = createTempDir();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'linkWorkspacePackages: true\n');
  mkdirSync(path.join(root, 'src'));
  const name = build.scopedPackageName();
  writeJson(root, 'package.json', {
    devDependencies: {
      ...(hasCliDependency && { '@gtbuchanan/cli': build.semverRange() }),
      '@gtbuchanan/eslint-config': build.semverRange(),
    },
    name,
    scripts,
  });

  return { manifestPath: path.join(root, 'package.json'), name, root };
};

/**
 * A monorepo whose one package lints with eslint-config, so the root carries
 * the `check` alias.
 */
const createMonorepo = (): Root => {
  const root = createTempDir();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  const name = build.packageName();
  writeJson(root, 'package.json', {
    devDependencies: { '@gtbuchanan/cli': build.semverRange() },
    name,
    private: true,
  });
  const pkgDir = path.join(root, 'packages', build.packageName());
  mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
  writeJson(pkgDir, 'package.json', {
    devDependencies: { '@gtbuchanan/eslint-config': build.semverRange() },
    name: build.scopedPackageName(),
  });

  return { manifestPath: path.join(root, 'package.json'), name, root };
};

const plan = (root: string, options: Partial<PlanContext> = {}): readonly Finding[] =>
  planScripts({
    discovery: discoverWorkspace({ capabilities, cwd: root }),
    force: false,
    ignored: new Set(),
    ...options,
  });

const ManifestSchema = v.looseObject({ name: v.string(), scripts: StringRecord });

const parseManifest = (content: string): v.InferOutput<typeof ManifestSchema> =>
  v.parse(ManifestSchema, JSON.parse(content));

const writeTo = (findings: readonly Finding[], filePath: string) => {
  const write = findings.find(finding => finding.kind === 'write' && finding.path === filePath);
  return write?.kind === 'write'
    ? { changes: write.changes, manifest: parseManifest(write.content) }
    : undefined;
};

describe.concurrent(planScripts, () => {
  it('adds a missing script and keeps the manifest\'s other content', ({ expect }) => {
    const custom = build.packageName();
    const { manifestPath, name, root } = createRoot({ custom });

    const write = writeTo(plan(root), manifestPath);

    expect(write?.changes).toContain("missing script 'lint:eslint'");
    expect(write?.manifest).toMatchObject({
      name,
      scripts: { custom, 'lint:eslint': 'gtb task lint:eslint' },
    });
  });

  it('keeps an existing script value without force', ({ expect }) => {
    const custom = build.packageName();
    const { manifestPath, root } = createRoot({ 'lint:eslint': custom });

    const write = writeTo(plan(root), manifestPath);

    expect(write?.changes).not.toContain("missing script 'lint:eslint'");
    expect(write?.manifest.scripts).toHaveProperty('lint:eslint', custom);
  });

  it('overwrites a differing script value with force', ({ expect }) => {
    const { manifestPath, root } = createRoot({ 'lint:eslint': build.packageName() });

    const write = writeTo(plan(root, { force: true }), manifestPath);

    expect(write?.changes).toContain("script 'lint:eslint' should be 'gtb task lint:eslint'");
    expect(write?.manifest.scripts).toHaveProperty('lint:eslint', 'gtb task lint:eslint');
  });

  it('plans nothing once its writes are applied', ({ expect }) => {
    const { manifestPath, root } = createRoot();
    const findings = plan(root);
    for (const finding of findings) {
      if (finding.kind === 'write') {
        writeFileSync(finding.path, finding.content);
      }
    }

    expect(writeTo(findings, manifestPath)?.changes).toContain("missing script 'lint:eslint'");
    expect(writeTo(plan(root, { force: true }), manifestPath)).toBeUndefined();
  });

  it('leaves an ignored script out', ({ expect }) => {
    const { manifestPath, root } = createRoot();

    const write = writeTo(plan(root, { ignored: new Set(['lint:eslint']) }), manifestPath);

    expect(write?.changes).not.toContain("missing script 'lint:eslint'");
    expect(write?.manifest.scripts).not.toHaveProperty('lint:eslint');
  });

  it('requires the monorepo root\'s turbo aliases', ({ expect }) => {
    const { manifestPath, root } = createMonorepo();

    const write = writeTo(plan(root), manifestPath);

    expect(write?.changes).toContain("missing script 'check'");
    expect(write?.manifest.scripts).toHaveProperty('check', 'gtb turbo run check');
  });

  it('reports a single-package root script shadowing a turbo aggregate', ({ expect }) => {
    const { root } = createRoot({ check: 'gtb turbo run check' });

    expect(plan(root).filter(({ kind }) => kind === 'problem')).toStrictEqual([{
      kind: 'problem',
      message: `${root}: script 'check' shadows the turbo task of the same name — ` +
        "delete it and run 'gtb turbo run check' instead",
    }]);
  });

  it('plans nothing in a repo that does not build with gtb', ({ expect }) => {
    const { root } = createRoot({}, false);

    expect(plan(root)).toStrictEqual([]);
  });
});

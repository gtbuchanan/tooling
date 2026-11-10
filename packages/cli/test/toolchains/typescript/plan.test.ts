import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverWorkspace } from '#src/core/discovery.js';
import { readJsonFile } from '#src/core/file-writer.js';
import type { Finding } from '#src/tasks/toolchain.js';
import { capabilities } from '#src/toolchains/index.js';
import { planTsconfigFiles } from '#src/toolchains/typescript/plan.js';
import { createTempDir, writeJson } from '#test/helpers.js';

const plan = (root: string): readonly Finding[] => planTsconfigFiles({
  discovery: discoverWorkspace({ capabilities, cwd: root }),
  force: false,
  ignored: new Set(),
});

/*
Writes what the plan finds, as one sync pass would.
*/
const applyPlan = (root: string): void => {
  for (const finding of plan(root)) {
    if (finding.kind === 'write') {
      writeFileSync(finding.path, finding.content);
    }
  }
};

const writeOf = (findings: readonly Finding[], filePath: string) =>
  findings.find(finding => finding.kind === 'write' && finding.path === filePath);

const parsedContent = (findings: readonly Finding[], filePath: string): unknown => {
  const finding = writeOf(findings, filePath);
  return finding?.kind === 'write' ? JSON.parse(finding.content) : undefined;
};

interface Project {
  readonly pkgDir: string;
  readonly root: string;
}

/**
 * A monorepo whose root depends on the CLI and holds one TypeScript package,
 * with every config still to be written.
 */
const createProject = (): Project => {
  const root = createTempDir();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(root, 'package.json', {
    devDependencies: { '@gtbuchanan/cli': build.semverRange() },
    name: build.packageName(),
    private: true,
  });
  const pkgDir = path.join(root, 'packages', build.packageName());
  mkdirSync(pkgDir, { recursive: true });
  writeJson(pkgDir, 'package.json', {
    devDependencies: { '@gtbuchanan/tsconfig': build.semverRange() },
    name: build.scopedPackageName(),
    private: true,
  });

  return { pkgDir, root };
};

describe.concurrent(planTsconfigFiles, () => {
  it('plans nothing for a root that does not depend on the CLI', ({ expect }) => {
    const { root } = createProject();
    writeJson(root, 'package.json', { name: build.packageName(), private: true });

    expect(plan(root)).toStrictEqual([]);
  });

  it('plans nothing for a workspace holding no TypeScript', ({ expect }) => {
    const { pkgDir, root } = createProject();
    writeJson(pkgDir, 'package.json', { name: build.scopedPackageName(), private: true });

    expect(plan(root)).toStrictEqual([]);
  });

  /*
   * A root's own tsconfig is what gives it the typescript capability, so a
   * root holding TypeScript files without one has to be planned on its
   * sources.
   */
  it('plans the root configs for TypeScript sources at the root alone', ({ expect }) => {
    const { pkgDir, root } = createProject();
    writeJson(pkgDir, 'package.json', { name: build.scopedPackageName(), private: true });
    writeFileSync(path.join(root, 'eslint.config.ts'), '');

    expect(writeOf(plan(root), path.join(root, 'tsconfig.json')))
      .toMatchObject({ changes: ['missing'] });
  });

  it('scaffolds a missing base extending the node variant', ({ expect }) => {
    const { root } = createProject();
    const basePath = path.join(root, 'tsconfig.base.json');

    const findings = plan(root);

    expect(writeOf(findings, basePath)).toMatchObject({ changes: ['missing'] });
    expect(parsedContent(findings, basePath))
      .toStrictEqual({ extends: ['@gtbuchanan/tsconfig/node.json'] });
  });

  it('reports a base path that is not a file as a problem', ({ expect }) => {
    const { root } = createProject();
    mkdirSync(path.join(root, 'tsconfig.base.json'));

    expect(plan(root)).toContainEqual({
      kind: 'problem',
      message: `${path.join(root, 'tsconfig.base.json')}: not a file — remove it so ` +
        'gtb sync can scaffold the base',
    });
  });

  it('writes a missing package tsconfig', ({ expect }) => {
    const { pkgDir, root } = createProject();
    const filePath = path.join(pkgDir, 'tsconfig.json');

    expect(writeOf(plan(root), filePath)).toMatchObject({ changes: ['missing'] });
  });

  it('plans nothing once every config is written', ({ expect }) => {
    const { root } = createProject();
    applyPlan(root);

    expect(plan(root)).toStrictEqual([]);
  });

  it('names each owned field that drifted', ({ expect }) => {
    const { pkgDir, root } = createProject();
    applyPlan(root);
    const filePath = path.join(pkgDir, 'tsconfig.json');
    writeJson(pkgDir, 'tsconfig.json', {
      compilerOptions: { noEmit: false },
      extends: './elsewhere.json',
      include: ['src'],
    });

    expect(writeOf(plan(root), filePath)).toMatchObject({
      changes: [
        "extends should be '../../tsconfig.base.json'",
        expect.stringMatching(/^include should be \[/v),
        'compilerOptions.noEmit should be true',
      ],
    });
  });

  /*
   * gtb owns only what it writes. Every other key is the package's, so a
   * write keeps it, and a file whose owned fields all match plans nothing.
   */
  it('carries the keys it does not write through a rewrite', ({ expect }) => {
    const { pkgDir, root } = createProject();
    applyPlan(root);
    const filePath = path.join(pkgDir, 'tsconfig.json');
    const written = readJsonFile(filePath);
    const carried = {
      $schema: 'https://json.schemastore.org/tsconfig',
      references: [{ path: '../other' }],
      vueCompilerOptions: { target: 3.5 },
    };
    writeJson(pkgDir, 'tsconfig.json', {
      ...written,
      ...carried,
      compilerOptions: { noEmit: false, strict: false },
    });

    expect(parsedContent(plan(root), filePath)).toMatchObject({
      ...carried,
      compilerOptions: { noEmit: true, strict: false },
    });
  });

  it('plans nothing for a file whose owned fields all match', ({ expect }) => {
    const { pkgDir, root } = createProject();
    applyPlan(root);
    const filePath = path.join(pkgDir, 'tsconfig.json');
    const written = readJsonFile(filePath);
    writeFileSync(filePath, JSON.stringify({ ...written, exclude: ['dist'] }));

    expect(writeOf(plan(root), filePath)).toBeUndefined();
  });

  /*
   * Treating a file it cannot read as empty would answer it by writing away
   * what it holds, so the plan leaves it to a hand edit.
   */
  it('reports a tsconfig it cannot parse as a problem', ({ expect }) => {
    const { pkgDir, root } = createProject();
    const filePath = path.join(pkgDir, 'tsconfig.json');
    writeFileSync(filePath, '{ "compilerOptions": { // why\n } }');

    const findings = plan(root);

    expect(findings).toContainEqual({
      kind: 'problem',
      message: `${filePath}: could not be parsed as a JSON object — fix it by hand`,
    });
    expect(writeOf(findings, filePath)).toBeUndefined();
  });

  it('reports a tsconfig holding a JSON array as a problem', ({ expect }) => {
    const { pkgDir, root } = createProject();
    const filePath = path.join(pkgDir, 'tsconfig.json');
    writeFileSync(filePath, JSON.stringify([build.packageName()]));

    const findings = plan(root);

    expect(findings).toContainEqual({
      kind: 'problem',
      message: `${filePath}: could not be parsed as a JSON object — fix it by hand`,
    });
    expect(writeOf(findings, filePath)).toBeUndefined();
  });
});

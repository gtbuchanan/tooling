import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import type { HostedRepository } from '#src/core/repository.js';
import { rewriteSelfReferences } from '#src/release/workflow-tree.js';

const repositoryOf = (): HostedRepository => ({
  domain: 'github.com',
  owner: build.packageName(),
  project: build.packageName(),
});

const slugOf = ({ owner, project }: HostedRepository): string => `${owner}/${project}`;

describe.concurrent(rewriteSelfReferences, () => {
  it('pins a self-reference whatever ref it held', ({ expect }) => {
    const repository = repositoryOf();
    const tag = `v${build.semverVersion()}`;
    const action = `${slugOf(repository)}/.github/actions/${build.packageName()}`;
    const workflow = `${slugOf(repository)}/.github/workflows/${build.packageName()}.yml`;
    const source = [
      `      - uses: ${action}@main`,
      `    uses: ${workflow}@${faker.git.commitSha()}`,
      `        default: ${slugOf(repository)}/.github/config.yml@v0.1.0`,
      '',
    ].join('\n');

    expect(rewriteSelfReferences(source, repository, tag)).toBe([
      `      - uses: ${action}@${tag}`,
      `    uses: ${workflow}@${tag}`,
      `        default: ${slugOf(repository)}/.github/config.yml@${tag}`,
      '',
    ].join('\n'));
  });

  /*
   * GitHub resolves an owner and repository whatever their case, so a
   * reference cased differently from the manifest is still a self-reference.
   */
  it('pins a self-reference cased differently from the manifest', ({ expect }) => {
    const repository = repositoryOf();
    const tag = `v${build.semverVersion()}`;
    const action = `${slugOf(repository).toUpperCase()}/.github/actions/x`;

    expect(rewriteSelfReferences(`uses: ${action}@main`, repository, tag))
      .toBe(`uses: ${action}@${tag}`);
  });

  /*
   * A comment quoting a reference ends it with prose punctuation, which a ref
   * cannot end with, so the punctuation stays outside what gets pinned.
   */
  it('keeps the punctuation that follows a quoted reference', ({ expect }) => {
    const repository = repositoryOf();
    const tag = `v${build.semverVersion()}`;
    const workflow = `${slugOf(repository)}/.github/workflows/<name>`;

    expect(rewriteSelfReferences(`# \`${workflow}@main\`.`, repository, tag))
      .toBe(`# \`${workflow}@${tag}\`.`);
    expect(rewriteSelfReferences(`see ${workflow}@main.`, repository, tag))
      .toBe(`see ${workflow}@${tag}.`);
  });

  it('leaves references to other repositories alone', ({ expect }) => {
    const repository = repositoryOf();
    const { owner, project } = repository;
    const source = [
      '      - uses: actions/checkout@v7',
      `      - uses: ${owner}/${project}-${build.packageName()}/.github/actions/x@main`,
      `      - uses: ${build.packageName()}${owner}/${project}/.github/actions/x@main`,
      `      - uses: ${owner}/${project}/actions/x@main`,
    ].join('\n');

    expect(rewriteSelfReferences(source, repository, 'v1.0.0')).toBe(source);
  });
});

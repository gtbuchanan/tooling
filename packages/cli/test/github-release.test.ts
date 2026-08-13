import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import {
  type PendingRelease,
  extractChangelogNotes,
  publishReleases,
  releaseTag,
} from '#src/lib/github-release.js';
import { captureLogger, createTempDir, stubGithubReleaseDeps } from './helpers.ts';

/**
 * A package to release, identified by a generated name/version pair. `dir`
 * points at an empty temp dir, so the notes fall back to the tag.
 */
const pendingRelease = (): PendingRelease => ({
  dir: createTempDir(),
  name: build.scopedPackageName(),
  version: build.semverVersion(),
});

const tagOf = ({ name, version }: PendingRelease): string => `${name}@${version}`;

describe.concurrent(releaseTag, () => {
  it('uses <name>@<version> for a monorepo member', ({ expect }) => {
    const name = build.scopedPackageName();
    const version = build.semverVersion();

    expect(releaseTag(name, version, true)).toBe(`${name}@${version}`);
  });

  it('uses a plain v<version> for a single-package repo', ({ expect }) => {
    const version = build.semverVersion();

    expect(releaseTag(build.scopedPackageName(), version, false)).toBe(`v${version}`);
  });
});

describe.concurrent(extractChangelogNotes, () => {
  const changelog = '# pkg\n\n## 1.2.0\n\n### Minor Changes\n\n- A change\n\n## 1.1.0\n\n- Older\n';

  it('extracts the section body up to the next heading', ({ expect }) => {
    expect(extractChangelogNotes(changelog, '1.2.0')).toBe('### Minor Changes\n\n- A change');
  });

  it('extracts the final section through end of file', ({ expect }) => {
    expect(extractChangelogNotes(changelog, '1.1.0')).toBe('- Older');
  });

  it('returns undefined when the version is absent', ({ expect }) => {
    expect(extractChangelogNotes(changelog, '9.9.9')).toBeUndefined();
  });

  it('returns undefined for an empty section', ({ expect }) => {
    expect(extractChangelogNotes('## 1.0.0\n\n## 0.9.0\n\n- x\n', '1.0.0')).toBeUndefined();
  });
});

describe.concurrent(publishReleases, () => {
  it('resolves every tag from one listing rather than a call per package', async ({ expect }) => {
    const packages = [pendingRelease(), pendingRelease(), pendingRelease()];
    const stub = stubGithubReleaseDeps({ existingTags: packages.map(tagOf) });

    await publishReleases(stub.deps, packages, true);

    expect(stub.listCalls()).toHaveLength(1);
    expect(stub.createCalls()).toHaveLength(0);
  });

  it('creates only the releases the listing does not already have', async ({ expect }) => {
    const [released, pending] = [pendingRelease(), pendingRelease()];
    const stub = stubGithubReleaseDeps({ existingTags: [tagOf(released)] });

    await publishReleases(stub.deps, [released, pending], true);

    expect(stub.createCalls()).toHaveLength(1);
    expect(stub.createCalls()[0]?.args.slice(0, 3)).toStrictEqual([
      'release', 'create', tagOf(pending),
    ]);
  });

  it('fails loudly when the listing fails instead of assuming no releases', async ({ expect }) => {
    const stub = stubGithubReleaseDeps({ listStderr: 'HTTP 503: Service unavailable' });

    await expect(publishReleases(stub.deps, [pendingRelease()], true))
      .rejects.toThrow(/503/v);
    expect(stub.createCalls()).toHaveLength(0);
  });

  it('treats an already-exists create failure as released', async ({ expect }) => {
    const pkg = pendingRelease();
    const captured = captureLogger();
    const stub = stubGithubReleaseDeps({
      rejectedTags: {
        [tagOf(pkg)]: 'HTTP 422: Validation Failed\nRelease.tag_name already exists',
      },
      logger: captured.logger,
    });

    await publishReleases(stub.deps, [pkg], true);

    expect(captured.out()).toContain(`${tagOf(pkg)} already exists`);
  });

  it('releases the remaining packages after one fails, then throws', async ({ expect }) => {
    const [failing, healthy] = [pendingRelease(), pendingRelease()];
    const stub = stubGithubReleaseDeps({
      rejectedTags: { [tagOf(failing)]: 'HTTP 500: Internal server error' },
    });

    await expect(publishReleases(stub.deps, [failing, healthy], true))
      .rejects.toThrow(AggregateError);
    expect(stub.createCalls().map(call => call.args[2])).toStrictEqual([
      tagOf(failing), tagOf(healthy),
    ]);
  });
});

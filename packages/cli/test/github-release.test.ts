import { describe, it } from 'vitest';
import { extractChangelogNotes, releaseTag } from '#src/lib/github-release.js';

describe.concurrent(releaseTag, () => {
  it('uses <name>@<version> for a monorepo member', ({ expect }) => {
    expect(releaseTag('@scope/pkg', '1.2.3', true)).toBe('@scope/pkg@1.2.3');
  });

  it('uses a plain v<version> for a single-package repo', ({ expect }) => {
    expect(releaseTag('@scope/pkg', '1.2.3', false)).toBe('v1.2.3');
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

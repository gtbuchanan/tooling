import { describe, it } from 'vitest';
import {
  hasPackageBlock,
  patchPackageBlock,
  readPackageName,
  readPackageVersion,
} from '#src/lib/pkl-project.js';

const opts = { isMonorepo: true, repoPath: 'github.com/o/r', version: '1.0.0' } as const;

/** Wraps a package-block body in a minimal author-owned PklProject. */
const block = (body: string): string => `amends "pkl:Project"\n\npackage {\n${body}\n}\n`;

/** A name+version block with `line` appended, plus a sibling block after it. */
const blockWith = (line: string): string =>
  `${block(`  name = "x"\n  version = "0.0.0"\n${line}`)}\ndependencies {}\n`;

/** Patches {@link blockWith} with the shared {@link opts}. */
const patchAround = (line: string): string => patchPackageBlock(blockWith(line), opts);

describe.concurrent(hasPackageBlock, () => {
  it('is true when a package block is declared', ({ expect }) => {
    expect(hasPackageBlock(block('  name = "x"'))).toBe(true);
  });

  it('is false for a deps-only project', ({ expect }) => {
    expect(hasPackageBlock('amends "pkl:Project"\n\ndependencies {}\n')).toBe(false);
  });

  it('is false for empty source', ({ expect }) => {
    expect(hasPackageBlock('')).toBe(false);
  });

  it('is not fooled by a packageZipUrl-like key', ({ expect }) => {
    expect(hasPackageBlock('packageZipUrl = "x"\n')).toBe(false);
  });
});

describe.concurrent(readPackageName, () => {
  it('reads the name literal', ({ expect }) => {
    expect(readPackageName(block('  name = "hk-config"'))).toBe('hk-config');
  });

  it('returns undefined without a block', ({ expect }) => {
    expect(readPackageName('amends "pkl:Project"\n')).toBeUndefined();
  });
});

describe.concurrent(readPackageVersion, () => {
  it('reads the version literal', ({ expect }) => {
    expect(readPackageVersion(block('  name = "x"\n  version = "2.3.4"'))).toBe('2.3.4');
  });
});

describe.concurrent(patchPackageBlock, () => {
  it('throws when there is no package block', ({ expect }) => {
    expect(() => patchPackageBlock('amends "pkl:Project"\n', opts)).toThrow(/package \{\}/v);
  });

  it('inserts the sync-owned fields, preserving the author name', ({ expect }) => {
    const result = patchPackageBlock(block('  name = "hk-config"'), opts);

    expect(result).toContain('  name = "hk-config"');
    expect(result).toContain('  version = "1.0.0"');
    expect(result).toContain(String.raw`  baseUri = "package://github.com/o/r/\(name)"`);
    expect(result).toContain(String.raw`download/\(name)@\(version)/\(name)@\(version).zip"`);
  });

  it('uses a v<version> tag for a single-package repo', ({ expect }) => {
    const result = patchPackageBlock(block('  name = "x"'), { ...opts, isMonorepo: false });

    expect(result).toContain(String.raw`releases/download/v\(version)/`);
  });

  it('replaces a stale version and is otherwise idempotent (only version churns)', ({ expect }) => {
    const synced = patchPackageBlock(block('  name = "x"'), opts);
    const bumped = patchPackageBlock(synced, { ...opts, version: '2.0.0' });

    expect(bumped).toBe(synced.replace('version = "1.0.0"', 'version = "2.0.0"'));
  });

  it('preserves author content (other keys, comments, sibling blocks)', ({ expect }) => {
    const source = [
      'amends "pkl:Project"',
      '',
      'package {',
      '  name = "x"',
      '  version = "0.0.0"',
      '  // keep me',
      '  description = "hand-written"',
      '}',
      '',
      'dependencies {',
      '  ["dep"] = import("...")',
      '}',
      '',
    ].join('\n');

    const result = patchPackageBlock(source, opts);

    expect(result).toContain('  // keep me');
    expect(result).toContain('  description = "hand-written"');
    expect(result).toContain('dependencies {');
    expect(result).toContain('  ["dep"] = import("...")');
    expect(result).toContain('  version = "1.0.0"');
  });
});

/*
 * The brace scanner must find the package block's *real* closing brace,
 * skipping braces that live inside strings or comments. Each case appends a
 * `dependencies {}` sibling: if the scanner stopped early, that sibling would
 * be swallowed into the block (or the version patch would corrupt it).
 */
describe.concurrent('patchPackageBlock brace matching is string/comment-aware', () => {
  it('skips a brace inside a string value', ({ expect }) => {
    const result = patchAround('  description = "brace } here"');

    expect(result).toContain('  description = "brace } here"');
    expect(result).toContain('  version = "1.0.0"');
    expect(result).toContain('dependencies {}');
  });

  it('skips a brace inside a line comment', ({ expect }) => {
    const result = patchAround('  // a } in a comment');

    expect(result).toContain('  // a } in a comment');
    expect(result).toContain('dependencies {}');
  });

  it('skips a brace inside a block comment', ({ expect }) => {
    const result = patchAround('  /* } */');

    expect(result).toContain('  /* } */');
    expect(result).toContain('dependencies {}');
  });

  it('skips braces inside a multiline string', ({ expect }) => {
    const result = patchAround('  license = """\n  MIT }\n  """');

    expect(result).toContain('  MIT }');
    expect(result).toContain('dependencies {}');
  });

  it('balances real nested braces alongside a string brace', ({ expect }) => {
    const result = patchAround('  authors { "a }" }');

    expect(result).toContain('  authors { "a }" }');
    expect(result).toContain('  version = "1.0.0"');
    expect(result).toContain('dependencies {}');
  });
});

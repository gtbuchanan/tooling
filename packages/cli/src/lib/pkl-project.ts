/**
 * Source-text helpers for a `PklProject`'s `package {}` block. Pure
 * string-in/string-out — no Pkl evaluation, no parser dependency. The block's
 * convention fields follow a fixed shape (one `key = value` per line), so a
 * brace-matched scan plus per-key line patch is sufficient and keeps sync free
 * of a heavyweight Pkl AST. This is the seam a future `.csproj` writer mirrors.
 *
 * `PklProject` is author-owned: presence of a `package {}` block is what makes
 * a Pkl package publishable (`pkl project package` cannot emit without it), so
 * {@link hasPackageBlock} is the publish signal. Sync owns only the three
 * version-derived fields ({@link patchPackageBlock}); the author owns `name`
 * and everything else.
 */

/** The sync-owned fields, written into the `package {}` block by sync. */
const ownedKeys = ['version', 'baseUri', 'packageZipUrl'] as const;
type OwnedKey = (typeof ownedKeys)[number];
type OwnedValues = Record<OwnedKey, string>;

/** Span of a `package {}` block: the opening `{` and its matching `}`. */
interface BlockSpan {
  readonly close: number;
  readonly open: number;
}

const lineComment = '//';
const blockCommentOpen = '/*';
const blockCommentClose = '*/';
const blockString = '"""';

/** Index just past `token` (incl. it), or end-of-source when it isn't found. */
const advancePast = (source: string, token: string, from: number): number => {
  const end = source.indexOf(token, from);

  return end === -1 ? source.length : end + token.length;
};

/** Index just past a `"…"` string starting at `open`, honoring `\` escapes. */
const skipString = (source: string, open: number): number => {
  let index = open + 1;
  while (index < source.length && source[index] !== '"') {
    index += 1;
    if (source[index - 1] === '\\') index += 1;
  }

  return index + 1;
};

/**
 * If a string or comment starts at `index`, returns the index just past it;
 * otherwise returns `index` unchanged — so {@link matchBrace} never counts a
 * brace living inside a string or comment.
 */
const skipNonCode = (source: string, index: number): number => {
  if (source.startsWith(lineComment, index)) {
    const end = source.indexOf('\n', index);

    return end === -1 ? source.length : end;
  }
  if (source.startsWith(blockCommentOpen, index)) {
    return advancePast(source, blockCommentClose, index + blockCommentOpen.length);
  }
  if (source.startsWith(blockString, index)) {
    return advancePast(source, blockString, index + blockString.length);
  }

  return source.startsWith('"', index) ? skipString(source, index) : index;
};

/** Scans from the opening brace to its matching close. */
const matchBrace = (source: string, open: number): number | undefined => {
  let depth = 0;
  let index = open;
  while (index < source.length) {
    const skipped = skipNonCode(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }

  return undefined;
};

/** Locates the top-level `package { … }` block, if any. */
const findPackageBlock = (source: string): BlockSpan | undefined => {
  const match = /(?:^|\n)[ \t]*package[ \t]*\{/v.exec(source);
  if (match === null) return undefined;
  const open = source.indexOf('{', match.index);
  const close = matchBrace(source, open);

  return close === undefined ? undefined : { close, open };
};

/** True when the `PklProject` declares a `package {}` block (⇒ publishable). */
export const hasPackageBlock = (source: string): boolean =>
  findPackageBlock(source) !== undefined;

/** Reads a string-literal field from the `package {}` block, if present. */
const readField = (source: string, key: string): string | undefined => {
  const block = findPackageBlock(source);
  if (block === undefined) return undefined;
  const body = source.slice(block.open, block.close);
  const pattern = String.raw`(?:^|\n)[ \t]*${key}[ \t]*=[ \t]*"(?<value>[^"]*)"`;

  return new RegExp(pattern, 'v').exec(body)?.groups?.['value'];
};

/** The package's identity `name` literal — the source of truth for releases. */
export const readPackageName = (source: string): string | undefined =>
  readField(source, 'name');

/** The package's `version` literal. */
export const readPackageVersion = (source: string): string | undefined =>
  readField(source, 'version');

/** Inputs for {@link patchPackageBlock}. */
export interface PatchPackageOptions {
  /** Workspace is a monorepo (⇒ `<name>@<version>` release tag vs `v<version>`). */
  readonly isMonorepo: boolean;
  /** Scheme-less repo path, e.g. `github.com/gtbuchanan/tooling`. */
  readonly repoPath: string;
  /** Version to stamp (from the changeset-managed `package.json`). */
  readonly version: string;
}

/* Pkl interpolation fragments — kept raw so the `\(…)` reaches the file. */
const interpName = String.raw`\(name)`;
const interpBasename = String.raw`\(name)@\(version)`;

/**
 * The sync-owned field values, as Pkl source. `baseUri`/`packageZipUrl` are
 * written as interpolations referencing their `\(name)`/`\(version)` siblings,
 * so they are byte-stable across releases (only the `version` literal changes)
 * and sync never needs to know the package's name.
 */
const ownedValues = ({ isMonorepo, repoPath, version }: PatchPackageOptions): OwnedValues => {
  const tag = isMonorepo ? interpBasename : String.raw`v\(version)`;

  return {
    baseUri: `"package://${repoPath}/${interpName}"`,
    packageZipUrl: `"https://${repoPath}/releases/download/${tag}/${interpBasename}.zip"`,
    version: `"${version}"`,
  };
};

/** Leading whitespace of a line. */
const indentOf = (line: string): string => line.slice(0, line.length - line.trimStart().length);

/** The owned key a line assigns (`version`/`baseUri`/`packageZipUrl`), if any. */
const ownedKeyOf = (line: string): OwnedKey | undefined =>
  ownedKeys.find(key => new RegExp(String.raw`^[ \t]*${key}[ \t]*=`, 'v').test(line));

/**
 * Patches the sync-owned fields ({@link ownedKeys}) into an author-owned
 * `PklProject`'s `package {}` block — replacing each in place or inserting a
 * missing one — while copying `name` and all other content (author keys,
 * `dependencies`/`evaluatorSettings`, comments) verbatim. Throws when there is
 * no `package {}` block: sync stamps existing packages but never authors one.
 */
export const patchPackageBlock = (source: string, options: PatchPackageOptions): string => {
  const block = findPackageBlock(source);
  if (block === undefined) {
    throw new Error(
      'PklProject has no `package {}` block; a publishable Pkl package must declare one.',
    );
  }

  const values = ownedValues(options);
  const before = source.slice(0, block.open + 1);
  const after = source.slice(block.close);
  const lines = source.slice(block.open + 1, block.close).split('\n');
  const indent = indentOf(lines.find(line => line.trim() !== '') ?? '  ');

  const seen = new Set<OwnedKey>();
  const patched = lines.map((line) => {
    const key = ownedKeyOf(line);
    if (key === undefined) return line;
    seen.add(key);

    return `${indentOf(line)}${key} = ${values[key]}`;
  });

  const missing = ownedKeys
    .filter(key => !seen.has(key))
    .map(key => `${indent}${key} = ${values[key]}`);
  const [first = '', ...rest] = patched;

  return `${before}${[first, ...missing, ...rest].join('\n')}${after}`;
};

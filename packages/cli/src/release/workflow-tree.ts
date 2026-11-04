import type { ExecResult, ExecuteOptions } from '#src/core/process.js';
import type { HostedRepository } from '#src/core/repository.js';
import type { GithubReleaseDeps } from '#src/release/github-release.js';

/**
 * Where the reusable workflows and composite actions live. GitHub reads
 * workflows from nowhere else, so this is also the package's directory.
 */
export const workflowsPackageDir = '.github';

/*
 * A reference to this repository's own `.github/` tree with whatever ref it
 * holds: `owner/project/.github/<path>@<ref>`, in any case, since GitHub
 * resolves an owner and repository whatever their case. The lookbehind keeps
 * a longer owner (`xowner/project/...`) or a path segment
 * (`a/owner/project/...`) from matching on its tail; `<path>` stops at the
 * `@`, so the last `@` of a match is the one before the ref. The ref is
 * dot-separated runs of word characters, `-` and `/`, which every branch, tag
 * and sha matches and which cannot end on a dot, so the punctuation closing a
 * reference quoted in prose stays put.
 */
const selfReferencePattern = ({ owner, project }: HostedRepository): RegExp => {
  const slug = `${owner}/${project}`.replaceAll('.', String.raw`\.`);
  const ref = String.raw`[\w\-\/]+(?:\.[\w\-\/]+)*`;

  return new RegExp(String.raw`(?<![\w.\-\/])${slug}/\.github/[^\s'"@]+@${ref}`, 'giv');
};

/**
 * Pins every reference `source` makes to `repository`'s own `.github/` tree to
 * `tag`, whatever ref it held. A caller pinned to the release then gets the
 * composite actions, nested workflows and config the release itself holds,
 * rather than whatever the default branch holds by the time it runs.
 */
export const rewriteSelfReferences = (
  source: string,
  repository: HostedRepository,
  tag: string,
): string => source.replaceAll(
  selfReferencePattern(repository),
  reference => `${reference.slice(0, reference.lastIndexOf('@'))}@${tag}`,
);

/**
 * A file of the release tree, in the shape GitHub's create-a-tree endpoint
 * takes it.
 */
export interface TreeEntry {
  readonly content: string;
  readonly mode: string;
  readonly path: string;
  readonly type: 'blob';
}

/**
 * A tracked file as `git ls-tree` lists it.
 */
interface TrackedFile {
  readonly blob: string;
  readonly mode: string;
  readonly path: string;
}

/**
 * The command's stdout, failing on a non-zero exit with what it reported.
 */
export const succeeded = (result: ExecResult, what: string): string => {
  if (result.exitCode !== 0) {
    throw new Error(`${what} failed: ${result.stderr}`);
  }

  return result.stdout;
};

/*
 * A regular or executable file. Symlinks (`120000`) hold a link target
 * rather than content to pin, and submodules are not blobs.
 */
const fileModes = new Set(['100644', '100755']);

/*
 * The changelog records what each version said when it shipped, so a
 * reference one of its entries quotes is history rather than a pin.
 */
const changelogPath = `${workflowsPackageDir}/CHANGELOG.md`;

/*
 * The space-separated fields ahead of the tab in an ls-tree record, and
 * ahead of the content in a cat-file batch header.
 */
const headerFields = 3;

/**
 * Parses one `git ls-tree -z` record: `<mode> <type> <blob>\t<path>`.
 */
const parseTrackedFile = (record: string): TrackedFile => {
  const tab = record.indexOf('\t');
  const [mode = '', , blob = ''] = record.slice(0, tab).split(' ', headerFields);

  return { blob, mode, path: record.slice(tab + 1) };
};

const newline = 0x0A;

/*
 * `ignoreBOM` keeps a leading byte order mark in the text, so a pinned file
 * differs from its source only in the references the rewrite changes.
 */
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * The bytes as text, or nothing when they are not UTF-8: such a file holds no
 * reference the rewrite could pin, and re-encoding it as text would corrupt it.
 */
const decodeText = (bytes: Uint8Array): string | undefined => {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};

/**
 * Parses `git cat-file --batch` output, read as latin1 so each character is one
 * byte, into each text blob's content by sha. Each object is a
 * `<sha> <type> <size>` line, `size` bytes of content and a newline, so the
 * content is sliced by byte count rather than by line.
 */
const parseCatFileBatch = (output: string): ReadonlyMap<string, string> => {
  const bytes = Buffer.from(output, 'latin1');
  const contents = new Map<string, string>();
  let offset = 0;
  while (offset < bytes.length) {
    const headerEnd = bytes.indexOf(newline, offset);
    const [sha = '', type = '', size = ''] = bytes.toString('latin1', offset, headerEnd)
      .split(' ', headerFields);
    if (type !== 'blob') {
      throw new Error(`git cat-file: ${sha} is not a blob`);
    }
    const start = headerEnd + 1;
    const end = start + Number(size);
    const text = decodeText(bytes.subarray(start, end));
    if (text !== undefined) {
      contents.set(sha, text);
    }
    offset = end + 1;
  }

  return contents;
};

/**
 * Runs git in the workspace root, failing on a non-zero exit.
 */
export type Git = (args: readonly string[], options?: ExecuteOptions) => Promise<string>;

/**
 * Runs git through `deps` in `rootDir`.
 */
export const gitIn = (deps: GithubReleaseDeps, rootDir: string): Git => async (args, options) =>
  succeeded(
    await deps.execute('git', ['-C', rootDir, ...args], options),
    `git ${args.join(' ')}`,
  );

/**
 * The tree `commit` points at.
 */
export const treeOf = async (git: Git, commit: string): Promise<string> =>
  git(['log', '-1', '--format=%T', commit]);

/**
 * The rewritten files of `commit`'s release tree: each tracked text file
 * under `.github/` but the changelog whose self-references the rewrite pins.
 * Content comes from the commit's own blobs, read in one batch, so the plan is
 * exactly the commit's whatever the working tree holds. Paths are the
 * workspace's, which is the repository root.
 */
export const planTreeEntries = async (
  git: Git,
  commit: string,
  repository: HostedRepository,
  tag: string,
): Promise<readonly TreeEntry[]> => {
  const listing = await git(['ls-tree', '-r', '-z', commit, '--', workflowsPackageDir]);
  const files = listing.split('\0')
    .filter(Boolean)
    .map(parseTrackedFile)
    .filter(({ mode, path: filePath }) => fileModes.has(mode) && filePath !== changelogPath);
  if (files.length === 0) {
    return [];
  }
  const input = `${files.map(({ blob }) => blob).join('\n')}\n`;
  const contents = parseCatFileBatch(
    await git(['cat-file', '--batch'], { encoding: 'latin1', input, trim: false }),
  );

  return files.flatMap(({ blob, mode, path: filePath }): readonly TreeEntry[] => {
    const source = contents.get(blob);
    if (source === undefined) {
      return [];
    }
    const content = rewriteSelfReferences(source, repository, tag);

    return content === source ? [] : [{ content, mode, path: filePath, type: 'blob' }];
  });
};

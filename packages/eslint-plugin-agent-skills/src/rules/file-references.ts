import fs from 'node:fs';
import path from 'node:path';
import type { MarkdownRuleDefinition } from '@eslint/markdown';
import type { Definition, Image, Link } from 'mdast';

interface FileReferencesOptions {
  readonly maxDepth?: number;
}

interface ResolvedReference {
  readonly absolutePath: string;
  readonly depth: number;
  readonly outsideRoot: boolean;
}

type FileReferencesRule = MarkdownRuleDefinition<{
  MessageIds: 'notFound' | 'outsideRoot' | 'tooDeep';
  RuleOptions: [FileReferencesOptions?];
}>;

const defaultMaxDepth = 1;

const externalUrlPattern = /^(?:[a-z][\w+.\-]*:|\/\/|#)/iv;

const stripFragmentAndQuery = (url: string): string => {
  const hash = url.indexOf('#');
  const trimmed = hash === -1 ? url : url.slice(0, hash);
  const query = trimmed.indexOf('?');
  return query === -1 ? trimmed : trimmed.slice(0, query);
};

const safeDecodeUri = (url: string): string => {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
};

const resolveReference = (
  skillDir: string,
  url: string,
): ResolvedReference => {
  const decoded = safeDecodeUri(url);
  const normalized = path.posix.normalize(decoded);
  const segments = normalized
    .split('/')
    .filter(segment => segment !== '' && segment !== '.');
  const outsideRoot =
    normalized.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../');
  const depth = Math.max(0, segments.length - 1);
  return {
    absolutePath: path.resolve(skillDir, decoded),
    depth,
    outsideRoot,
  };
};

/**
 * Validates that local file references in `SKILL.md` (markdown links,
 * images, and reference-style definitions) resolve to existing files
 * within the skill root and stay within the Agent Skills spec's
 * "one level deep" guidance for ancillary files. See the
 * [File references](https://agentskills.io/specification#file-references)
 * section of the spec.
 *
 * Walks the markdown AST produced by `@eslint/markdown`, so URLs inside
 * code blocks, code spans, and HTML comments are skipped automatically
 * (the parser doesn't emit `link`/`image`/`definition` nodes inside
 * those constructs). External URLs (any `scheme:`, `//host`, or
 * `#fragment`) are filtered explicitly.
 */
export const fileReferences: FileReferencesRule = {
  meta: {
    messages: {
      notFound: 'Referenced file not found: `{{url}}`',
      outsideRoot: 'Reference `{{url}}` resolves outside the skill root',
      tooDeep:
        'Reference `{{url}}` is {{depth}} levels deep; ' +
        'the spec recommends keeping references at most {{max}} level deep',
    },
    schema: [{
      additionalProperties: false,
      properties: { maxDepth: { minimum: 0, type: 'integer' } },
      type: 'object',
    }],
    type: 'problem',
  },

  create(context) {
    const { filename } = context;
    if (!filename) return {};

    const { maxDepth = defaultMaxDepth } = context.options[0] ?? {};
    const skillDir = path.dirname(filename);

    const checkUrl = (node: Definition | Image | Link): void => {
      const { url } = node;
      if (url === '') return;
      if (externalUrlPattern.test(url)) return;
      const cleanUrl = stripFragmentAndQuery(url);
      if (cleanUrl === '') return;

      const loc = node.position;
      if (!loc) return;

      const ref = resolveReference(skillDir, cleanUrl);

      if (ref.outsideRoot) {
        context.report({ data: { url }, loc, messageId: 'outsideRoot' });
        return;
      }
      if (!fs.existsSync(ref.absolutePath)) {
        context.report({ data: { url }, loc, messageId: 'notFound' });
        return;
      }
      if (ref.depth > maxDepth) {
        context.report({
          data: {
            depth: String(ref.depth),
            max: String(maxDepth),
            url,
          },
          loc,
          messageId: 'tooDeep',
        });
      }
    };

    return {
      definition: checkUrl,
      image: checkUrl,
      link: checkUrl,
    };
  },
};

import fs from 'node:fs';
import path from 'node:path';
import { Ajv } from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { JSRuleDefinition } from 'eslint';
import { isMap, isScalar, parseDocument } from 'yaml';
import schema from '../schemas/evals.json' with { type: 'json' };

interface EvalCase {
  readonly expectations: readonly string[];
  readonly expected_output: string;
  readonly files?: readonly string[];
  readonly id: number;
  readonly prompt: string;
}

interface EvalsFile {
  readonly evals: readonly EvalCase[];
  readonly skill_name: string;
}

type MessageId =
  | 'duplicateId'
  | 'nameMismatch'
  | 'nonSequentialId'
  | 'schemaViolation'
  | 'skillFileMissing';

type EvalsSchemaRule = JSRuleDefinition<{
  MessageIds: MessageId;
  RuleOptions: [];
}>;

/* `validateSchema: false` skips the meta-schema lookup so the
   imported schema doesn't need a matching meta-schema registered. */
const validate: ValidateFunction<EvalsFile> = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false,
}).compile<EvalsFile>(schema);

const fileLoc = {
  end: { column: 0, line: 1 },
  start: { column: 0, line: 1 },
};

const decodeJsonPointer = (segment: string): string =>
  segment.replaceAll('~1', '/').replaceAll('~0', '~');

const formatPath = (instancePath: string): string => {
  if (instancePath === '') return 'evals.json';
  const segments = instancePath.split('/').slice(1).map(decodeJsonPointer);
  return ['evals.json', ...segments].join('.');
};

const frontmatterPattern = /^---\r?\n(?<content>[\s\S]*?)\r?\n---/v;

const readSkillName = (skillMdPath: string): string | undefined => {
  const text = fs.readFileSync(skillMdPath, 'utf8');
  const { content } = frontmatterPattern.exec(text)?.groups ?? {};
  if (content === undefined) return undefined;
  const doc = parseDocument(content);
  if (!isMap(doc.contents)) return undefined;
  const pair = doc.contents.items.find(
    item => isScalar(item.key) && item.key.value === 'name',
  );
  if (!pair || !isScalar(pair.value)) return undefined;
  const { value } = pair.value;
  return typeof value === 'string' ? value : undefined;
};

type Reporter = (descriptor: {
  data?: Record<string, string>;
  messageId: MessageId;
}) => void;

const reportSchemaErrors = (
  errors: readonly ErrorObject[],
  report: Reporter,
): void => {
  for (const error of errors) {
    report({
      data: {
        message: error.message ?? 'is invalid',
        path: formatPath(error.instancePath),
      },
      messageId: 'schemaViolation',
    });
  }
};

const reportIdInvariants = (
  evals: readonly EvalCase[],
  report: Reporter,
): void => {
  const seenIds = new Set<number>();
  for (const [index, item] of evals.entries()) {
    const expected = index + 1;
    if (item.id !== expected) {
      report({
        data: { actual: String(item.id), expected: String(expected) },
        messageId: 'nonSequentialId',
      });
    }
    if (seenIds.has(item.id)) {
      report({
        data: { id: String(item.id) },
        messageId: 'duplicateId',
      });
    }
    seenIds.add(item.id);
  }
};

const reportSkillNameMismatch = (
  filename: string,
  skillName: string,
  report: Reporter,
): void => {
  const skillMdPath = path.resolve(
    path.dirname(filename),
    '..',
    'SKILL.md',
  );
  if (!fs.existsSync(skillMdPath)) {
    report({ data: { path: skillMdPath }, messageId: 'skillFileMissing' });
    return;
  }
  const expectedName = readSkillName(skillMdPath);
  if (expectedName === undefined || expectedName === skillName) return;
  report({
    data: { actual: skillName, expected: expectedName },
    messageId: 'nameMismatch',
  });
};

/**
 * Validates an Agent Skill's `evals/evals.json` against the canonical
 * schema (exported as `skillEvalsSchema`), then enforces the
 * structural invariants the schema can't express: `id` values are
 * unique and sequential starting at `1`, and `skill_name` matches
 * the sibling `SKILL.md`'s frontmatter `name`. The companion
 * `min-evals` rule covers the count threshold.
 */
export const evalsSchema: EvalsSchemaRule = {
  meta: {
    messages: {
      duplicateId:
        'Duplicate eval `id`: {{id}}. Each eval must have a unique id.',
      nameMismatch:
        '`skill_name` must match SKILL.md `name` ' +
        '(expected `{{expected}}`, got `{{actual}}`)',
      nonSequentialId:
        'Eval `id` must be sequential starting at 1 ' +
        '(expected {{expected}}, got {{actual}})',
      schemaViolation: '`{{path}}` {{message}}',
      skillFileMissing: 'No sibling SKILL.md found at `{{path}}`',
    },
    schema: [],
    type: 'problem',
  },

  create(context) {
    const report: Reporter = (descriptor) => {
      context.report({ ...descriptor, loc: fileLoc });
    };
    return {
      // Key off the actual AST root so this fires under any JSON
      // parser (e.g. @eslint/json's `Document`) or generic parser.
      [context.sourceCode.ast.type]() {
        const { filename } = context;
        if (!filename) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(context.sourceCode.getText());
        } catch {
          /* @eslint/json reports syntax errors; nothing
             schema-meaningful to add here. */
          return;
        }

        if (!validate(parsed)) {
          reportSchemaErrors(validate.errors ?? [], report);
          return;
        }

        reportIdInvariants(parsed.evals, report);
        reportSkillNameMismatch(filename, parsed.skill_name, report);
      },
    };
  },
};

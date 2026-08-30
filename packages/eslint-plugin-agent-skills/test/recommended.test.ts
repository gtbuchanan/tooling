import path from 'node:path';
import { Linter } from 'eslint';
import { describe, it } from 'vitest';
import { configs } from '#src/index.js';

const cwd = path.resolve('/repo');
const referencesFile = path.join(
  cwd, 'skills', 'my-skill', 'references', 'REFERENCE.md',
);
const skillFile = path.join(cwd, 'skills', 'my-skill', 'SKILL.md');

const linter = new Linter({ cwd });
const recommended = [...configs.recommended];

const buildBody = (lineCount: number): string => Array
  .from({ length: lineCount }, (_unused, index) => `Line ${(index + 1).toString()}.`)
  .join('\n');

const lint = (
  code: string,
  filename = referencesFile,
): Linter.LintMessage[] => linter.verify(code, recommended, filename);

const maxLinesMessages = (
  messages: readonly Linter.LintMessage[],
): readonly Linter.LintMessage[] =>
  messages.filter(message => message.ruleId === 'agent-skills/max-lines');

const maxTokensMessages = (
  messages: readonly Linter.LintMessage[],
): readonly Linter.LintMessage[] =>
  messages.filter(message => message.ruleId === 'agent-skills/max-tokens');

const frontmatter = '---\nname: my-skill\ndescription: ok.\n---\n';

/* One estimated token per 4 characters. Kept on a single line so the
   500-line `max-lines` cap can't fire alongside the token cap. */
const buildTokens = (tokenCount: number): string => 'word'.repeat(tokenCount);

describe('configs.recommended references/ max-lines', () => {
  it('passes when the file is at the 300-line limit', ({ expect }) => {
    const messages = maxLinesMessages(lint(buildBody(300)));

    expect(messages).toStrictEqual([]);
  });

  it('flags when the file exceeds the 300-line limit', ({ expect }) => {
    const [message, ...rest] = maxLinesMessages(lint(buildBody(301)));

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/301.*Maximum allowed is 300/v);
    expect(message?.severity).toBe(1);
  });

  it('honors a top-of-file eslint-disable HTML comment', ({ expect }) => {
    const code =
      '<!-- eslint-disable agent-skills/max-lines -->\n' +
      buildBody(500);

    const messages = maxLinesMessages(lint(code));

    expect(messages).toStrictEqual([]);
  });

  it('does not apply the 300-line cap to SKILL.md', ({ expect }) => {
    const messages = maxLinesMessages(lint(buildBody(400), skillFile));

    expect(messages).toStrictEqual([]);
  });
});

describe('configs.recommended SKILL.md max-tokens', () => {
  it('passes when the body is at the 5000-token limit', ({ expect }) => {
    const messages = maxTokensMessages(
      lint(frontmatter + buildTokens(5000), skillFile),
    );

    expect(messages).toStrictEqual([]);
  });

  it('flags when the body exceeds the 5000-token limit', ({ expect }) => {
    const [message, ...rest] = maxTokensMessages(
      lint(`${frontmatter + buildTokens(5000)}over`, skillFile),
    );

    expect(rest).toStrictEqual([]);
    expect(message?.message).toMatch(/~5001 tokens.*recommended is 5000/v);
    expect(message?.severity).toBe(1);
  });

  it('does not apply a token cap to references/', ({ expect }) => {
    const messages = maxTokensMessages(lint(buildTokens(6000)));

    expect(messages).toStrictEqual([]);
  });
});

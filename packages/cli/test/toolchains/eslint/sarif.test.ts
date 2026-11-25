import path from 'node:path';
import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import {
  type LintMessage,
  type LintResult,
  type SarifContext,
  toSarifLog,
} from '#src/toolchains/eslint/sarif.js';

const rootDir = path.resolve('/repo');
const context: SarifContext = { rootDir, rulesMeta: {} };

const makeMessage = (overrides: Partial<LintMessage> = {}): LintMessage => ({
  column: faker.number.int({ max: 80, min: 1 }),
  line: faker.number.int({ max: 500, min: 1 }),
  message: faker.lorem.sentence(),
  ruleId: `${faker.word.noun()}/${faker.word.verb()}`,
  severity: 1,
  ...overrides,
});

const makeResult = (overrides: Partial<LintResult> = {}): LintResult => ({
  errorCount: 0,
  fatalErrorCount: 0,
  filePath: path.join(rootDir, 'src', `${faker.word.noun()}.ts`),
  fixableErrorCount: 0,
  fixableWarningCount: 0,
  messages: [],
  suppressedMessages: [],
  usedDeprecatedRules: [],
  warningCount: 0,
  ...overrides,
});

/*
 * The one SARIF result the log holds for a file reporting these messages.
 */
const findingOf = (result: LintResult): unknown =>
  toSarifLog([result], context).runs[0]?.results[0];

describe.concurrent(toSarifLog, () => {
  it('locates a finding relative to the repository root', ({ expect }) => {
    const pkg = faker.word.noun();
    const file = faker.word.noun();
    const message = makeMessage({ endColumn: 9, endLine: 4 });
    const result = makeResult({
      filePath: path.join(rootDir, 'packages', pkg, 'src', `${file}.ts`),
      messages: [message],
    });

    expect(findingOf(result)).toMatchObject({
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: `packages/${pkg}/src/${file}.ts`, uriBaseId: 'SRCROOT' },
          region: {
            endColumn: 9,
            endLine: 4,
            startColumn: message.column,
            startLine: message.line,
          },
        },
      }],
    });
  });

  it('omits the region of a finding about the whole file', ({ expect }) => {
    /* eslint-disable-next-line unicorn/no-null --
       ESLint reports a finding no rule raised with a null ruleId */
    const message: LintMessage = { message: faker.lorem.sentence(), ruleId: null, severity: 1 };

    expect(findingOf(makeResult({ messages: [message] })))
      .not.toHaveProperty('locations.0.physicalLocation.region');
  });

  /*
   * SARIF locations are URI references, where `#` starts a fragment and `%` an
   * escape, so a path holding either, or a space, has to be percent-encoded.
   */
  it('percent-encodes characters a URI reserves in a file name', ({ expect }) => {
    const dir = faker.word.noun();
    const result = makeResult({
      filePath: path.join(rootDir, dir, 'a#b c%d.ts'),
      messages: [makeMessage()],
    });

    expect(findingOf(result)).toHaveProperty(
      'locations.0.physicalLocation.artifactLocation.uri',
      `${dir}/a%23b%20c%25d.ts`,
    );
  });

  /*
   * ESLint reports some file-level findings at line 0, its own "No matching
   * configuration" among them, where SARIF lines start at 1.
   */
  it('omits the region of a finding at line 0', ({ expect }) => {
    const message = makeMessage({ column: 0, line: 0 });

    expect(findingOf(makeResult({ messages: [message] })))
      .not.toHaveProperty('locations.0.physicalLocation.region');
  });

  it('carries the rule and message of a finding', ({ expect }) => {
    const message = makeMessage();

    expect(findingOf(makeResult({ messages: [message] }))).toMatchObject({
      message: { text: message.message },
      ruleId: message.ruleId,
    });
  });

  it('omits the rule of a finding no rule raised', ({ expect }) => {
    /* eslint-disable-next-line unicorn/no-null --
       ESLint reports a finding no rule raised with a null ruleId */
    const message = makeMessage({ ruleId: null, severity: 2 });

    expect(findingOf(makeResult({ messages: [message] }))).not.toHaveProperty('ruleId');
  });

  it('describes each rule that fired from its metadata', ({ expect }) => {
    const message = makeMessage();
    const ruleId = message.ruleId ?? '';
    const description = faker.lorem.sentence();
    const url = faker.internet.url();

    const log = toSarifLog(
      [makeResult({ messages: [message] })],
      { rootDir, rulesMeta: { [ruleId]: { docs: { description, url } } } },
    );

    expect(log.runs[0]?.tool.driver.rules).toStrictEqual([{
      helpUri: url,
      id: ruleId,
      shortDescription: { text: description },
    }]);
  });

  it('names a rule that declares no metadata', ({ expect }) => {
    const message = makeMessage();
    const ruleId = message.ruleId ?? '';

    const log = toSarifLog(
      [makeResult({ messages: [message] })],
      { rootDir, rulesMeta: { [ruleId]: undefined } },
    );

    expect(log.runs[0]?.tool.driver.rules).toStrictEqual([{ id: ruleId }]);
  });

  it.for([
    ['directive', 'inSource'],
    ['file', 'external'],
  ] as const)('marks a %s suppression as %s', ([kind, sarifKind], { expect }) => {
    const justification = faker.lorem.sentence();
    const message = makeMessage();
    const suppressed = { ...message, suppressions: [{ justification, kind }] };

    expect(findingOf(makeResult({ suppressedMessages: [suppressed] }))).toMatchObject({
      message: { text: message.message },
      suppressions: [{ justification, kind: sarifKind }],
    });
  });

  it.for([
    [1, 'warning'],
    [2, 'error'],
  ] as const)('reports severity %i as level %s', ([severity, level], { expect }) => {
    const message = makeMessage({ severity });

    expect(findingOf(makeResult({ messages: [message] }))).toHaveProperty('level', level);
  });
});

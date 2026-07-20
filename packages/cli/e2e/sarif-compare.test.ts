import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type ProjectFixture, createProjectFixture } from '@gtbuchanan/test-utils';
import { describe, it } from 'vitest';

const createFixture = (): ProjectFixture =>
  createProjectFixture({
    packageName: '@gtbuchanan/cli',
  });

const jsonIndent = 2;

interface SarifViolation {
  readonly line: number;
  readonly message: string;
  readonly ruleId: string;
  readonly snippet: string;
}

/** Builds a SARIF log in the shape the bundled ESLint formatter emits. */
const sarifLog = (fileUri: string, violations: readonly SarifViolation[]): string =>
  `${JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0-rtm.5',
    runs: [{
      artifacts: [{ location: { uri: fileUri } }],
      results: violations.map(violation => ({
        level: 'warning',
        locations: [{
          physicalLocation: {
            artifactLocation: { index: 0, uri: fileUri },
            region: {
              snippet: { text: violation.snippet },
              startColumn: 1,
              startLine: violation.line,
            },
          },
        }],
        message: { text: violation.message },
        ruleId: violation.ruleId,
      })),
      tool: { driver: { name: 'ESLint', rules: [] } },
    }],
    version: '2.1.0',
  }, undefined, jsonIndent)}\n`;

const existing: SarifViolation = {
  line: 2,
  message: "'unused' is assigned a value but never used.",
  ruleId: 'no-unused-vars',
  snippet: 'const unused = 1;',
};

const source = 'export const app = () => {\n  const unused = 1;\n  console.log("hi");\n};\n';

describe.concurrent('gtb sarif compare', () => {
  it('passes when every violation is in the baseline', async ({ expect }) => {
    using fixture = createFixture();
    const file = fixture.writeFile(path.join('src', 'app.js'), source);
    const uri = pathToFileURL(file).href;
    fixture.writeFile(
      path.join('dist', 'sarif', 'base', 'eslint.sarif'),
      sarifLog(uri, [existing]),
    );
    fixture.writeFile(path.join('dist', 'sarif', 'eslint.sarif'), sarifLog(uri, [existing]));

    const result = await fixture.run('gtb', ['sarif', 'compare']);

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toContain('No new findings');
  });

  it('fails on a violation missing from the baseline', async ({ expect }) => {
    using fixture = createFixture();
    const file = fixture.writeFile(path.join('src', 'app.js'), source);
    const uri = pathToFileURL(file).href;
    const added: SarifViolation = {
      line: 3,
      message: 'Unexpected console statement.',
      ruleId: 'no-console',
      snippet: 'console.log("hi");',
    };
    fixture.writeFile(
      path.join('dist', 'sarif', 'base', 'eslint.sarif'),
      sarifLog(uri, [existing]),
    );
    fixture.writeFile(
      path.join('dist', 'sarif', 'eslint.sarif'),
      sarifLog(uri, [existing, added]),
    );

    const result = await fixture.run('gtb', ['sarif', 'compare']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('no-console');
    expect(result.stderr).not.toContain('no-unused-vars');
  });

  it('treats every finding as new when no baseline exists', async ({ expect }) => {
    using fixture = createFixture();
    const file = fixture.writeFile(path.join('src', 'app.js'), source);
    const uri = pathToFileURL(file).href;
    fixture.writeFile(path.join('dist', 'sarif', 'eslint.sarif'), sarifLog(uri, [existing]));

    const result = await fixture.run('gtb', ['sarif', 'compare']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('No baseline');
    expect(result.stderr).toContain('no-unused-vars');
  });
});

import { Linter } from 'eslint';
import { describe, it } from 'vitest';
import { configure } from '#src/index.js';

const sourceFile = 'src/index.js';

/*
 * One shared `configure()` call: building the config is the expensive part,
 * and it is identical for every case here.
 */
const defaultConfigs = configure({ onlyWarn: false });

/*
 * Lint against the import-x config object alone rather than the whole
 * config. The full config enables typescript-eslint's project service,
 * which refuses to parse a file that isn't in a tsconfig — and these
 * assertions run on in-memory source, so nothing would parse and every
 * rule would silently report nothing.
 */
const importOnlyConfigs = async (): Promise<Linter.Config[]> => {
  const configs = await defaultConfigs;
  const importConfigs = configs.filter(
    config => Object.keys(config.rules ?? {}).some(id => id.startsWith('import-x/')),
  );

  return [
    { languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    ...importConfigs,
  ];
};

const ruleMessages = async (
  code: string,
  ruleId: string,
): Promise<Linter.LintMessage[]> => new Linter()
  .verify(code, await importOnlyConfigs(), sourceFile)
  .filter(message => message.ruleId === ruleId);

describe.concurrent('import hygiene', () => {
  it('ships exactly one import-x config object', async ({ expect }) => {
    const configs = await defaultConfigs;
    const importConfigs = configs.filter(
      config => Object.keys(config.rules ?? {}).some(id => id.startsWith('import-x/')),
    );

    expect(importConfigs).toHaveLength(1);
  });

  it('reports a module imported twice in one file', async ({ expect }) => {
    const messages = await ruleMessages(
      "import { a } from 'node:path';\n" +
      "import { b } from 'node:path';\n\nexport const c = [a, b];\n",
      'import-x/no-duplicates',
    );

    expect(messages).not.toStrictEqual([]);
    expect(messages[0]?.message).toMatch(/imported multiple times/v);
  });

  it('accepts a module imported once', async ({ expect }) => {
    const messages = await ruleMessages(
      "import { a, b } from 'node:path';\n\nexport const c = [a, b];\n",
      'import-x/no-duplicates',
    );

    expect(messages).toStrictEqual([]);
  });

  it('reports a mutable export', async ({ expect }) => {
    const messages = await ruleMessages(
      'export let a = 1;\n',
      'import-x/no-mutable-exports',
    );

    expect(messages).toHaveLength(1);
  });

  it('reports an empty named import block', async ({ expect }) => {
    const messages = await ruleMessages(
      "import {} from 'node:path';\n",
      'import-x/no-empty-named-blocks',
    );

    expect(messages).toHaveLength(1);
  });

  it('reports an absolute import path', async ({ expect }) => {
    const messages = await ruleMessages(
      "import { a } from '/etc/thing.js';\n\nexport const b = a;\n",
      'import-x/no-absolute-path',
    );

    expect(messages).toHaveLength(1);
  });

  it('reports an import below the module body', async ({ expect }) => {
    const messages = await ruleMessages(
      "export const a = 1;\nimport { b } from 'node:path';\n\nexport const c = b;\n",
      'import-x/first',
    );

    expect(messages).toHaveLength(1);
  });
});

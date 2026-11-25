import { describe, it } from 'vitest';
import { compileTsdownArgs } from '#src/toolchains/tsdown/commands/compile-tsdown.js';

/*
 * The value following `flag`, for the options the build relies on rather than
 * leaving to the package's tsdown config.
 */
const optionValue = (args: readonly string[], flag: string): string | undefined =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;

describe.concurrent(compileTsdownArgs, () => {
  /*
  `pack:npm` packs `dist/source`, so a bundle anywhere else publishes nothing.
  */
  it('bundles into the directory pack:npm publishes from', ({ expect }) => {
    expect(optionValue(compileTsdownArgs([]), '--out-dir')).toBe('dist/source');
  });

  it('compiles under the build tsconfig', ({ expect }) => {
    expect(optionValue(compileTsdownArgs([]), '--tsconfig')).toBe('tsconfig.build.json');
  });

  /*
   * tsdown writes `.mjs` for Node by default, which would break the paths a
   * package's `publishConfig` names after tsc's output.
   */
  it('keeps the extensions tsc writes', ({ expect }) => {
    expect(compileTsdownArgs([])).toContain('--no-fixed-extension');
  });

  /*
  compile:ts ships a map beside every file, so a stack trace resolves either way.
  */
  it('emits a source map beside the bundle', ({ expect }) => {
    expect(compileTsdownArgs([])).toContain('--sourcemap');
  });

  /*
   * tsdown's own clean would delete the skills subtree compile:skills writes
   * into the same directory, unordered against this task.
   */
  it('leaves clearing the output directory to gtb', ({ expect }) => {
    expect(compileTsdownArgs([])).toContain('--no-clean');
  });

  it('passes extra arguments last, so they override the defaults', ({ expect }) => {
    const args = compileTsdownArgs(['--minify']);

    expect(args.at(-1)).toBe('--minify');
  });
});

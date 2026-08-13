import { describe, it } from 'vitest';
import { capture, execute } from '#src/lib/process.js';

/*
 * Spawn the running Node binary so the tests stay cross-platform and don't
 * depend on any external tool being installed.
 */
describe.concurrent(capture, () => {
  it('resolves the trimmed stdout', async ({ expect }) => {
    const out = await capture(process.execPath, ['-e', 'process.stdout.write("  hi  ")']);

    expect(out).toBe('hi');
  });

  it('rejects on a non-zero exit', async ({ expect }) => {
    await expect(
      capture(process.execPath, ['-e', 'process.exit(3)']),
    ).rejects.toThrow('exited with code 3');
  });

  it('rejects when the command cannot be spawned', async ({ expect }) => {
    await expect(capture('gtb-no-such-binary-xyz', [])).rejects.toThrow(/./v);
  });
});

describe.concurrent(execute, () => {
  it('resolves the trimmed streams on success', async ({ expect }) => {
    const script = 'process.stdout.write("  out  ");process.stderr.write("  err  ")';

    await expect(execute(process.execPath, ['-e', script])).resolves.toStrictEqual({
      exitCode: 0,
      stderr: 'err',
      stdout: 'out',
    });
  });

  it('resolves rather than rejecting on a non-zero exit', async ({ expect }) => {
    const script = 'process.stderr.write("boom");process.exit(3)';

    await expect(execute(process.execPath, ['-e', script])).resolves.toStrictEqual({
      exitCode: 3,
      stderr: 'boom',
      stdout: '',
    });
  });

  it('rejects when the command cannot be spawned', async ({ expect }) => {
    await expect(execute('gtb-no-such-binary-xyz', [])).rejects.toThrow(/./v);
  });
});

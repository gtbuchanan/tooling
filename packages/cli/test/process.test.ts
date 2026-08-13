import { faker } from '@faker-js/faker';
import { describe, it } from 'vitest';
import { capture, execute, resolveExitCode } from '#src/lib/process.js';

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

  /*
   * A killed command must never look successful. Platforms differ in how they
   * report the kill (POSIX gives a signal and no code, Windows an exit code),
   * so this asserts the contract they share: not zero.
   */
  it('reports a non-zero code when the command is killed', async ({ expect }) => {
    const script = 'process.kill(process.pid, "SIGKILL")';
    const { exitCode } = await execute(process.execPath, ['-e', script]);

    expect(exitCode).not.toBe(0);
  });
});

describe.concurrent(resolveExitCode, () => {
  it('keeps the code of a process that exited on its own', ({ expect }) => {
    const code = faker.number.int({ max: 255, min: 1 });

    expect(resolveExitCode(code, undefined)).toBe(code);
  });

  it('reports the shell convention for a signal kill', ({ expect }) => {
    // 128 + the signal number, as `$?` would report it.
    expect(resolveExitCode(undefined, 'SIGKILL')).toBe(137);
    expect(resolveExitCode(undefined, 'SIGTERM')).toBe(143);
  });

  it('reports a failure when neither a code nor a signal is given', ({ expect }) => {
    expect(resolveExitCode(undefined, undefined)).not.toBe(0);
  });
});

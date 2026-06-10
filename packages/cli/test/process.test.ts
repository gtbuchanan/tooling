import { describe, it } from 'vitest';
import { capture } from '#src/lib/process.js';

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

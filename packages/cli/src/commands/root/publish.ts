import { defineCommand } from 'citty';
import { createLogger } from '../../lib/logger.ts';
import { executePublishPkl } from '../../lib/pkl-release.ts';
import { capture, run } from '../../lib/process.ts';
import { rootNames } from './names.ts';

/**
 * `gtb publish` — publishes every non-npm package to its release channel.
 * Channel dispatch lives here: today that's the Pkl GitHub-release channel; a
 * future channel (e.g. .NET/NuGet) adds its own `executePublish*` call. Each
 * channel is idempotent and a no-op when the workspace ships no such package,
 * so CD can run this unconditionally once a repo opts into native publishing.
 */
export const publish = defineCommand({
  meta: {
    description: 'Publish non-npm packages to their release channels (idempotent)',
    name: rootNames.publish,
  },
  run: () =>
    executePublishPkl({ capture, cwd: process.cwd(), logger: createLogger(), run }),
});

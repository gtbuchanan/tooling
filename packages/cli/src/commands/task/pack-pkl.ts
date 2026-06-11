import { defineCommand } from 'citty';
import { pklPackDestination } from '../../lib/pkl-release.ts';
import { run } from '../../lib/process.ts';

/**
 * Packages the Pkl project into `dist/packages/pkl/` via `pkl project
 * package`, producing the `<name>@<version>` metadata, `.zip`, and
 * `.zip.sha256` assets uploaded to the GitHub release. The sole
 * artifact-producing Pkl task.
 */
export const packPkl = defineCommand({
  meta: {
    description: 'Package the Pkl project to dist/packages/pkl via `pkl project package`',
    name: 'pack:pkl',
  },
  run: async ({ rawArgs }) => {
    await run('pkl', {
      args: ['project', 'package', '--output-path', pklPackDestination, ...rawArgs],
    });
  },
});

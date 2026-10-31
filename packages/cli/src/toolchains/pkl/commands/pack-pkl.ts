import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { packPklLeaf } from '#src/toolchains/pkl/leaves.js';
import { pklPackDestination } from '#src/toolchains/pkl/pkl-pack.js';

/**
 * Packages the Pkl project into `dist/packages/pkl/` via `pkl project
 * package`, producing the `<name>@<version>` metadata, `.zip`, and
 * `.zip.sha256` assets uploaded to the GitHub release. The sole
 * artifact-producing Pkl task.
 */
export const packPkl = defineCommand({
  meta: {
    description: 'Package the Pkl project to dist/packages/pkl via `pkl project package`',
    name: packPklLeaf.name,
  },
  run: async ({ rawArgs }) => {
    await run('pkl', {
      args: ['project', 'package', '--output-path', pklPackDestination, ...rawArgs],
    });
  },
});

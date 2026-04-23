import { defineCommand } from 'citty';
import { toPosixRelative } from '../../lib/paths.ts';
import { run } from '../../lib/process.ts';
import { loadSkillsConfig } from '../../lib/skills-config.ts';
import { resolveWorkspace } from '../../lib/workspace.ts';

/**
 * Deploys the current package's authored skills to the agent directories
 * configured in the workspace-root `skills-npm.config.ts`.
 */
export const deploySkills = defineCommand({
  meta: {
    description: 'Deploy the current package\'s skills to agent directories',
    name: 'deploy:skills',
  },
  run: async () => {
    const { rootDir } = resolveWorkspace();
    const { agents } = await loadSkillsConfig(rootDir);
    const agentFlags = agents.flatMap(agent => ['--agent', agent]);

    const relPath = toPosixRelative(rootDir, process.cwd());
    const target = relPath === '' ? '.' : `./${relPath}`;

    await run('skills', {
      args: ['add', target, '--skill', '*', '--yes', ...agentFlags],
      cwd: rootDir,
    });
  },
});

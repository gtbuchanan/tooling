import { defineCommand } from 'citty';
import { toPosixRelative } from '../../lib/paths.ts';
import { run } from '../../lib/process.ts';
import { loadConfiguredAgents } from '../../lib/skills-config.ts';
import { resolveWorkspace } from '../../lib/workspace.ts';

const detectAgents = async (): Promise<readonly string[]> => {
  try {
    const { getDetectedAgents } = await import('skills-npm');
    return await getDetectedAgents();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      return [];
    }
    throw error;
  }
};

/**
 * Deploys the current package's authored skills to the agent directories
 * listed in the workspace-root `skills-npm.config.ts`, falling back to
 * agents detected on the machine when no config is present. No-ops when
 * no agents are configured or detected.
 */
export const deploySkills = defineCommand({
  meta: {
    description: 'Deploy the current package\'s skills to agent directories',
    name: 'deploy:skills',
  },
  run: async () => {
    const { rootDir } = resolveWorkspace();
    const configured = await loadConfiguredAgents(rootDir);
    const agents = configured.length > 0 ? configured : await detectAgents();
    if (agents.length === 0) {
      console.log('No agents detected, skipping skill deployment');
      return;
    }

    const relPath = toPosixRelative(rootDir, process.cwd());
    const target = relPath === '' ? '.' : `./${relPath}`;
    const agentFlags = agents.flatMap(agent => ['--agent', agent]);

    await run('skills', {
      args: ['add', target, '--skill', '*', '--yes', ...agentFlags],
      cwd: rootDir,
    });
  },
});

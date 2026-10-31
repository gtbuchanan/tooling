/**
 * Turborepo task definition.
 */
export interface TurboTask {
  /**
   * Opts a task out of caching entirely. Omitted means turbo's default (`true`).
   */
  readonly cache?: boolean;
  readonly dependsOn?: readonly string[];
  readonly env?: readonly string[];
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
}

/**
 * Creates a topological (cross-package) task dependency.
 */
export const topo = (task: string): string => `^${task}`;

const rootTaskPrefix = '//#';

/**
 * Turbo task key for tasks dispatched at the workspace root.
 */
export const rootTaskKey = (name: string): string => `${rootTaskPrefix}${name}`;

/**
 * Whether a task key names a root task rather than a package task.
 */
export const isRootTaskKey = (key: string): boolean => key.startsWith(rootTaskPrefix);

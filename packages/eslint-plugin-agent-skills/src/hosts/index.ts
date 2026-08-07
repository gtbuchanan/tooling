import type { SkillFrontmatterExtensions } from '../frontmatter-schema.ts';
import { claudeCodeFrontmatterExtensions } from './claude-code.ts';

/**
 * Agent hosts whose `SKILL.md` frontmatter extensions ship with this
 * package, keyed by the name
 * {@link ../frontmatter-schema.ts | `defineSkillFrontmatterSchema`}
 * accepts. Adding a host is an entry here — every host is just a
 * property map layered onto the spec schema.
 *
 * The Agent Skills spec sanctions only the nested `metadata` map for
 * client-specific data, so a host that puts fields at the top level has
 * to have each one declared. There is no reserved top-level namespace
 * to pattern-match instead.
 */
export const skillFrontmatterHosts = {
  'claude-code': claudeCodeFrontmatterExtensions,
} as const satisfies Readonly<Record<string, SkillFrontmatterExtensions>>;

/**
 * Name of an agent host this package ships extensions for.
 */
export type SkillFrontmatterHost = keyof typeof skillFrontmatterHosts;

import frontmatter from '@gtbuchanan/eslint-plugin-md-frontmatter';
import type { ESLint } from 'eslint';
import { describe, it } from 'vitest';
import plugin, { configs, defineSkillFrontmatterConfig } from '#src/index.js';
import manifest from '../package.json' with { type: 'json' };

/*
 * Every third-party plugin an exported config registers has to be a peer
 * dependency. ESLint rejects a namespace registered by two configs unless
 * both pass the identical plugin object, so a consumer config that registers
 * the same namespace — `@gtbuchanan/eslint-config` registers `markdown` for
 * every Markdown file — must resolve to the copy this plugin imports. Only a
 * peer dependency guarantees that; as a regular dependency the published pins
 * drift apart on the next release cut and a second copy gets installed.
 *
 * Workspace-owned plugins are exempt: changesets bumps every dependent in the
 * same release, so their specs cannot drift apart. They are matched by object
 * identity rather than by name because neither declares `meta`, and identity
 * keeps the exemption correct if either ever starts to.
 */
const isWorkspacePlugin = (candidate: ESLint.Plugin): boolean =>
  candidate === plugin || candidate === frontmatter;

/*
The overlay registers plugins of its own, so it is covered too.
*/
const exported = [
  ...Object.values(configs).flat(),
  ...defineSkillFrontmatterConfig('claude-code'),
];

const thirdPartyPlugins = [
  ...new Set(exported.flatMap(config => Object.values(config.plugins ?? {}))),
].filter(registered => !isWorkspacePlugin(registered));

const thirdPartyPluginNames = [
  ...new Set(
    thirdPartyPlugins
      .map(({ meta }) => meta?.name)
      .filter(name => name !== undefined),
  ),
];

describe('exported configs plugin resolution', () => {
  /*
   * `meta.name` is how a third-party plugin is traced back to the package
   * that has to be a peer. One that omits it would otherwise drop out of the
   * derived list silently, and the peer assertions below would pass without
   * ever covering it.
   */
  it('exposes a package name for every third-party plugin', ({ expect }) => {
    const unidentified = thirdPartyPlugins.filter(
      ({ meta }) => meta?.name === undefined,
    );

    expect(unidentified).toStrictEqual([]);
  });

  it('registers at least one third-party plugin', ({ expect }) => {
    expect(thirdPartyPluginNames).not.toStrictEqual([]);
  });

  it.for(thirdPartyPluginNames)(
    'declares %s as a peer dependency',
    (packageName, { expect }) => {
      expect(Object.keys(manifest.peerDependencies)).toContain(packageName);
    },
  );
});

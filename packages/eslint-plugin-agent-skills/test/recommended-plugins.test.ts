import { describe, it } from 'vitest';
import { configs } from '#src/index.js';
import manifest from '../package.json' with { type: 'json' };

/*
 * Every third-party plugin `configs.recommended` registers has to be a peer
 * dependency. ESLint rejects a namespace registered by two configs unless
 * both pass the identical plugin object, so a consumer config that registers
 * the same namespace — `@gtbuchanan/eslint-config` registers `markdown` for
 * every Markdown file — must resolve to the copy this plugin imports. Only a peer
 * dependency guarantees that; as a regular dependency the published pins
 * drift apart on the next release cut and a second copy gets installed.
 *
 * Workspace siblings (`@gtbuchanan/*`) are exempt: changesets bumps every
 * dependent in the same release, so their specs cannot drift apart.
 */
const thirdPartyPluginNames = [
  ...new Set(
    configs.recommended
      .flatMap(config => Object.values(config.plugins ?? {}))
      .map(plugin => plugin.meta?.name)
      .filter(name => name !== undefined)
      .filter(name => !name.startsWith('@gtbuchanan/')),
  ),
];

describe('configs.recommended plugin resolution', () => {
  /*
   * Guards the derivation itself. Every name comes from `meta.name`, which is
   * optional — if upstream drops it the list silently empties and every
   * assertion below passes vacuously.
   */
  it('identifies the third-party plugins it registers', ({ expect }) => {
    expect(thirdPartyPluginNames).not.toStrictEqual([]);
  });

  it.for(thirdPartyPluginNames)(
    'declares %s as a peer dependency',
    (packageName, { expect }) => {
      expect(Object.keys(manifest.peerDependencies)).toContain(packageName);
    },
  );
});

import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import type { CapabilitySource } from '#src/core/capability.js';
import type { Manifest } from '#src/core/manifest.js';
import { published } from '#src/toolchains/npm/capabilities.js';

const source = (manifest: Manifest): CapabilitySource => ({ dir: '/repo', entries: [], manifest });

describe.concurrent('published', () => {
  it('holds for a package naming a publish directory', ({ expect }) => {
    const manifest = { publishConfig: { directory: build.publishDirectory() } };

    expect(published.detect(source(manifest))).toBe(true);
  });

  it('does not hold for a private package, whatever its publish directory', ({ expect }) => {
    const manifest = { private: true, publishConfig: { directory: build.publishDirectory() } };

    expect(published.detect(source(manifest))).toBe(false);
  });

  // `pack:npm` packs from the publish directory, so without one there is no tarball.
  it('does not hold for a public package naming no publish directory', ({ expect }) => {
    expect(published.detect(source({}))).toBe(false);
  });
});

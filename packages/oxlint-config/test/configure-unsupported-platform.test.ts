import { describe, it, vi } from 'vitest';
import { configure } from '#src/index.js';

vi.mock(import('#src/platform.js'), () => ({ jsPluginsSupported: false }));

describe('configure on unsupported platforms', () => {
  it('omits jsPlugins', ({ expect }) => {
    const config = configure();

    expect(config.jsPlugins).toBeUndefined();
  });

  it('omits stylistic rules', ({ expect }) => {
    const config = configure();

    expect(config.rules?.['@stylistic/semi']).toBeUndefined();
    expect(config.rules?.['@stylistic/max-len']).toBeUndefined();
  });
});

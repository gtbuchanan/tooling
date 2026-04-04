import { defineConfig, mergeConfig } from 'vitest/config';
import { configureGlobal } from '@gtbuchanan/vitest-config/configure';

export default mergeConfig(
  configureGlobal({ projects: ['packages/*'] }),
  defineConfig({
    test: {
      coverage: {
        include: ['packages/*/src/**'],
      },
    },
  }),
);

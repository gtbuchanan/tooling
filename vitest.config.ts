import { defineConfig, mergeConfig } from 'vitest/config';
import { configureGlobal } from '@gtbuchanan/vitest-config/configure';

export default mergeConfig(
  configureGlobal(),
  defineConfig({
    test: {
      coverage: {
        include: ['packages/*/src/**'],
      },
      projects: ['packages/*'],
    },
  }),
);

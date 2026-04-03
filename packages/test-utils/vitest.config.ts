import { configureProject } from '@gtbuchanan/vitest-config/configure';
import { defineProject } from 'vitest/config';

export default defineProject(configureProject(import.meta.dirname));

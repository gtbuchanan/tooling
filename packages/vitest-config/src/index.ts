export {
  buildGlobalConfig,
  buildProjectConfig,
  buildWorkspaceEntry,
  configure,
  configureGlobal,
  configureProject,
  coverageInclude,
  excludeDefault,
  resolveProjectDirs,
  resolveSetupFiles,
  type VitestConfigureGlobalOptions,
  type VitestConfigureOptions,
} from './configure.js';

export {
  configureEndToEnd,
  configureEndToEndGlobal,
  configureEndToEndProject,
  type VitestEndToEndConfigureGlobalOptions,
  type VitestEndToEndConfigureOptions,
} from './configure-e2e.js';

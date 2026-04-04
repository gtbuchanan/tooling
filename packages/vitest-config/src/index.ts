export {
  buildGlobalConfig,
  buildProjectConfig,
  buildWorkspaceEntry,
  configure,
  configureGlobal,
  configureProject,
  coverageInclude,
  defaultCoverageDirs,
  excludeDefault,
  resolveCoverageInclude,
  resolveProjectDirs,
  resolveSetupFiles,
  type VitestConfigureGlobalOptions,
  type VitestConfigureOptions,
} from './configure.ts';

export {
  configureEndToEnd,
  configureEndToEndGlobal,
  configureEndToEndProject,
  type VitestEndToEndConfigureGlobalOptions,
  type VitestEndToEndConfigureOptions,
} from './configure-e2e.ts';

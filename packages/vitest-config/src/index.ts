export {
  buildGlobalConfig,
  buildProjectConfig,
  buildWorkspaceEntry,
  configure,
  configureGlobal,
  configurePackage,
  configureProject,
  coverageInclude,
  defaultCoverageDirs,
  excludeDefault,
  resolveCoverageInclude,
  resolveProjectDirs,
  resolveSetupFiles,
  type VitestConfigureGlobalOptions,
  type VitestConfigureOptions,
  type VitestSlowTagOptions,
} from './configure.ts';

export {
  configureEndToEnd,
  configureEndToEndGlobal,
  configureEndToEndProject,
  type VitestEndToEndConfigureGlobalOptions,
  type VitestEndToEndConfigureOptions,
} from './configure-e2e.ts';

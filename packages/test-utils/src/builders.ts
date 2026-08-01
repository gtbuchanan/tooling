import { faker } from '@faker-js/faker';

const arbitraryRecord = <V>(
  keyFn: () => string,
  valueFn: () => V,
): Record<string, V> =>
  Object.fromEntries(
    faker.helpers.multiple(() => [keyFn(), valueFn()], {
      count: { min: 1, max: 3 },
    }),
  );

const exportSubpath = (): string => `./${faker.lorem.slug()}`;

const importSubpath = (): string => `#${faker.lorem.slug()}/*`;

/** Arbitrary `bin` map (executable name → relative script path). */
export const binMap = (): Record<string, string> =>
  arbitraryRecord(packageName, relativePath);

/** Arbitrary `dependencies` / `devDependencies` map (package name → semver range). */
export const dependencyMap = (): Record<string, string> =>
  arbitraryRecord(scopedPackageName, semverRange);

/** Arbitrary `exports` map (subpath → relative file path). */
export const exportsMap = (): Record<string, string> =>
  arbitraryRecord(exportSubpath, relativePath);

/** Arbitrary GitHub `https://...git` clone URL. */
export const gitHubGitUrl = (): string => `${gitHubRepoUrl()}.git`;

/** Arbitrary GitHub issues URL. */
export const gitHubIssuesUrl = (): string => `${gitHubRepoUrl()}/issues`;

/** Arbitrary GitHub repo homepage URL, e.g. `https://github.com/owner/repo`. */
export const gitHubRepoUrl = (): string =>
  `https://github.com/${faker.internet.domainWord()}/${faker.internet.domainWord()}`;

/** Arbitrary `imports` map (`#`-prefixed subpath → relative file path). */
export const importsMap = (): Record<string, string> =>
  arbitraryRecord(importSubpath, relativePath);

/** Arbitrary monorepo package directory, e.g. `packages/foo`. */
export const packageDirectory = (): string =>
  `packages/${faker.internet.domainWord()}`;

/** Arbitrary unscoped npm package name. */
export const packageName = (): string => faker.internet.domainWord();

/** Arbitrary platform-tag list suitable for `os` / `cpu` / `libc`. */
export const platformList = (): string[] => [faker.lorem.word()];

/** Arbitrary `publishConfig.directory` value, e.g. `dist/source`. */
export const publishDirectory = (): string =>
  `dist/${faker.lorem.slug()}`;

/** Arbitrary relative POSIX file path, e.g. `./foo.js`. */
export const relativePath = (): string => `./${faker.lorem.slug()}.js`;

/** Arbitrary scoped npm package name, e.g. `@scope/name`. */
export const scopedPackageName = (): string =>
  `@${faker.internet.domainWord()}/${faker.internet.domainWord()}`;

/** Arbitrary `scripts` map (script name → shell command). */
export const scriptMap = (): Record<string, string> =>
  arbitraryRecord(
    () => faker.lorem.word(),
    () => faker.lorem.words({ min: 1, max: 3 }),
  );

/** Arbitrary semver range prefixed with `^`, e.g. `^1.2.3`. */
export const semverRange = (): string => `^${faker.system.semver()}`;

/** Arbitrary semver version with no range prefix, e.g. `1.2.3`. */
export const semverVersion = (): string => faker.system.semver();

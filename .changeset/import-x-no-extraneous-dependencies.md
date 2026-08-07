---
'@gtbuchanan/eslint-config': minor
---

Enable `import-x/no-extraneous-dependencies`

Importing a package the manifest does not declare resolves only through
layout: Node walks up to a parent `node_modules` and finds it there. That
works until the package moves, and it leaves any version range the
dependency declares unenforced for the importing package.

The rule reports imports missing from the importing package's own
manifest. Consumers that rely on a parent manifest to satisfy imports will
see new warnings, which `--max-warnings=0` turns into a CI failure — hence
the minor bump. Declaring the dependency in the package that imports it is
the fix; `catalog:` keeps the version in one place for pnpm workspaces.

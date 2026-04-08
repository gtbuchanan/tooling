# @gtbuchanan/tsconfig

Shared TypeScript configuration based on
[@tsconfig/strictest](https://github.com/tsconfig/bases).

The `@tsconfig/strictest` options are inlined at build time, so consumers
do not need it installed.

## Install

```sh
pnpm add -D @gtbuchanan/tsconfig
```

## Usage

```json
{
  "extends": ["@gtbuchanan/tsconfig/node.json"],
  "compilerOptions": {
    "outDir": "dist"
  }
}
```

## Node Config

Includes all `@tsconfig/strictest` options plus:

- `target`: ES2024
- `lib`: ES2024
- `module`: nodenext
- `moduleResolution`: nodenext
- `types`: node

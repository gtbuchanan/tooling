# @gtbuchanan/tsconfig

Shared TypeScript base configuration extending
[@tsconfig/strictest](https://github.com/tsconfig/bases).

## Install

```sh
pnpm add -D @gtbuchanan/tsconfig
```

## Usage

```json
{
  "extends": ["@gtbuchanan/tsconfig/base.json"],
  "compilerOptions": {
    "outDir": "dist"
  }
}
```

## Base config

Extends `@tsconfig/strictest` with:

- `target`: ES2022
- `lib`: ES2022
- `module`: nodenext
- `moduleResolution`: nodenext

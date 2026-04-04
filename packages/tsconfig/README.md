# @gtbuchanan/tsconfig

Shared TypeScript configuration extending
[@tsconfig/strictest](https://github.com/tsconfig/bases).

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

## Node config

Extends `@tsconfig/strictest` with:

- `target`: ES2024
- `lib`: ES2024
- `module`: nodenext
- `moduleResolution`: nodenext
- `types`: node

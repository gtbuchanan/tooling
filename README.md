# @gtbuchanan/tooling

Shared build configuration monorepo for JavaScript/TypeScript projects.

## Packages

| Package | Description |
|---|---|
| [@gtbuchanan/eslint-config](packages/eslint-config) | Shared ESLint configuration |
| [@gtbuchanan/oxfmt-config](packages/oxfmt-config) | Shared oxfmt configuration |
| [@gtbuchanan/oxlint-config](packages/oxlint-config) | Shared oxlint configuration |
| [@gtbuchanan/tsconfig](packages/tsconfig) | Shared TypeScript base configuration |
| [@gtbuchanan/vitest-config](packages/vitest-config) | Shared Vitest configuration |

## Development

```sh
pnpm install
pnpm build
```

### Scripts

- `pnpm check` — Compile, lint, and test (fast, use during development)
- `pnpm build` — Full pipeline including pack + e2e (slower, use before commit)
- `pnpm compile` — TypeScript compilation
- `pnpm lint` — oxlint + ESLint
- `pnpm test` — Unit tests
- `pnpm test:e2e` — E2E tests (requires `pnpm pack` first)

### Versioning

Uses [changesets](https://github.com/changesets/changesets) for per-package
versioning. Run `pnpm changeset` to declare which packages changed.

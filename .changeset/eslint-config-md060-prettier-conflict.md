---
'@gtbuchanan/eslint-config': patch
---

Disable markdownlint MD060 (`table-column-style`), which conflicts with Prettier

Prettier (via `eslint-plugin-format`) already owns Markdown table formatting and aligns pipe columns. markdownlint's `table-column-style` (MD060) ships its own autofixer that rewrites tables to compact pipes, so the two fixers oscillate — ESLint applies one, the other reverts it, and once the fix-pass limit is reached the run bails with a half-formatted table and unresolvable warnings (fatal under `--max-warnings=0`). MD060 now joins the other `prettierConflicts` rules disabled in the markdownlint config, leaving table formatting to Prettier.

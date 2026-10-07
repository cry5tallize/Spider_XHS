# Frontend

Run commands from `desktop/frontend`:

- `pnpm dev`: start Vite.
- `pnpm format`: format source and configuration files.
- `pnpm check`: check formatting, ESLint, and TypeScript.
- `pnpm test`: run interaction tests.
- `pnpm build`: typecheck and build production assets.

Prettier owns formatting; ESLint checks code quality. `eslint-config-prettier` is
last in the ESLint configuration to prevent conflicting style rules. Generated
Wails bindings, build output, copied public assets, and the lockfile are excluded
from formatting.

Formatting uses two spaces, single quotes in JavaScript/TypeScript, semicolons,
trailing commas, a 100-character print width, and LF line endings. In VS Code,
use the Prettier extension (`esbenp.prettier-vscode`) as the formatter and enable
format on save. It discovers this directory's configuration automatically.

The `@/` alias is relative to `tsconfig.json` through `paths`, without `baseUrl`.
Vite and Vitest use the same alias. Select the workspace TypeScript version in
your editor to match the compiler used by `pnpm typecheck`.

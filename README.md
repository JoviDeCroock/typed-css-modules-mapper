# typed-css-modules-mapper

A [TypeScript 7.1 content mapper](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/)
that types `.module.css` imports straight from the CSS. There are no generated `.d.ts` files to
keep in sync: every `tsc` run and every editor session reads the classes from the stylesheet itself.

```css
/* button.module.css */

/** The main call to action. */
.button {
  color: white;
}

.button-primary {
  composes: button;
  background: rebeccapurple;
}
```

```ts
import styles, { button } from "./button.module.css";

styles.button; // string
styles["button-primary"]; // string
styles.buttonSecondary;
//     ~~~~~~~~~~~~~~~ Property 'buttonSecondary' does not exist on type '{ readonly button: string; ... }'.
```

It works with `tsc` from TypeScript 7.1 and with [`tsrs`](https://www.npmjs.com/package/tsrs), and
both report the same diagnostics.

## Setup

Install the mapper next to TypeScript 7.1, which is currently `typescript@beta`:

```sh
npm install --save-dev typed-css-modules-mapper typescript@beta
```

Register it for `.module.css` files in your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    // ...
  },
  "contentMappers": [
    {
      "package": "typed-css-modules-mapper",
      "extensions": [".module.css"],
      "options": {
        // Match your bundler, see below.
        "localsConvention": "camelCaseOnly",
      },
    },
  ],
}
```

Content mappers run external code, so the compiler only starts them when you opt in:

```sh
tsc --runExternalCode
tsrs --runExternalCode
```

Without the flag, `tsc` fails with `TS18068: Content mappers require the '--runExternalCode'
command line flag to be enabled.`

You can delete any `declare module "*.module.css"` declarations you wrote by hand. Types from the
mapper also take precedence over the loose ones in `vite/client`, so that one can stay.

## Editor support

In VS Code with TypeScript 7.1, the mapper runs once the workspace is trusted and content mappers
are allowed. You can turn them off with the `js/ts.contentMappers.enabled` setting. Then:

- _Go to Definition_ on `styles.button` or on a named import jumps to `.button` in the CSS, even
  when `localsConvention` renamed it.
- Hover shows the rule that declares the name, after its `/** … */` doc comment if it has one.
- Completions list every class, id, and keyframes name in the file.

The `tsrs` language server (0.18) doesn't load content mappers yet, so these only work with the
TypeScript 7.1 language server for now. `tsrs` on the command line works.

## What gets exported

Every locally scoped name in the file becomes a `string`:

- classes (`.button`) and ids (`#main`), including inside `@media`, `@supports`, `@layer`,
  `@scope` preludes, nested rules, and `:is()`, `:not()`, or `:where()`
- `@keyframes` names
- `@value` definitions and imports (`@value primary: red`, `@value brand as b from "./colors.css"`)
- ICSS `:export { key: value }` keys
- names inside `:local(...)`, or after `:local`

Names inside `:global(...)` or after `:global` are left out, the same as CSS Modules leaves them
unscoped. Like `postcss-modules`, `:global` and `:local` are case-sensitive. Escaped names are
unescaped, so `.sm\:flex` is `styles["sm:flex"]`.

The default export is an object with every name. Names that are valid identifiers are also named
exports. Reserved words like `default` and names like `button-primary` are only available on
the default export.

## Options

| Option             | Default | Description                                                                         |
| ------------------ | ------- | ----------------------------------------------------------------------------------- |
| `localsConvention` | none    | `"camelCase"`, `"camelCaseOnly"`, `"dashes"`, or `"dashesOnly"`. Names are kept as written when it's not set. |
| `namedExports`     | `true`  | Export names that are valid identifiers as named exports.                           |
| `defaultExport`    | `true`  | Export an object with every name as the default export.                             |

`localsConvention` uses the values from Vite's
[`css.modules.localsConvention`](https://vite.dev/config/shared-options#css-modules) and
[`postcss-modules`](https://github.com/madyankin/postcss-modules#localsconvention):

| Value           | `.btn-primary` becomes          |
| --------------- | ------------------------------- |
| not set         | `"btn-primary"`                 |
| `camelCase`     | `"btn-primary"` and `btnPrimary` |
| `camelCaseOnly` | `btnPrimary`                    |
| `dashes`        | `"btn-primary"` and `btnPrimary` |
| `dashesOnly`    | `btnPrimary`                    |

`camelCase` converts the way `lodash.camelcase` does (`icon_large` becomes `iconLarge`), while
`dashes` only converts dashes.

Set the same convention your bundler uses, because the mapper only produces types. With
[css-loader](https://github.com/webpack-contrib/css-loader#namedexport) 7, which uses named exports
and no default export, set `"defaultExport": false` and use `import * as styles` or named imports.

Invalid options are reported on the `contentMappers` entry in your `tsconfig.json`.

## Diagnostics

The mapper reports CSS problems in the `.module.css` file itself, under the `css-modules` source:

- `css-modules1`: CSS syntax errors, such as an unclosed block. The mapper still exports every
  name it can recover, so one typo doesn't break every import.
- `css-modules2`: `composes` of a class that isn't defined in the same file. Names composed
  `from` another file or `from global` aren't checked.

Like syntax errors in TypeScript files, these stop `tsc` before it reports type errors, so fix
them first.

The mapper doesn't validate the rest of your CSS. Use a linter such as
[Stylelint](https://stylelint.io) for that. Sass, Less, and other CSS dialects aren't supported.

## Runtime

TypeScript only type-checks `.module.css` files and never emits JavaScript for them. Your bundler
(Vite, webpack, Rspack, Parcel, …) still handles the CSS at runtime.

## Compatibility

- TypeScript 7.1 or later (`typescript@beta` today), or `tsrs` 0.18 or later
- Node.js 22.18 or later

## Security

`tsc` normally doesn't execute third-party code. Content mappers break that boundary on purpose,
which is why both compilers require `--runExternalCode` and editors require workspace trust.

## Repository

| Path                                | What it is                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/typed-css-modules-mapper` | The published mapper                                                                    |
| `e2e`                               | Fixtures run through the real `tsc` and `tsrs` binaries, and the `tsc` language server |
| `examples/vite`                     | A Vite app whose CSS module types match its runtime                                     |

## Development

```sh
pnpm install
pnpm run verify   # build, format check, lint, typecheck, unit and e2e tests
```

`pnpm format` and `pnpm lint` fix what `verify` reports. Changes to the published package need a
changeset (`pnpm changeset`).

The user documentation above is shared with the [package README](./packages/typed-css-modules-mapper/README.md),
which is what npm shows. Edit it there and copy it here; a test fails when the two drift apart.

## License

[MIT](./LICENSE)

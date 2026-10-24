# typed-css-modules-mapper

Type `.module.css` imports straight from the CSS with a
[TypeScript 7.1 content mapper](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/).
No generated `.d.ts` files, with go-to-definition and hover into the stylesheet. Checked against
both `tsc` 7.1 and `tsrs`.

See the [package README](./packages/typed-css-modules-mapper/README.md) for setup and options.

## Repository

| Path                                 | What it is                                                          |
| ------------------------------------ | ------------------------------------------------------------------- |
| `packages/typed-css-modules-mapper` | The published mapper                                                |
| `e2e`                                | Fixtures run through the real `tsc` and `tsrs` binaries, and the `tsc` language server |
| `examples/vite`                      | A Vite app whose CSS module types match its runtime                 |

## Development

```sh
pnpm install
pnpm run verify   # build, format check, lint, typecheck, unit and e2e tests
```

`pnpm format` and `pnpm lint` fix what `verify` reports. Changes to the published package need a
changeset (`pnpm changeset`).

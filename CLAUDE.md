# InjectKit

Lightweight, type-safe DI container for TypeScript. ESM-only, published to npm as `injectkit` by Marooned Software.

Usage flow: build an `InjectKitRegistry`, register with the fluent API (`.register(Id).useClass(Impl).asSingleton()`), call `registry.build()` (which validates), get an `InjectKitContainer`, resolve with `container.get(Id)`.

## Commands

```bash
pnpm run build     # tsup bundle + tsc declarations
pnpm run test      # vitest
pnpm run lint      # eslint --fix
pnpm run changeset # changeset + version bump (required for any user-facing change)
```

## Gotchas

- **`@Injectable()` does nothing at runtime.** It is an identity decorator; its only job is to make TypeScript emit `design:paramtypes` metadata. Omitting it on a class that uses constructor injection silently breaks resolution rather than erroring at the decorator. Any test fixture with constructor injection needs it.
- **Decorator metadata depends on the toolchain, not just the code.** `experimentalDecorators` + `emitDecoratorMetadata` in tsconfig, and `unplugin-swc` in the vitest config. Tests fail in confusing ways if either is dropped.
- **Imports need explicit `.js` extensions** (NodeNext resolution), including in tests.
- **Validation is build-time, not resolve-time.** Missing-dependency and circular-dependency checks run in `registry.build()` via DFS. New registration kinds must be taught to the validator or they bypass it.
- **`Container` is auto-registered** as a singleton factory, so services can inject the container itself. Do not treat it as an unregistered identifier.
- **Scoped containers form a parent chain.** Scoped instances cache on the scope that resolves them; singletons bubble to the root container. Getting this backwards is the easiest lifetime bug to introduce.
- **`useInstance` is always a singleton** regardless of any lifetime call.
- **ESLint reports everything as warnings** (`eslint-plugin-only-warn`), so a clean exit code does not mean a clean lint. Read the output.

## Conventions

- Public types live in `src/interfaces.ts` only; internal types in `src/internal.ts`. New public items must also be exported from `src/index.ts`.
- Tests live in top-level `tests/`, never colocated in `src/`.
- Strict TS with `noUncheckedIndexedAccess`. No CommonJS, no UMD.

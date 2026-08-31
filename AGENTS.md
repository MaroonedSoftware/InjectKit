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

## Source layout

| File | Contents |
| ---- | -------- |
| `src/index.ts` | Barrel. Five `export *` lines; the entire public surface. |
| `src/interfaces.ts` | Public types, the abstract `Container` class, `formatIdentifier`. |
| `src/internal.ts` | Internal `Registration<T>` only. Marked `@internal`, not re-exported. |
| `src/registry.ts` | `InjectKitRegistry`, `InjectKitRegistration`, `createRegistry`, build-time DFS validation. |
| `src/container.ts` | `InjectKitContainer`: resolution, lifetime caching, scopes, override, disposal. |
| `src/container.noop.ts` | `InjectKitContainerNoop`, the null-object container. |
| `src/injectable.ts` | `@Injectable`, `@Singleton`, `@Scoped`, `@Transient`, `@Provider`. |
| `src/metadata.ts` | `ServiceMetadata`, `MetadataRegistry`, `DefaultMetadataRegistry`, `getDefaultMetadataRegistry`. |
| `src/async-disposable-stack.ts` | `AsyncDisposableStack` polyfill. Not exported from the barrel. |

## Gotchas

- **`@Injectable()` does nothing at runtime.** It is an identity decorator; its only job is to make TypeScript emit `design:paramtypes` metadata. Omitting it on a class that uses constructor injection silently breaks resolution rather than erroring at the decorator. Any test fixture with constructor injection needs it.
- **Decorator metadata depends on the toolchain, not just the code.** `experimentalDecorators` + `emitDecoratorMetadata` in tsconfig, and `unplugin-swc` in the vitest config. Tests fail in confusing ways if either is dropped.
- **Imports need explicit `.js` extensions** (NodeNext resolution), including in tests.
- **Validation is build-time, not resolve-time.** Missing-dependency and circular-dependency checks run in `registry.build()` via DFS. New registration kinds must be taught to the validator or they bypass it.
- **`Container` is auto-registered** as a singleton factory, so services can inject the container itself. Do not treat it as an unregistered identifier.
- **Scoped containers form a parent chain.** Scoped instances cache on the scope that resolves them; singletons bubble to the root container. Getting this backwards is the easiest lifetime bug to introduce.
- **Singletons resolve their dependencies from the root container**, not from the scope that triggered construction. This is deliberate: a singleton cached at the root would otherwise capture the first resolving scope's instances and `override()` values forever, and keep using them after that scope is disposed. Singleton factories are handed the root container for the same reason. Reverting this to `this.get(dep)` reintroduces a real production bug (a request transaction captured into a singleton repository).
- **A singleton may not depend on a scoped registration.** `build()` rejects it, following transient links to catch indirect captures. Factory registrations declare no dependencies, so this check cannot see through `useFactory`.
- **`useInstance` and `useValue` are always singletons** regardless of any lifetime call.
- **There are two build targets.** Node ESM (`.` → `dist/index.js`) and a browser bundle (`./browser` → `dist/browser/injectkit.js`, built by `tsup.browser.config.ts`). Browser consumers cannot rely on `emitDecoratorMetadata`, because bundlers strip it. Anything touching dependency extraction must keep the explicit `@Injectable({ deps: [...] })` path working, and `pnpm run test:browser` must stay green.
- **`tests/` is not type-checked by `pnpm run test`.** Vitest compiles with SWC, which strips types without checking them, and `tests/` sits outside the build tsconfig's `include`. A passing test proves runtime behavior, not API shape. Verify the public surface against `src/interfaces.ts` rather than against a passing test.
- **ESLint reports everything as warnings** (`eslint-plugin-only-warn`), so a clean exit code does not mean a clean lint. Read the output.

## `llms.txt` is a shipped artifact

[`llms.txt`](llms.txt) is a self-contained API reference written for LLMs and coding agents. It is listed in `package.json` `files`, so it goes out in the npm tarball alongside `dist/**` and consumers read it from `node_modules/injectkit/llms.txt`.

That makes it code, not prose:

- Any change to public behavior or the public API must be reflected there in the same commit. A behavior change that updates `src/` but not `llms.txt` is incomplete.
- Its behavioral claims are pinned by [`tests/llms-claims.test.ts`](tests/llms-claims.test.ts). A failure there means the doc is lying, not that a test broke. Newly documented behavior needs a new case.
- Changing it requires a changeset, the same as changing `dist/**`, because it ships.

## Conventions

- Public types live in `src/interfaces.ts` only; internal types in `src/internal.ts`. New public items must also be exported from `src/index.ts`.
- Tests live in top-level `tests/`, never colocated in `src/`.
- Strict TS with `noUncheckedIndexedAccess`. No CommonJS, no UMD.
- Public APIs get JSDoc with `@template`, `@param`, `@returns`, `@throws`, and `@example` where it earns its place. Internal APIs get `@internal`.
- Classes and type aliases are `PascalCase`. Interfaces take no `I` prefix.

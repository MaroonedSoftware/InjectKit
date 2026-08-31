# injectkit

## 1.7.1

### Patch Changes

- 48c5bf9: Expose `useValue` on the public `RegistrationType` interface and return a `ScopedContainer` from `build()`.

  Both were already supported at runtime but missing from the published types, so `registry.register(TOKEN).useValue(v)` and `container.override(Dep, stub)` on the root container were type errors for consumers, despite both being documented. Adds a `test:types` script that type-checks `tests/` alongside `src/`, which is what surfaced the gap.

- d3f4baa: Expand the shipped `llms.txt` reference to cover the whole public API: `useArray`/`useMap` collections, the `injectkit/browser` build and why it needs explicit `deps`, a full disposal section with the what-gets-disposed table and the dispose-protocol requirement, and the `MetadataRegistry` exports used to isolate auto-registration. Adds the three disposed-container error messages to the error table.

## 1.7.0

### Minor Changes

- cc43e51: Fix singletons capturing the scope that constructed them, and reject captive dependencies at build time.

  **Singletons now resolve their dependencies from the root container.** Previously a
  singleton was cached at the root but built its dependencies through whichever container
  called `get()` first. A singleton constructed from inside a scope would permanently
  capture that scope's instances and its per-scope `override()` values, then keep using
  them after the scope was disposed. Singleton factories are handed the root container for
  the same reason.

  **`build()` now rejects a singleton that depends on a scoped registration**, following
  transient links so indirect captures are reported with the full path. Depending on a
  transient is still allowed. Factory registrations declare no dependencies, so a
  `useFactory` reaching for a scoped service is not covered by this check.

  Both changes affect existing behavior: a graph that previously built and ran (while
  silently capturing a scope) may now throw at `build()`, and a singleton that resolved a
  scope-local `override()` will now see the root registration. Both cases were bugs rather
  than supported behavior, so this ships as a minor rather than a major.

### Patch Changes

- 0af1b49: Add `llms.txt`, a self-contained reference for LLMs and coding agents, and ship it in the
  published package at `node_modules/injectkit/llms.txt`.

  It covers the full public API, the decorator/toolchain setup that constructor injection
  silently depends on, the eight rules where InjectKit differs from other DI containers
  (transient default, always-singleton `useValue`/`useInstance`, build-time validation,
  captive dependencies, singleton root resolution, scope caching, disposal ownership), and
  a table mapping every error message to its cause and fix.

  Its behavioral claims are pinned by `tests/llms-claims.test.ts` so the file cannot drift
  from the implementation.

## 1.6.0

### Minor Changes

- 0d30217: Add `InjectKitContainerNoop`, a null-object container that satisfies the `Container` / `ScopedContainer` contract with no registrations, and tighten disposed-state error handling so overriding a disposed container throws.

## 1.5.0

### Minor Changes

- 58ac9b0: Add disposal support to containers and scopes. `Container` now implements `AsyncDisposable`, exposing `disposeAsync()` and `[Symbol.asyncDispose]()` for use with `await using`. Disposal releases the disposable instances the container itself created — singletons on the root, scoped instances per scope — in reverse creation order. Instances supplied via `useInstance`/`useValue`/overrides and transient instances are left untouched. After disposal, resolving from or scoping a container throws.

## 1.4.2

### Patch Changes

- 7626a14: Resolve `Container` to the scope performing the lookup instead of always returning the root. Auto-registered `Container` is now transient, so `scoped.get(Container)` returns `scoped` rather than the root container it was created from.

## 1.4.1

### Patch Changes

- 58e87dd: Fix `useArray` and `useMap` so the returned registration carries the element / key / value types through correctly when the call is stored in a variable. Previously the return type leaned on a phantom generic that fell back to `unknown` once it was used outside a single chained expression, making `push()` and `set()` mistyped at the call site.

## 1.4.0

### Minor Changes

- 6948fd7: Clarify the runtime type system by splitting `Identifier<T>` (anything passed to `register`, `get`, `override`, etc.) from `Token` (= `string | symbol` for nominal contracts). The fluent registration builder gains a new `useValue` method via `registerValue`, which now accepts primitives, falsy values, and `undefined` under string or symbol tokens. `useInstance` and `ScopedContainer.override` are scoped to object instances; reach for `registerValue` when registering primitives.

  A new `formatIdentifier` helper is exported from the package root for diagnostics that need to render arbitrary identifiers.

  New exports: `Identifier<T>`, `Token`, `Instance<T>`, `InstanceOrValue<T>`, `InjectKitNotSet`, `formatIdentifier`.

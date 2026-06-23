---
'injectkit': minor
---

Add disposal support to containers and scopes. `Container` now implements `AsyncDisposable`, exposing `disposeAsync()` and `[Symbol.asyncDispose]()` for use with `await using`. Disposal releases the disposable instances the container itself created — singletons on the root, scoped instances per scope — in reverse creation order. Instances supplied via `useInstance`/`useValue`/overrides and transient instances are left untouched. After disposal, resolving from or scoping a container throws.

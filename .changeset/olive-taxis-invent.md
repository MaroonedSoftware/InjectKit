---
'injectkit': patch
---

Expose `useValue` on the public `RegistrationType` interface and return a `ScopedContainer` from `build()`.

Both were already supported at runtime but missing from the published types, so `registry.register(TOKEN).useValue(v)` and `container.override(Dep, stub)` on the root container were type errors for consumers, despite both being documented. Adds a `test:types` script that type-checks `tests/` alongside `src/`, which is what surfaced the gap.

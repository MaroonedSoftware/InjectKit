# injectkit

## 1.4.0

### Minor Changes

- 6948fd7: Clarify the runtime type system by splitting `Identifier<T>` (anything passed to `register`, `get`, `override`, etc.) from `Token` (= `string | symbol` for nominal contracts). The fluent registration builder gains a new `useValue` method via `registerValue`, which now accepts primitives, falsy values, and `undefined` under string or symbol tokens. `useInstance` and `ScopedContainer.override` are scoped to object instances; reach for `registerValue` when registering primitives.

  A new `formatIdentifier` helper is exported from the package root for diagnostics that need to render arbitrary identifiers.

  New exports: `Identifier<T>`, `Token`, `Instance<T>`, `InstanceOrValue<T>`, `InjectKitNotSet`, `formatIdentifier`.

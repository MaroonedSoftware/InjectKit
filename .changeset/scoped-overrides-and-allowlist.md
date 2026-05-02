---
'injectkit': minor
---

Add a class allowlist for `autoRegisterDecorated` and let `createRegistry` accept a custom `MetadataRegistry`, so apps can scope auto-registration to a known set of classes or to an isolated metadata backend instead of the process-global one. Scoped container `override()` no longer mutates the shared registration map, so overrides applied to one scope do not leak to parent or sibling scopes. `useInstance` and `registerValue` now correctly cache and resolve registrations whose value is `undefined`.

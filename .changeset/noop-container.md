---
'injectkit': minor
---

Add `InjectKitContainerNoop`, a null-object container that satisfies the `Container` / `ScopedContainer` contract with no registrations, and tighten disposed-state error handling so overriding a disposed container throws.

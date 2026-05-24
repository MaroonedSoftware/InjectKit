---
'injectkit': patch
---

Resolve `Container` to the scope performing the lookup instead of always returning the root. Auto-registered `Container` is now transient, so `scoped.get(Container)` returns `scoped` rather than the root container it was created from.

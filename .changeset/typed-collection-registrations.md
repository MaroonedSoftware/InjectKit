---
'injectkit': patch
---

Fix `useArray` and `useMap` so the returned registration carries the element / key / value types through correctly when the call is stored in a variable. Previously the return type leaned on a phantom generic that fell back to `unknown` once it was used outside a single chained expression, making `push()` and `set()` mistyped at the call site.

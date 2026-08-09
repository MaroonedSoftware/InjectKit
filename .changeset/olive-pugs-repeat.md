---
'injectkit': patch
---

Add `llms.txt`, a self-contained reference for LLMs and coding agents, and ship it in the
published package at `node_modules/injectkit/llms.txt`.

It covers the full public API, the decorator/toolchain setup that constructor injection
silently depends on, the eight rules where InjectKit differs from other DI containers
(transient default, always-singleton `useValue`/`useInstance`, build-time validation,
captive dependencies, singleton root resolution, scope caching, disposal ownership), and
a table mapping every error message to its cause and fix.

Its behavioral claims are pinned by `tests/llms-claims.test.ts` so the file cannot drift
from the implementation.

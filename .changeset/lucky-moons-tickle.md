---
'injectkit': minor
---

Fix singletons capturing the scope that constructed them, and reject captive dependencies at build time.

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

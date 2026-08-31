---
'injectkit': patch
---

Expand the shipped `llms.txt` reference to cover the whole public API: `useArray`/`useMap` collections, the `injectkit/browser` build and why it needs explicit `deps`, a full disposal section with the what-gets-disposed table and the dispose-protocol requirement, and the `MetadataRegistry` exports used to isolate auto-registration. Adds the three disposed-container error messages to the error table.

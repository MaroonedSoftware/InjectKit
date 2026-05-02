# injectkit

## 1.3.0

### Minor Changes

- dfd4c1b: Add a class allowlist for `autoRegisterDecorated` and let `createRegistry` accept a custom `MetadataRegistry`, so apps can scope auto-registration to a known set of classes or to an isolated metadata backend instead of the process-global one. Scoped container `override()` no longer mutates the shared registration map, so overrides applied to one scope do not leak to parent or sibling scopes. `useInstance` and `registerValue` now correctly cache and resolve registrations whose value is `undefined`.

## 1.2.0

### Minor Changes

- updating to typescript 6

## 1.1.3

### Patch Changes

- fixing release

## 1.1.2

### Patch Changes

- fixing release

## 1.1.1

### Patch Changes

- adding claude skill

## 1.1.0

### Minor Changes

- add hasRegistration to the container

## 1.0.4

### Patch Changes

- update packages

## 1.0.3

### Patch Changes

- fixing workflows

## 1.0.2

### Patch Changes

- fix workflows

## 1.0.1

### Patch Changes

- Added missing license

## 1.0.0

### Major Changes

- Initial release

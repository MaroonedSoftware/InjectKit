# InjectKit - Cursor Rules

## Project Overview

InjectKit is a lightweight, type-safe dependency injection (DI) container for TypeScript. It uses decorators and `reflect-metadata` for constructor parameter extraction.

## Architecture

### Core Components

- **Registry** (`InjectKitRegistry`): Configuration phase where services are registered before building a container
- **Container** (`InjectKitContainer`): Runtime phase that resolves and manages service instances
- **Identifier**: A class constructor or abstract class used as a key to register and resolve services
- **Registration**: Internal representation of how a service should be created and its lifetime

### File Structure

```
src/
├── index.ts        # Public exports
├── injectable.ts   # @Injectable() decorator
├── interfaces.ts   # Public types and abstract Container class
├── registry.ts     # InjectKitRegistry and InjectKitRegistration classes
├── container.ts    # InjectKitContainer implementation
└── internal.ts     # Internal types (Registration)
```

## Code Conventions

### TypeScript

- Use strict TypeScript with `strict: true`
- Enable decorators: `experimentalDecorators` and `emitDecoratorMetadata`
- Use ES modules with `.js` extensions in imports (NodeNext resolution)
- Prefer `interface` for public APIs, `type` for internal/complex types
- Use generics extensively for type safety

### Naming

- Classes: `PascalCase` (e.g., `InjectKitRegistry`, `InjectKitContainer`)
- Interfaces: `PascalCase`, no `I` prefix (e.g., `Constructor`, `Registry`)
- Type aliases: `PascalCase` (e.g., `Identifier<T>`, `Lifetime`)
- Static methods: `camelCase` (e.g., `getDependencies`, `getBaseClass`)

### Documentation

- Use JSDoc comments on all public APIs
- Include `@template`, `@param`, `@returns`, `@throws`, `@example` tags
- Mark internal APIs with `@internal`
- Use `@remarks` for additional context

### Code Style

- Use Prettier for formatting
- Prefer `const` over `let`
- Use arrow functions for callbacks
- Avoid `any` when possible (warn level in ESLint)
- Return early for guard clauses

## Lifetimes

Three lifetime strategies are supported:

- **singleton**: One instance shared across all containers (stored in root container)
- **transient**: New instance created on every `get()` call (never cached)
- **scoped**: One instance per scope, inherited by child scopes (stored in creating container)

## Registration Patterns

### Class Registration

```typescript
registry.register(ServiceClass).useClass(ServiceClass).asSingleton();
```

### Factory Registration

```typescript
registry
    .register(ServiceClass)
    .useFactory((container) => {
        return new ServiceClass(container.get(Dependency));
    })
    .asSingleton();
```

### Instance Registration

```typescript
registry.register(ServiceClass).useInstance(existingInstance);
// Always singleton - no lifetime method needed
```

### Array Collection

```typescript
registry.register(ServiceArray).useArray(ServiceArray).push(ImplA).push(ImplB);
// Resolves to array containing [ImplA instance, ImplB instance]
```

### Map Collection

```typescript
registry.register(ServiceMap).useMap(ServiceMap).set('key1', ImplA).set('key2', ImplB);
// Resolves to Map with entries { 'key1' => ImplA instance, 'key2' => ImplB instance }
```

## Dependency Resolution

- Dependencies are extracted via `reflect-metadata` from constructor parameters
- All classes using `useClass()` MUST be decorated with `@Injectable()`
- The registry validates for missing dependencies and circular dependencies on `build()`
- The `Container` itself is auto-registered and can be injected

## Testing

- Use Vitest for testing
- Test files in `tests/` directory with `.test.ts` extension
- Tests use SWC for faster compilation with decorator support
- Setup file at `tests/setup.ts` imports `reflect-metadata`

## Common Patterns

### Abstract Class Pattern

Register abstract classes with concrete implementations:

```typescript
abstract class Repository {
    abstract find(id: string): any;
}

@Injectable()
class UserRepository extends Repository {
    find(id: string) {
        return null;
    }
}

registry.register(Repository).useClass(UserRepository).asSingleton();
```

### Scoped Container Pattern

Create child containers for request/operation scoping:

```typescript
const requestContainer = rootContainer.createScopedContainer();
// Scoped services are shared within this container
// Singletons are shared with parent
```

### Override Pattern

Override registrations in scoped containers:

```typescript
const scoped = container.createScopedContainer();
scoped.override(SomeService, mockInstance);
```

## Build & Scripts

- `pnpm build`: Build with tsup (ESM format)
- `pnpm test`: Run Vitest tests
- `pnpm lint`: Run ESLint
- `pnpm check`: Format with Prettier and fix ESLint issues

## Key Implementation Details

### Singleton Instance Storage

Singletons traverse up to root container before storing:

```typescript
if (registration.lifetime === 'singleton') {
    let container = this;
    while (container._parent) {
        container = container._parent;
    }
    container._instances.set(id, instance);
}
```

### Scoped Instance Lookup

Scoped instances traverse up the hierarchy to find cached instances:

```typescript
private getScopedInstance<T>(id: Identifier<T>): T {
    const instance = this._instances.get(id) as T;
    if (!instance && this._parent) {
        return this._parent.getScopedInstance(id);
    }
    return instance;
}
```

### Dependency Extraction

Uses reflection metadata with inheritance chain traversal:

- Checks `design:paramtypes` metadata
- Validates decorator presence
- Handles special cases for Array/Map base classes

## Error Messages

The library provides clear error messages:

- `"Registration for X already exists"` - Duplicate registration
- `"Registration for X not found"` - Missing registration on resolve
- `"Missing dependencies for X: Y, Z"` - Unregistered dependencies
- `"Circular dependency found: A -> B -> A"` - Circular dependency chain
- `"Service not decorated: X"` - Missing `@Injectable()` decorator

# InjectKit

[![codecov](https://codecov.io/github/MaroonedSoftware/InjectKit/graph/badge.svg?token=suXBzveqVf)](https://codecov.io/github/MaroonedSoftware/InjectKit)

---

<p align="center">
  <strong>A lightweight, type-safe dependency injection container for TypeScript</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#browser-usage">Browser Usage</a> •
  <a href="#core-concepts">Core Concepts</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#license">License</a>
</p>

---

## Features

- 🎯 **Type-safe** — Full TypeScript support with strong typing throughout
- 🪶 **Lightweight** — Minimal footprint with backwards-compatible reflection support
- 🔄 **Multiple lifetimes** — Singleton, transient, and scoped instance management
- 🏭 **Flexible registration** — Classes, factories, or existing instances
- 📦 **Collection support** — Register arrays and maps of implementations
- 🔍 **Validation** — Automatic detection of missing and circular dependencies
- 🧪 **Test-friendly** — Easy mocking with scoped container overrides

## Installation

```bash
npm install injectkit
```

```bash
pnpm add injectkit
```

```bash
yarn add injectkit
```

## Requirements

- **Node.js** >= 22
- Existing `reflect-metadata` / `emitDecoratorMetadata` constructor injection remains supported
- Explicit dependency metadata with `@Injectable({ deps: [...] })` is supported and recommended for portability

## Quick Start

```typescript
import { Injectable, InjectKitRegistry } from 'injectkit';

// 1. Decorate your classes with @Injectable()
@Injectable()
class Logger {
  log(message: string) {
    console.log(`[LOG] ${message}`);
  }
}

@Injectable()
class UserService {
  constructor(private logger: Logger) {}

  createUser(name: string) {
    this.logger.log(`Creating user: ${name}`);
    return { id: crypto.randomUUID(), name };
  }
}

// 2. Create a registry and register your services
const registry = new InjectKitRegistry();
registry.register(Logger).useClass(Logger).asSingleton();
registry.register(UserService).useClass(UserService).asSingleton();

// 3. Build the container
const container = registry.build();

// 4. Resolve and use your services
const userService = container.get(UserService);
userService.createUser('Alice');
```

InjectKit now also supports explicit dependency metadata. This is useful for browser builds, bundlers, and codebases that prefer not to rely on emitted TypeScript metadata:

```typescript
@Injectable({ deps: [Logger] })
class UserService {
  constructor(private logger: Logger) {}
}
```

Explicit deps take priority when both explicit and reflected metadata are available, so projects can migrate gradually.

## Browser Usage

InjectKit also ships a browser-ready ESM build for direct `<script type="module">` usage.

```html
<script type="module">
  import { Injectable, InjectKitRegistry } from './vendor/injectkit.js';

  class Logger {
    log(message) {
      return `log:${message}`;
    }
  }

  Injectable()(Logger);

  class UserService {
    constructor(logger) {
      this.logger = logger;
    }
  }

  Injectable({ deps: [Logger] })(UserService);

  const registry = new InjectKitRegistry();
  registry.register(Logger).useClass(Logger).asSingleton();
  registry.register(UserService).useClass(UserService).asSingleton();
</script>
```

The npm package exposes the browser build as `injectkit/browser`.

## Core Concepts

### Registry

The **Registry** is where you configure your services before runtime. It validates all registrations when building the container.

```typescript
const registry = new InjectKitRegistry();

// Register services
registry.register(MyService).useClass(MyService).asSingleton();

// Check if registered
registry.isRegistered(MyService); // true

// Remove if needed
registry.remove(MyService);

// Build the container when ready
const container = registry.build();
```

### Container

The **Container** resolves and manages service instances at runtime. It injects dependencies from explicit `deps` metadata first, then falls back to legacy reflected constructor metadata.

```typescript
// Resolve a service with its configured dependencies
const service = container.get(MyService);

// The Container itself can be resolved for factory patterns
const resolvedContainer = container.get(Container);
```

### Token

A **Token** is a class constructor, abstract class, string, or symbol used to register and resolve services. This enables programming to interfaces:

```typescript
// Abstract class as token
abstract class Repository {
  abstract find(id: string): Promise<Entity>;
}

// Concrete implementation
@Injectable()
class PostgresRepository extends Repository {
  async find(id: string) {
    /* ... */
  }
}

// Register abstract → concrete mapping
registry.register(Repository).useClass(PostgresRepository).asSingleton();

// Resolve using the abstract class
const repo = container.get(Repository); // Returns PostgresRepository
```

### Lifetimes

InjectKit supports three lifetime strategies:

| Lifetime      | Behavior                                          |
| ------------- | ------------------------------------------------- |
| **Singleton** | One instance shared across the entire application |
| **Transient** | New instance created on every `get()` call        |
| **Scoped**    | One instance per scope, shared within that scope  |

```typescript
registry.register(ConfigService).useClass(ConfigService).asSingleton();
registry.register(RequestId).useClass(RequestId).asScoped();
registry.register(TempCalculation).useClass(TempCalculation).asTransient();
```

## API Reference

### Registration Methods

#### `useClass(constructor)`

Register a service using its constructor. Constructor dependencies are resolved from explicit `@Injectable({ deps: [...] })` metadata first, then from legacy reflected metadata when explicit deps are absent.

```typescript
@Injectable()
class EmailService {
  constructor(
    private config: ConfigService,
    private logger: Logger,
  ) {}
}

registry.register(EmailService).useClass(EmailService).asSingleton();
```

For explicit, portable metadata:

```typescript
@Injectable({ deps: [ConfigService, Logger] })
class EmailService {
  constructor(
    private config: ConfigService,
    private logger: Logger,
  ) {}
}
```

#### `useFactory(factory)`

Register a service using a factory function. Useful for complex initialization or third-party libraries.

```typescript
registry
  .register(DatabaseConnection)
  .useFactory(container => {
    const config = container.get(ConfigService);
    return new DatabaseConnection({
      host: config.dbHost,
      port: config.dbPort,
    });
  })
  .asSingleton();
```

#### `useInstance(instance)`

Register an existing instance directly. Always behaves as a singleton.

```typescript
const config = new ConfigService({ env: 'production' });
registry.register(ConfigService).useInstance(config);
```

#### `useArray(constructor)`

Register a collection of implementations. Useful for plugin systems or strategy patterns.

```typescript
// Handler implementations
@Injectable()
class JsonHandler extends Handler {
  /* ... */
}

@Injectable()
class XmlHandler extends Handler {
  /* ... */
}

// Array container
@Injectable()
class Handlers extends Array<Handler> {}

// Registration
registry.register(JsonHandler).useClass(JsonHandler).asSingleton();
registry.register(XmlHandler).useClass(XmlHandler).asSingleton();
registry.register(Handlers).useArray(Handlers).push(JsonHandler).push(XmlHandler);

// Usage
const handlers = container.get(Handlers);
handlers.forEach(h => h.handle(data));
```

#### `useMap(constructor)`

Register a keyed collection of implementations.

```typescript
@Injectable()
class ProcessorMap extends Map<string, Processor> {}

registry.register(ProcessorMap).useMap(ProcessorMap).set('fast', FastProcessor).set('accurate', AccurateProcessor);

// Usage
const processors = container.get(ProcessorMap);
const processor = processors.get('fast');
```

### Container Methods

#### `get<T>(token): T`

Resolves an instance of the specified type.

```typescript
const service = container.get(MyService);
```

#### `hasRegistration<T>(token): boolean`

Checks if a service has a registration with the container.

```typescript
container.hasRegistration(MyService); // true
container.hasRegistration(UnregisteredService); // false
```

#### `createScopedContainer(): ScopedContainer`

Creates a child container for scoped instance management.

```typescript
const requestScope = container.createScopedContainer();
const requestService = requestScope.get(RequestScopedService);
```

#### `override<T>(token, instance): void`

Overrides a registration within a scoped container. Perfect for testing.

```typescript
const testScope = container.createScopedContainer();

// Override with a mock
testScope.override(EmailService, {
  send: vi.fn().mockResolvedValue(true),
} as EmailService);

// Tests use the mock
const service = testScope.get(NotificationService);
```

### Registry Methods

#### `register<T>(token): RegistrationType<T>`

Starts a registration chain for a service.

#### `registerValue<T>(token, value): Registry`

Registers an existing value for a class, string, or symbol token.

```typescript
registry.registerValue('env', { mode: 'production' });
```

#### `registerFactory<T>(token, factory, lifetime?): Registry`

Registers a factory with an optional lifetime.

```typescript
registry.registerFactory(
  ApiClient,
  container => new ApiClient(container.get(ConfigService)),
  'singleton',
);
```

#### `remove<T>(token): void`

Removes a registration from the registry.

#### `isRegistered<T>(token): boolean`

Checks if a service is already registered.

#### `build(options?): Container`

Builds the container, validating all registrations.

```typescript
const container = registry.build({
  autoRegisterDecorated: true,
  overrides: [{ token: Logger, useClass: TestLogger, lifetime: 'singleton' }],
});
```

### Decorators

Decorators can be used in the legacy style:

```typescript
@Injectable()
class UserService {
  constructor(private logger: Logger) {}
}
```

They can also declare constructor dependencies and default lifetimes:

```typescript
@Singleton({ deps: [Logger] })
class UserService {
  constructor(private logger: Logger) {}
}
```

Use `@Provider(token)` when a decorated class should satisfy another token during auto-registration:

```typescript
const LOGGER = Symbol('LOGGER');

@Provider(LOGGER)
@Singleton()
class ConsoleLogger {}
```

## Scoped Containers

Scoped containers enable request-scoped or unit-of-work patterns:

```typescript
@Injectable()
class RequestContext {
  readonly requestId = crypto.randomUUID();
  readonly startTime = Date.now();
}

registry.register(RequestContext).useClass(RequestContext).asScoped();

// Per-request handling
app.use((req, res, next) => {
  const scope = container.createScopedContainer();

  // Same RequestContext instance throughout this request
  const ctx = scope.get(RequestContext);
  req.scope = scope;

  next();
});
```

### Scope Hierarchy

Scoped containers inherit instances from parent scopes:

```typescript
const root = registry.build();
const scope1 = root.createScopedContainer();
const scope2 = scope1.createScopedContainer();

// Instance created in scope1 is visible in scope2
const instance1 = scope1.get(ScopedService);
const instance2 = scope2.get(ScopedService);
console.log(instance1 === instance2); // true
```

## Validation

InjectKit validates your dependency graph when calling `build()`:

### Missing Dependencies

```typescript
@Injectable({ deps: [DatabaseService] })
class UserService {
  constructor(private db: DatabaseService) {} // Not registered!
}

registry.register(UserService).useClass(UserService).asSingleton();
registry.build(); // ❌ Error: Missing dependencies for UserService: DatabaseService
```

### Circular Dependencies

```typescript
@Injectable({ deps: [ServiceB] })
class ServiceA {
  constructor(private b: ServiceB) {}
}

@Injectable({ deps: [ServiceA] })
class ServiceB {
  constructor(private a: ServiceA) {}
}

registry.register(ServiceA).useClass(ServiceA).asSingleton();
registry.register(ServiceB).useClass(ServiceB).asSingleton();
registry.build(); // ❌ Error: Circular dependency found: ServiceA -> ServiceB -> ServiceA
```

### Missing Dependency Metadata

```typescript
@Injectable()
class MissingDepsService {
  constructor(private dep: SomeDependency) {}
}

registry.register(MissingDepsService).useClass(MissingDepsService).asSingleton();
registry.build();
// ❌ Error: Service dependency metadata unavailable: MissingDepsService.
// Declare deps with @Injectable({ deps: [...] }) or enable legacy reflection metadata.
```

## Testing

InjectKit makes testing easy with scoped overrides:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('UserService', () => {
  let scope: ScopedContainer;
  let mockDb: DatabaseService;

  beforeEach(() => {
    scope = container.createScopedContainer();

    mockDb = {
      query: vi.fn().mockResolvedValue([{ id: '1', name: 'Test' }]),
    } as unknown as DatabaseService;

    scope.override(DatabaseService, mockDb);
  });

  it('should fetch users', async () => {
    const userService = scope.get(UserService);
    const users = await userService.getUsers();

    expect(users).toHaveLength(1);
    expect(mockDb.query).toHaveBeenCalled();
  });
});
```

## TypeScript Configuration

Recommended `tsconfig.json` settings:

For legacy reflected constructor injection:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true
  }
}
```

For explicit deps, `emitDecoratorMetadata` is optional:

```typescript
@Injectable({ deps: [Logger] })
class UserService {
  constructor(private logger: Logger) {}
}
```

You can mix both styles while migrating. Explicit deps win when both are present.

## License

MIT

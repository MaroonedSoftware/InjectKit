import { describe, it, expect, beforeEach } from 'vitest';
import { InjectKitRegistry, Injectable, Container } from '../src/index.js';

// Test fixtures
@Injectable()
class DatabaseService {
  connect() {
    return 'connected';
  }
}

@Injectable()
class LoggerService {
  log(message: string) {
    return `logged: ${message}`;
  }
}

@Injectable()
class UserService {
  constructor(
    public db: DatabaseService,
    public logger: LoggerService,
  ) {}

  createUser(name: string) {
    this.logger.log(`Creating user ${name}`);
    return { name, db: this.db.connect() };
  }
}

@Injectable()
class RequestScopedService {
  public readonly id = Math.random().toString(36).substring(7);
}

@Injectable()
class TransientService {
  public readonly id = Math.random().toString(36).substring(7);
}

// Array and Map collection fixtures
@Injectable()
class HandlerArray extends Array<AbstractHandler> {}

abstract class AbstractHandler {
  abstract handle(data: string): string;
}

@Injectable()
class JsonHandler extends AbstractHandler {
  handle(data: string) {
    return `json: ${data}`;
  }
}

@Injectable()
class XmlHandler extends AbstractHandler {
  handle(data: string) {
    return `xml: ${data}`;
  }
}

@Injectable()
class ProcessorMap extends Map<string, AbstractProcessor> {}

abstract class AbstractProcessor {
  abstract process(input: number): number;
}

@Injectable()
class DoubleProcessor extends AbstractProcessor {
  process(input: number) {
    return input * 2;
  }
}

@Injectable()
class SquareProcessor extends AbstractProcessor {
  process(input: number) {
    return input * input;
  }
}

describe('InjectKitContainer', () => {
  let registry: InjectKitRegistry;

  beforeEach(() => {
    registry = new InjectKitRegistry();
  });

  describe('get', () => {
    it('should resolve a simple service', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      const container = registry.build();
      const db = container.get(DatabaseService);
      expect(db.connect()).toBe('connected');
    });

    it('should resolve service with dependencies', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      registry.register(LoggerService).useClass(LoggerService).asSingleton();
      registry.register(UserService).useClass(UserService).asSingleton();
      const container = registry.build();
      const userService = container.get(UserService);
      const result = userService.createUser('Alice');
      expect(result).toEqual({ name: 'Alice', db: 'connected' });
    });

    it('should throw when service is not registered', () => {
      const container = registry.build();
      expect(() => container.get(DatabaseService)).toThrow('Registration for DatabaseService not found');
    });

    it('should allow resolving Container itself', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      const container = registry.build();
      const resolvedContainer = container.get(Container);
      expect(resolvedContainer).toBe(container);
    });
  });

  describe('singleton lifetime', () => {
    it('should return the same instance for singletons', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      const container = registry.build();
      const instance1 = container.get(DatabaseService);
      const instance2 = container.get(DatabaseService);
      expect(instance1).toBe(instance2);
    });

    it('should share singleton across scoped containers', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      const container = registry.build();
      const scoped = container.createScopedContainer();
      const instance1 = container.get(DatabaseService);
      const instance2 = scoped.get(DatabaseService);
      expect(instance1).toBe(instance2);
    });

    it('should store singleton in root container when created from scoped', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      const container = registry.build();
      const scoped = container.createScopedContainer();
      // First resolve from scoped container
      const scopedInstance = scoped.get(DatabaseService);
      // Then resolve from root - should be the same
      const rootInstance = container.get(DatabaseService);
      expect(scopedInstance).toBe(rootInstance);
    });
  });

  describe('transient lifetime', () => {
    it('should return new instance each time for transients', () => {
      registry.register(TransientService).useClass(TransientService).asTransient();
      const container = registry.build();
      const instance1 = container.get(TransientService);
      const instance2 = container.get(TransientService);
      expect(instance1).not.toBe(instance2);
      expect(instance1.id).not.toBe(instance2.id);
    });

    it('should create new instances in scoped containers too', () => {
      registry.register(TransientService).useClass(TransientService).asTransient();
      const container = registry.build();
      const scoped = container.createScopedContainer();
      const instance1 = container.get(TransientService);
      const instance2 = scoped.get(TransientService);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('scoped lifetime', () => {
    it('should return same instance within the same scope', () => {
      registry.register(RequestScopedService).useClass(RequestScopedService).asScoped();
      const container = registry.build();
      const scoped = container.createScopedContainer();
      const instance1 = scoped.get(RequestScopedService);
      const instance2 = scoped.get(RequestScopedService);
      expect(instance1).toBe(instance2);
    });

    it('should return different instances for different scopes', () => {
      registry.register(RequestScopedService).useClass(RequestScopedService).asScoped();
      const container = registry.build();
      const scope1 = container.createScopedContainer();
      const scope2 = container.createScopedContainer();
      const instance1 = scope1.get(RequestScopedService);
      const instance2 = scope2.get(RequestScopedService);
      expect(instance1).not.toBe(instance2);
      expect(instance1.id).not.toBe(instance2.id);
    });

    it('should inherit scoped instances from parent scope', () => {
      registry.register(RequestScopedService).useClass(RequestScopedService).asScoped();
      const container = registry.build();
      const parentScope = container.createScopedContainer();
      const childScope = parentScope.createScopedContainer();
      // Create in parent first
      const parentInstance = parentScope.get(RequestScopedService);
      // Child should get parent's instance
      const childInstance = childScope.get(RequestScopedService);
      expect(parentInstance).toBe(childInstance);
    });

    it('should not share scoped instances with sibling scopes', () => {
      registry.register(RequestScopedService).useClass(RequestScopedService).asScoped();
      const container = registry.build();
      const scope1 = container.createScopedContainer();
      const scope2 = container.createScopedContainer();
      scope1.get(RequestScopedService);
      scope2.get(RequestScopedService);
      expect(scope1.get(RequestScopedService).id).not.toBe(scope2.get(RequestScopedService).id);
    });
  });

  describe('createScopedContainer', () => {
    it('should create a child container', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      const container = registry.build();
      const scoped = container.createScopedContainer();
      expect(scoped).toBeDefined();
      expect(scoped).not.toBe(container);
    });

    it('should allow nested scopes', () => {
      registry.register(RequestScopedService).useClass(RequestScopedService).asScoped();
      const container = registry.build();
      const level1 = container.createScopedContainer();
      const level2 = level1.createScopedContainer();
      const level3 = level2.createScopedContainer();

      // Create at level 1
      const level1Instance = level1.get(RequestScopedService);
      // All child scopes should see it
      expect(level2.get(RequestScopedService)).toBe(level1Instance);
      expect(level3.get(RequestScopedService)).toBe(level1Instance);
    });
  });

  describe('override', () => {
    it('should override a registration with a new instance', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      const container = registry.build();
      const scoped = container.createScopedContainer();

      const mockDb = {
        connect: () => 'mock-connected',
      } as DatabaseService;

      scoped.override(DatabaseService, mockDb);
      expect(scoped.get(DatabaseService)).toBe(mockDb);
      expect(scoped.get(DatabaseService).connect()).toBe('mock-connected');
    });

    it('should make overridden service available in scoped container', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      const container = registry.build();
      const scoped = container.createScopedContainer();

      // Get original from root first
      const originalDb = container.get(DatabaseService);

      const mockDb = {
        connect: () => 'mock-connected',
      } as DatabaseService;

      scoped.override(DatabaseService, mockDb);
      // Scoped container returns the mock
      expect(scoped.get(DatabaseService).connect()).toBe('mock-connected');
      // Original instance is still the same object
      expect(originalDb.connect()).toBe('connected');
    });
  });

  describe('factory-based resolution', () => {
    it('should resolve using factory function', () => {
      registry
        .register(DatabaseService)
        .useFactory(() => {
          const db = new DatabaseService();
          return db;
        })
        .asSingleton();
      const container = registry.build();
      expect(container.get(DatabaseService).connect()).toBe('connected');
    });

    it('should provide container to factory', () => {
      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      registry
        .register(UserService)
        .useFactory(c => {
          const db = c.get(DatabaseService);
          const logger = {
            log: () => 'factory-logger',
          } as unknown as LoggerService;
          return new UserService(db, logger);
        })
        .asSingleton();
      registry.register(LoggerService).useClass(LoggerService).asSingleton();

      const container = registry.build();
      const userService = container.get(UserService);
      expect(userService.db).toBe(container.get(DatabaseService));
    });
  });

  describe('instance-based resolution', () => {
    it('should return the exact instance provided', () => {
      const customDb = new DatabaseService();
      registry.register(DatabaseService).useInstance(customDb);
      const container = registry.build();
      expect(container.get(DatabaseService)).toBe(customDb);
    });

    it('should always return same instance like singleton', () => {
      const customDb = new DatabaseService();
      registry.register(DatabaseService).useInstance(customDb);
      const container = registry.build();
      const scoped = container.createScopedContainer();
      expect(container.get(DatabaseService)).toBe(customDb);
      expect(scoped.get(DatabaseService)).toBe(customDb);
    });
  });

  describe('array collection resolution', () => {
    it('should resolve array with all registered items', () => {
      registry.register(JsonHandler).useClass(JsonHandler).asSingleton();
      registry.register(XmlHandler).useClass(XmlHandler).asSingleton();
      registry.register(HandlerArray).useArray(HandlerArray).push(JsonHandler).push(XmlHandler);

      const container = registry.build();
      const handlers = container.get(HandlerArray);

      expect(handlers).toBeInstanceOf(Array);
      expect(handlers.length).toBe(2);
    });

    it('should resolve items in order of registration', () => {
      registry.register(JsonHandler).useClass(JsonHandler).asSingleton();
      registry.register(XmlHandler).useClass(XmlHandler).asSingleton();
      registry.register(HandlerArray).useArray(HandlerArray).push(JsonHandler).push(XmlHandler);

      const container = registry.build();
      const handlers = container.get(HandlerArray);

      expect(handlers[0]).toBeInstanceOf(JsonHandler);
      expect(handlers[1]).toBeInstanceOf(XmlHandler);
    });

    it('should use singleton instances in array', () => {
      registry.register(JsonHandler).useClass(JsonHandler).asSingleton();
      registry.register(HandlerArray).useArray(HandlerArray).push(JsonHandler);

      const container = registry.build();
      const handlers = container.get(HandlerArray);
      const directHandler = container.get(JsonHandler);

      expect(handlers[0]).toBe(directHandler);
    });
  });

  describe('map collection resolution', () => {
    it('should resolve map with all registered items', () => {
      registry.register(DoubleProcessor).useClass(DoubleProcessor).asSingleton();
      registry.register(SquareProcessor).useClass(SquareProcessor).asSingleton();
      registry.register(ProcessorMap).useMap(ProcessorMap).set('double', DoubleProcessor).set('square', SquareProcessor);

      const container = registry.build();
      const processors = container.get(ProcessorMap);

      expect(processors).toBeInstanceOf(Map);
      expect(processors.size).toBe(2);
    });

    it('should allow retrieval by key', () => {
      registry.register(DoubleProcessor).useClass(DoubleProcessor).asSingleton();
      registry.register(SquareProcessor).useClass(SquareProcessor).asSingleton();
      registry.register(ProcessorMap).useMap(ProcessorMap).set('double', DoubleProcessor).set('square', SquareProcessor);

      const container = registry.build();
      const processors = container.get(ProcessorMap);

      expect(processors.get('double')?.process(5)).toBe(10);
      expect(processors.get('square')?.process(5)).toBe(25);
    });

    it('should use singleton instances in map', () => {
      registry.register(DoubleProcessor).useClass(DoubleProcessor).asSingleton();
      registry.register(ProcessorMap).useMap(ProcessorMap).set('double', DoubleProcessor);

      const container = registry.build();
      const processors = container.get(ProcessorMap);
      const directProcessor = container.get(DoubleProcessor);

      expect(processors.get('double')).toBe(directProcessor);
    });
  });

  describe('mixed lifetimes', () => {
    it('should handle mixed singleton and transient dependencies', () => {
      @Injectable()
      class MixedService {
        constructor(
          public singleton: DatabaseService,
          public transient: TransientService,
        ) {}
      }

      registry.register(DatabaseService).useClass(DatabaseService).asSingleton();
      registry.register(TransientService).useClass(TransientService).asTransient();
      registry.register(MixedService).useClass(MixedService).asTransient();

      const container = registry.build();
      const mixed1 = container.get(MixedService);
      const mixed2 = container.get(MixedService);

      // Singleton should be same
      expect(mixed1.singleton).toBe(mixed2.singleton);
      // Transient should be different
      expect(mixed1.transient).not.toBe(mixed2.transient);
      // And parent MixedService instances should be different
      expect(mixed1).not.toBe(mixed2);
    });
  });
});

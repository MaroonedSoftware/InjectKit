import { describe, it, expect, beforeEach } from 'vitest';
import { InjectKitRegistry, Injectable, Container } from '../src/index.js';

// Test fixtures
@Injectable()
class SimpleService {
  getValue() {
    return 'simple';
  }
}

@Injectable()
class DependentService {
  constructor(public simple: SimpleService) {}

  getValue() {
    return `dependent-${this.simple.getValue()}`;
  }
}

@Injectable()
class DeepDependentService {
  constructor(public dependent: DependentService) {}

  getValue() {
    return `deep-${this.dependent.getValue()}`;
  }
}

// Abstract class for interface-based registration
abstract class AbstractService {
  abstract getValue(): string;
}

@Injectable()
class ConcreteService extends AbstractService {
  getValue() {
    return 'concrete';
  }
}

// Circular dependency fixtures - defined inside tests to avoid forward reference issues
abstract class ITestCircularService1 {}

abstract class ITestCircularService2 {}

abstract class ITestCircularService3 {}

abstract class ITestCircularService4 {}

abstract class ITestCircularService5 {}

@Injectable()
class TestCircularService1 implements ITestCircularService1 {
  constructor(public dependency: ITestCircularService2) {}
}

@Injectable()
class TestCircularService2 implements ITestCircularService2 {
  constructor(public dependency: ITestCircularService1) {}
}

@Injectable()
class TestCircularService3 implements ITestCircularService3 {
  constructor(public dependency: ITestCircularService4) {}
}

@Injectable()
class TestCircularService4 implements ITestCircularService4 {
  constructor(public dependency: ITestCircularService5) {}
}

@Injectable()
class TestCircularService5 implements ITestCircularService5 {
  constructor(public dependency: ITestCircularService3) {}
}

// Array collection fixtures
@Injectable()
class NotificationArray extends Array<AbstractNotifier> {}

abstract class AbstractNotifier {
  abstract notify(message: string): string;
}

@Injectable()
class EmailNotifier extends AbstractNotifier {
  notify(message: string) {
    return `email: ${message}`;
  }
}

@Injectable()
class SmsNotifier extends AbstractNotifier {
  notify(message: string) {
    return `sms: ${message}`;
  }
}

// Map collection fixtures
@Injectable()
class ServiceMap extends Map<string, AbstractService> {}

describe('InjectKitRegistry', () => {
  let registry: InjectKitRegistry;

  beforeEach(() => {
    registry = new InjectKitRegistry();
  });

  describe('register', () => {
    it('should register a simple service', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      expect(registry.isRegistered(SimpleService)).toBe(true);
    });

    it('should throw when registering the same service twice', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      expect(() => {
        registry.register(SimpleService).useClass(SimpleService).asSingleton();
      }).toThrow('Registration for SimpleService already exists');
    });

    it('should register an abstract class with a concrete implementation', () => {
      registry.register(AbstractService).useClass(ConcreteService).asSingleton();
      expect(registry.isRegistered(AbstractService)).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove a registered service', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      expect(registry.isRegistered(SimpleService)).toBe(true);
      registry.remove(SimpleService);
      expect(registry.isRegistered(SimpleService)).toBe(false);
    });

    it('should throw when removing a non-existent registration', () => {
      expect(() => {
        registry.remove(SimpleService);
      }).toThrow('Registration for SimpleService not found');
    });
  });

  describe('isRegistered', () => {
    it('should return false for non-registered service', () => {
      expect(registry.isRegistered(SimpleService)).toBe(false);
    });

    it('should return true for registered service', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      expect(registry.isRegistered(SimpleService)).toBe(true);
    });
  });

  describe('useClass', () => {
    it('should register with singleton lifetime', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      const container = registry.build();
      const instance1 = container.get(SimpleService);
      const instance2 = container.get(SimpleService);
      expect(instance1).toBe(instance2);
    });

    it('should register with transient lifetime', () => {
      registry.register(SimpleService).useClass(SimpleService).asTransient();
      const container = registry.build();
      const instance1 = container.get(SimpleService);
      const instance2 = container.get(SimpleService);
      expect(instance1).not.toBe(instance2);
    });

    it('should register with scoped lifetime', () => {
      registry.register(SimpleService).useClass(SimpleService).asScoped();
      const container = registry.build();
      const scoped1 = container.createScopedContainer();
      const scoped2 = container.createScopedContainer();

      const instance1a = scoped1.get(SimpleService);
      const instance1b = scoped1.get(SimpleService);
      const instance2a = scoped2.get(SimpleService);

      expect(instance1a).toBe(instance1b);
      expect(instance1a).not.toBe(instance2a);
    });
  });

  describe('useFactory', () => {
    it('should create instance using factory function', () => {
      let callCount = 0;
      registry.register(SimpleService).useFactory(() => {
        callCount++;
        return new SimpleService();
      });
      const container = registry.build();
      container.get(SimpleService);
      container.get(SimpleService);
      expect(callCount).toBe(2); // transient by default
    });

    it('should pass container to factory function', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      registry.register(DependentService).useFactory(c => {
        return new DependentService(c.get(SimpleService));
      });
      const container = registry.build();
      const instance = container.get(DependentService);
      expect(instance.getValue()).toBe('dependent-simple');
    });

    it('should respect singleton lifetime with factory', () => {
      let callCount = 0;
      registry
        .register(SimpleService)
        .useFactory(() => {
          callCount++;
          return new SimpleService();
        })
        .asSingleton();
      const container = registry.build();
      container.get(SimpleService);
      container.get(SimpleService);
      expect(callCount).toBe(1);
    });
  });

  describe('useInstance', () => {
    it('should use the provided instance', () => {
      const instance = new SimpleService();
      registry.register(SimpleService).useInstance(instance);
      const container = registry.build();
      expect(container.get(SimpleService)).toBe(instance);
    });

    it('should always return the same instance', () => {
      const instance = new SimpleService();
      registry.register(SimpleService).useInstance(instance);
      const container = registry.build();
      const retrieved1 = container.get(SimpleService);
      const retrieved2 = container.get(SimpleService);
      expect(retrieved1).toBe(retrieved2);
      expect(retrieved1).toBe(instance);
    });
  });

  describe('useArray', () => {
    it('should collect multiple implementations into an array', () => {
      registry.register(EmailNotifier).useClass(EmailNotifier).asSingleton();
      registry.register(SmsNotifier).useClass(SmsNotifier).asSingleton();
      registry.register(NotificationArray).useArray(NotificationArray).push(EmailNotifier).push(SmsNotifier);

      const container = registry.build();
      const notifiers = container.get(NotificationArray);

      expect(notifiers).toBeInstanceOf(Array);
      expect(notifiers.length).toBe(2);
      expect(notifiers[0].notify('test')).toBe('email: test');
      expect(notifiers[1].notify('test')).toBe('sms: test');
    });

    it('should resolve each item in the array', () => {
      registry.register(EmailNotifier).useClass(EmailNotifier).asSingleton();
      registry.register(NotificationArray).useArray(NotificationArray).push(EmailNotifier);

      const container = registry.build();
      const notifiers = container.get(NotificationArray);
      const emailNotifier = container.get(EmailNotifier);

      expect(notifiers[0]).toBe(emailNotifier);
    });
  });

  describe('useMap', () => {
    it('should collect multiple implementations into a map', () => {
      registry.register(ConcreteService).useClass(ConcreteService).asSingleton();
      registry.register(ServiceMap).useMap(ServiceMap).set('primary', ConcreteService);

      const container = registry.build();
      const serviceMap = container.get(ServiceMap);

      expect(serviceMap).toBeInstanceOf(Map);
      expect(serviceMap.get('primary')?.getValue()).toBe('concrete');
    });

    it('should support multiple entries in the map', () => {
      @Injectable()
      class AnotherService extends AbstractService {
        getValue() {
          return 'another';
        }
      }

      registry.register(ConcreteService).useClass(ConcreteService).asSingleton();
      registry.register(AnotherService).useClass(AnotherService).asSingleton();
      registry.register(ServiceMap).useMap(ServiceMap).set('primary', ConcreteService).set('secondary', AnotherService);

      const container = registry.build();
      const serviceMap = container.get(ServiceMap);

      expect(serviceMap.size).toBe(2);
      expect(serviceMap.get('primary')?.getValue()).toBe('concrete');
      expect(serviceMap.get('secondary')?.getValue()).toBe('another');
    });
  });

  describe('build', () => {
    it('should build a container', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      const container = registry.build();
      expect(container).toBeDefined();
    });

    it('should automatically register Container itself', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      const container = registry.build();
      const resolvedContainer = container.get(Container);
      expect(resolvedContainer).toBe(container);
    });

    it('should not override custom Container registration', () => {
      const customContainer = {} as Container;
      registry.register(Container).useInstance(customContainer);
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      const container = registry.build();
      expect(container.get(Container)).toBe(customContainer);
    });
  });

  describe('dependency validation', () => {
    it('should detect missing dependencies', () => {
      registry.register(DependentService).useClass(DependentService).asSingleton();
      // SimpleService is not registered but DependentService depends on it
      expect(() => registry.build()).toThrow('Missing dependencies for DependentService: SimpleService');
    });

    it('should pass validation when all dependencies are registered', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      registry.register(DependentService).useClass(DependentService).asSingleton();
      expect(() => registry.build()).not.toThrow();
    });
  });

  describe('circular dependencies', () => {
    // Note: Testing circular dependencies with classes that reference each other
    // directly in constructors is difficult due to TypeScript forward reference limitations.
    // These tests verify the detection logic works when metadata is properly captured.
    it('should detect direct circular dependency', () => {
      const registry = new InjectKitRegistry();
      registry.register(ITestCircularService1).useClass(TestCircularService1);
      registry.register(ITestCircularService2).useClass(TestCircularService2);

      expect(() => {
        registry.build();
      }).toThrow('Circular dependency found: ITestCircularService1 -> ITestCircularService2 -> ITestCircularService1');
    });

    it('should detect indirect circular dependency', () => {
      const registry = new InjectKitRegistry();
      registry.register(ITestCircularService3).useClass(TestCircularService3);
      registry.register(ITestCircularService4).useClass(TestCircularService4);
      registry.register(ITestCircularService5).useClass(TestCircularService5);

      expect(() => {
        registry.build();
      }).toThrow('Circular dependency found: ITestCircularService3 -> ITestCircularService4 -> ITestCircularService5 -> ITestCircularService3');
    });
  });

  describe('dependency resolution', () => {
    it('should resolve simple dependencies', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      registry.register(DependentService).useClass(DependentService).asSingleton();
      const container = registry.build();
      const dependent = container.get(DependentService);
      expect(dependent.getValue()).toBe('dependent-simple');
    });

    it('should resolve deep dependencies', () => {
      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      registry.register(DependentService).useClass(DependentService).asSingleton();
      registry.register(DeepDependentService).useClass(DeepDependentService).asSingleton();
      const container = registry.build();
      const deep = container.get(DeepDependentService);
      expect(deep.getValue()).toBe('deep-dependent-simple');
    });
  });

  describe('decorator validation', () => {
    it('should throw when class is not decorated', () => {
      class UndecoratedService {
        constructor(public simple: SimpleService) {}
      }

      registry.register(SimpleService).useClass(SimpleService).asSingleton();
      registry.register(UndecoratedService).useClass(UndecoratedService).asSingleton();
      expect(() => registry.build()).toThrow(/Service not decorated/);
    });

    it('should allow undecorated class with no dependencies', () => {
      class NoDependencyService {
        getValue() {
          return 'no-deps';
        }
      }

      registry.register(NoDependencyService).useClass(NoDependencyService).asSingleton();
      const container = registry.build();
      expect(container.get(NoDependencyService).getValue()).toBe('no-deps');
    });
  });
});

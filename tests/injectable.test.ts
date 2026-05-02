import { describe, it, expect } from 'vitest';
import {
  Injectable,
  Provider,
  Singleton,
  getDefaultMetadataRegistry,
} from '../src/index.js';

describe('Injectable decorator', () => {
  it('should return the original class', () => {
    @Injectable()
    class TestService {}

    expect(TestService).toBeDefined();
    expect(TestService.name).toBe('TestService');
  });

  it('should allow instantiation of decorated class', () => {
    @Injectable()
    class TestService {
      getValue() {
        return 'test';
      }
    }

    const instance = new TestService();
    expect(instance).toBeInstanceOf(TestService);
    expect(instance.getValue()).toBe('test');
  });

  it('should preserve class prototype', () => {
    @Injectable()
    class BaseService {
      baseMethod() {
        return 'base';
      }
    }

    @Injectable()
    class DerivedService extends BaseService {
      derivedMethod() {
        return 'derived';
      }
    }

    const instance = new DerivedService();
    expect(instance.baseMethod()).toBe('base');
    expect(instance.derivedMethod()).toBe('derived');
  });

  it('should preserve constructor parameters', () => {
    @Injectable()
    class ConfigService {
      constructor(public readonly value: string) {}
    }

    @Injectable({ deps: [ConfigService] })
    class ServiceWithConfig {
      constructor(public readonly config: ConfigService) {}
    }

    const config = new ConfigService('test-value');
    const service = new ServiceWithConfig(config);
    expect(service.config.value).toBe('test-value');
  });

  it('should store explicit constructor dependencies in metadata', () => {
    @Injectable()
    class DependencyService {}

    @Injectable({ deps: [DependencyService] })
    class ServiceWithDependency {
      constructor(public readonly dep: DependencyService) {}
    }

    const metadataRegistry = getDefaultMetadataRegistry();
    expect(metadataRegistry.getConstructorDependencies(ServiceWithDependency)).toEqual([
      DependencyService,
    ]);
  });

  it('should store multiple explicit constructor dependencies', () => {
    @Injectable()
    class ServiceA {}

    @Injectable()
    class ServiceB {}

    @Injectable({ deps: [ServiceA, ServiceB] })
    class ServiceWithMultipleDeps {
      constructor(
        public readonly a: ServiceA,
        public readonly b: ServiceB,
      ) {}
    }

    const metadataRegistry = getDefaultMetadataRegistry();
    expect(metadataRegistry.getConstructorDependencies(ServiceWithMultipleDeps)).toEqual([
      ServiceA,
      ServiceB,
    ]);
  });

  it('should read legacy reflect metadata when deps are omitted', () => {
    @Injectable()
    class DependencyService {}

    @Injectable()
    class ReflectedService {
      constructor(public readonly dep: DependencyService) {}
    }

    const metadataRegistry = getDefaultMetadataRegistry();
    expect(metadataRegistry.getConstructorDependencies(ReflectedService)).toEqual([
      DependencyService,
    ]);
  });

  it('should prefer explicit deps over legacy reflect metadata', () => {
    @Injectable()
    class ReflectDependency {}

    @Injectable()
    class ExplicitDependency {}

    @Injectable({ deps: [ExplicitDependency] })
    class ExplicitService {
      constructor(public readonly dep: ReflectDependency) {}
    }

    const metadataRegistry = getDefaultMetadataRegistry();
    expect(metadataRegistry.getConstructorDependencies(ExplicitService)).toEqual([
      ExplicitDependency,
    ]);
  });

  it('should throw when dependencies are neither declared nor reflected', () => {
    @Injectable()
    class DependencyService {}

    class MissingMetadataService {
      constructor(public readonly dep: DependencyService) {}
    }

    const metadataRegistry = getDefaultMetadataRegistry();
    expect(() => metadataRegistry.getConstructorDependencies(MissingMetadataService)).toThrow(
      /Declare deps with @Injectable/,
    );
  });

  it('should throw when declared dependencies are incomplete', () => {
    @Injectable()
    class ServiceA {}

    @Injectable()
    class ServiceB {}

    @Injectable({ deps: [ServiceA] })
    class IncompleteDepsService {
      constructor(
        public readonly a: ServiceA,
        public readonly b: ServiceB,
      ) {}
    }

    const metadataRegistry = getDefaultMetadataRegistry();
    expect(() => metadataRegistry.getConstructorDependencies(IncompleteDepsService)).toThrow(
      /Service dependencies incomplete/,
    );
  });

  it('should inherit declared dependencies from a decorated base class', () => {
    @Injectable()
    class Logger {}

    @Injectable({ deps: [Logger] })
    class BaseService {
      constructor(public readonly logger: Logger) {}
    }

    @Injectable()
    class DerivedService extends BaseService {}

    const metadataRegistry = getDefaultMetadataRegistry();
    expect(metadataRegistry.getConstructorDependencies(DerivedService)).toEqual([
      Logger,
    ]);
  });

  it('should preserve static members', () => {
    @Injectable()
    class ServiceWithStatics {
      static readonly VERSION = '1.0.0';
      static create() {
        return new ServiceWithStatics();
      }
    }

    expect(ServiceWithStatics.VERSION).toBe('1.0.0');
    expect(ServiceWithStatics.create()).toBeInstanceOf(ServiceWithStatics);
  });

  it('should preserve getters and setters', () => {
    @Injectable()
    class ServiceWithAccessors {
      private _value = 0;

      get value() {
        return this._value;
      }

      set value(v: number) {
        this._value = v;
      }
    }

    const instance = new ServiceWithAccessors();
    expect(instance.value).toBe(0);
    instance.value = 42;
    expect(instance.value).toBe(42);
  });
});

describe('Provider decorator', () => {
  it('should expose the declared token', () => {
    const LOGGER = Symbol('LOGGER');

    @Singleton()
    @Provider(LOGGER)
    class LoggerService {}

    const metadata = getDefaultMetadataRegistry().getServiceMetadata(LoggerService);
    expect(metadata?.provide).toBe(LOGGER);
    expect(metadata?.lifetime).toBe('singleton');
  });
});

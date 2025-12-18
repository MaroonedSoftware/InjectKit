import { describe, it, expect } from 'vitest';
import { Injectable } from '../src/index.js';

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

    @Injectable()
    class ServiceWithConfig {
      constructor(public config: ConfigService) {}
    }

    const config = new ConfigService('test-value');
    const service = new ServiceWithConfig(config);
    expect(service.config.value).toBe('test-value');
  });

  it('should emit metadata for reflect-metadata', () => {
    @Injectable()
    class DependencyService {}

    @Injectable()
    class ServiceWithDependency {
      constructor(public dep: DependencyService) {}
    }

    const metadata = Reflect.getMetadata('design:paramtypes', ServiceWithDependency);
    expect(metadata).toBeDefined();
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toBe(DependencyService);
  });

  it('should emit metadata for multiple parameters', () => {
    @Injectable()
    class ServiceA {}

    @Injectable()
    class ServiceB {}

    @Injectable()
    class ServiceWithMultipleDeps {
      constructor(
        public a: ServiceA,
        public b: ServiceB,
      ) {}
    }

    const metadata = Reflect.getMetadata('design:paramtypes', ServiceWithMultipleDeps);
    expect(metadata).toBeDefined();
    expect(metadata).toHaveLength(2);
    expect(metadata[0]).toBe(ServiceA);
    expect(metadata[1]).toBe(ServiceB);
  });

  it('should handle class with no constructor parameters', () => {
    @Injectable()
    class NoParamsService {
      doSomething() {
        return 'done';
      }
    }

    const metadata = Reflect.getMetadata('design:paramtypes', NoParamsService);
    // Metadata may be undefined or empty array for no-param constructors
    expect(metadata === undefined || metadata.length === 0).toBe(true);
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

import { describe, expect, it } from 'vitest';
import { createRegistry, DefaultMetadataRegistry, Injectable, Provider, Singleton } from '../src/index.js';

const LOGGER = Symbol('LOGGER');
const CONFIG = 'CONFIG';

@Singleton()
class Logger {
  log(message: string) {
    return `log:${message}`;
  }
}

@Singleton()
@Provider(LOGGER)
class LoggerProvider extends Logger {}

@Injectable()
class HomeContentService {
  getTitle() {
    return 'portfolio';
  }
}

@Injectable({ deps: [HomeContentService] })
class HomeInitializer {
  constructor(public readonly content: HomeContentService) {}
}

describe('build options', () => {
  it('should auto-register decorated classes', () => {
    const container = createRegistry().build({
      autoRegisterDecorated: true,
    });

    const initializer = container.get(HomeInitializer);
    expect(initializer.content.getTitle()).toBe('portfolio');
  });

  it('should auto-register decorated classes with legacy reflect metadata', () => {
    @Injectable()
    class LegacyContentService {
      getTitle() {
        return 'legacy';
      }
    }

    @Injectable()
    class LegacyInitializer {
      constructor(public readonly content: LegacyContentService) {}
    }

    const container = createRegistry().build({
      autoRegisterDecorated: true,
    });

    expect(container.get(LegacyInitializer).content.getTitle()).toBe('legacy');
  });

  it('should support registerValue for nominal tokens', () => {
    const container = createRegistry().registerValue(CONFIG, { env: 'test' }).build();

    expect(container.get(CONFIG)).toEqual({ env: 'test' });
  });

  it('should resolve falsy registered values', () => {
    const container = createRegistry().registerValue('enabled', false).registerValue('retryCount', 0).build();

    expect(container.get('enabled')).toBe(false);
    expect(container.get('retryCount')).toBe(0);
  });

  it('should support symbol tokens provided by decorators', () => {
    const container = createRegistry().build({
      autoRegisterDecorated: true,
    });

    const logger = container.get<Logger>(LOGGER);
    expect(logger).toBeInstanceOf(LoggerProvider);
    expect(logger.log('hello')).toBe('log:hello');
  });

  it('should allow overrides to replace decorated registrations', () => {
    class TestLogger extends Logger {
      override log(message: string) {
        return `test:${message}`;
      }
    }

    const container = createRegistry().build({
      autoRegisterDecorated: true,
      overrides: [{ token: LOGGER, useClass: TestLogger, lifetime: 'singleton' }],
    });

    expect(container.get<Logger>(LOGGER).log('hello')).toBe('test:hello');
  });

  it('should auto-register only the listed classes when given an allowlist', () => {
    const isolatedMetadata = new DefaultMetadataRegistry();

    @Injectable()
    class IsolatedDep {
      readonly value = 'isolated';
    }

    @Injectable({ deps: [IsolatedDep] })
    class IsolatedConsumer {
      constructor(public readonly dep: IsolatedDep) {}
    }

    @Injectable()
    class UnlistedService {
      readonly value = 'unlisted';
    }

    isolatedMetadata.defineServiceMetadata(IsolatedDep, { injectable: true });
    isolatedMetadata.defineServiceMetadata(IsolatedConsumer, {
      injectable: true,
      deps: [IsolatedDep],
    });
    isolatedMetadata.defineServiceMetadata(UnlistedService, { injectable: true });

    const container = createRegistry(isolatedMetadata).build({
      autoRegisterDecorated: [IsolatedDep, IsolatedConsumer],
    });

    expect(container.hasRegistration(IsolatedConsumer)).toBe(true);
    expect(container.hasRegistration(UnlistedService)).toBe(false);
    expect(container.get(IsolatedConsumer).dep.value).toBe('isolated');
  });

  it('should isolate metadata when given a fresh registry', () => {
    const metadata = new DefaultMetadataRegistry();
    const container = createRegistry(metadata).build({
      autoRegisterDecorated: true,
    });

    // Even though Logger / HomeContentService etc. are decorated against the
    // global metadata registry, this build uses an empty isolated metadata
    // backend and therefore registers nothing automatically.
    expect(container.hasRegistration(Logger)).toBe(false);
    expect(container.hasRegistration(HomeInitializer)).toBe(false);
  });

  it('should resolve registered undefined values without re-creating', () => {
    const container = createRegistry().registerValue<string | undefined>('optional', undefined).build();

    expect(container.hasRegistration('optional')).toBe(true);
    expect(container.get('optional')).toBeUndefined();
    // Resolving twice still returns the same cached undefined value.
    expect(container.get('optional')).toBeUndefined();
  });
});

describe('scoped overrides', () => {
  it('should not leak overrides to parent or sibling scopes', () => {
    @Injectable()
    class Service {
      label = 'base';
    }

    const registry = createRegistry();
    registry.register(Service).useClass(Service).asScoped();
    const root = registry.build();
    const childA = root.createScopedContainer();
    const childB = root.createScopedContainer();

    const replacement = new Service();
    replacement.label = 'override';
    childA.override(Service, replacement);

    expect(childA.get(Service).label).toBe('override');
    expect(childB.get(Service).label).toBe('base');
    expect(root.get(Service).label).toBe('base');
  });

  it('should inherit parent overrides into child scopes', () => {
    @Injectable()
    class Service {
      label = 'base';
    }

    const registry = createRegistry();
    registry.register(Service).useClass(Service).asScoped();
    const root = registry.build();
    const parent = root.createScopedContainer();

    const replacement = new Service();
    replacement.label = 'parent-override';
    parent.override(Service, replacement);

    const grandchild = parent.createScopedContainer();
    expect(grandchild.get(Service).label).toBe('parent-override');
  });
});

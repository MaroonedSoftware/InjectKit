import { describe, it, expect } from 'vitest';
import { InjectKitRegistry, Injectable, Container } from '../src/index.js';

@Injectable()
class AsyncResource {
  public disposed = false;
  async [Symbol.asyncDispose]() {
    this.disposed = true;
  }
}

@Injectable()
class SyncResource {
  public disposed = false;
  [Symbol.dispose]() {
    this.disposed = true;
  }
}

@Injectable()
class PlainResource {
  public value = 'plain';
}

describe('container disposal', () => {
  it('disposes singleton instances with [Symbol.asyncDispose]', async () => {
    const registry = new InjectKitRegistry();
    registry.register(AsyncResource).useClass(AsyncResource).asSingleton();
    const container = registry.build();

    const resource = container.get(AsyncResource);
    expect(resource.disposed).toBe(false);

    await container.disposeAsync();
    expect(resource.disposed).toBe(true);
  });

  it('disposes singletons exposing the sync [Symbol.dispose]', async () => {
    const registry = new InjectKitRegistry();
    registry.register(SyncResource).useClass(SyncResource).asSingleton();
    const container = registry.build();

    const resource = container.get(SyncResource);
    await container.disposeAsync();

    expect(resource.disposed).toBe(true);
  });

  it('disposes factory-created instances', async () => {
    let disposed = false;
    const registry = new InjectKitRegistry();
    registry
      .register('factory-resource')
      .useFactory(() => ({
        async [Symbol.asyncDispose]() {
          disposed = true;
        },
      }))
      .asSingleton();
    const container = registry.build();

    container.get('factory-resource');
    await container.disposeAsync();

    expect(disposed).toBe(true);
  });

  it('does not dispose caller-supplied instances (useInstance)', async () => {
    const resource = new AsyncResource();
    const registry = new InjectKitRegistry();
    registry.register(AsyncResource).useInstance(resource);
    const container = registry.build();

    container.get(AsyncResource);
    await container.disposeAsync();

    // The caller owns instances passed via useInstance.
    expect(resource.disposed).toBe(false);
  });

  it('does not track transient instances', async () => {
    const registry = new InjectKitRegistry();
    registry.register(AsyncResource).useClass(AsyncResource).asTransient();
    const container = registry.build();

    const a = container.get(AsyncResource);
    const b = container.get(AsyncResource);
    await container.disposeAsync();

    expect(a.disposed).toBe(false);
    expect(b.disposed).toBe(false);
  });

  it('ignores non-disposable owned instances', async () => {
    const registry = new InjectKitRegistry();
    registry.register(PlainResource).useClass(PlainResource).asSingleton();
    const container = registry.build();

    container.get(PlainResource);
    // Nothing to dispose, but disposal must still succeed cleanly.
    await expect(container.disposeAsync()).resolves.toBeUndefined();
  });

  it('disposes in reverse creation order (dependent before dependency)', async () => {
    const order: string[] = [];

    @Injectable()
    class Dependency {
      async [Symbol.asyncDispose]() {
        order.push('dependency');
      }
    }

    @Injectable()
    class Dependent {
      constructor(public dep: Dependency) {}
      async [Symbol.asyncDispose]() {
        order.push('dependent');
      }
    }

    const registry = new InjectKitRegistry();
    registry.register(Dependency).useClass(Dependency).asSingleton();
    registry.register(Dependent).useClass(Dependent).asSingleton();
    const container = registry.build();

    container.get(Dependent);
    await container.disposeAsync();

    expect(order).toEqual(['dependent', 'dependency']);
  });

  it('is idempotent', async () => {
    let count = 0;
    const registry = new InjectKitRegistry();
    registry
      .register('counter')
      .useFactory(() => ({
        async [Symbol.asyncDispose]() {
          count++;
        },
      }))
      .asSingleton();
    const container = registry.build();

    container.get('counter');
    await container.disposeAsync();
    await container.disposeAsync();

    expect(count).toBe(1);
  });

  it('rejects resolution and scoping after disposal', async () => {
    const registry = new InjectKitRegistry();
    registry.register(AsyncResource).useClass(AsyncResource).asSingleton();
    const container = registry.build();

    await container.disposeAsync();

    expect(() => container.get(AsyncResource)).toThrow(/disposed/);
    expect(() => container.createScopedContainer()).toThrow(/disposed/);
  });

  it('supports await using on the container', async () => {
    const registry = new InjectKitRegistry();
    registry.register(AsyncResource).useClass(AsyncResource).asSingleton();

    let captured: AsyncResource;
    {
      await using container = registry.build();
      captured = container.get(AsyncResource);
      expect(captured.disposed).toBe(false);
    }

    expect(captured.disposed).toBe(true);
  });

  it('disposing the container does not recurse through the self-registered Container', async () => {
    const registry = new InjectKitRegistry();
    registry.register(AsyncResource).useClass(AsyncResource).asSingleton();
    const container = registry.build();

    // Resolving Container returns the container itself; it must not be scheduled
    // for its own disposal.
    expect(container.get(Container)).toBe(container);
    const resource = container.get(AsyncResource);

    await expect(container.disposeAsync()).resolves.toBeUndefined();
    expect(resource.disposed).toBe(true);
  });
});

describe('scoped container disposal', () => {
  it('disposes scoped instances when the scope is disposed', async () => {
    const registry = new InjectKitRegistry();
    registry.register(AsyncResource).useClass(AsyncResource).asScoped();
    const root = registry.build();
    const scope = root.createScopedContainer();

    const resource = scope.get(AsyncResource);
    await scope.disposeAsync();

    expect(resource.disposed).toBe(true);
  });

  it('disposing a scope does not dispose root singletons', async () => {
    @Injectable()
    class Singleton {
      public disposed = false;
      async [Symbol.asyncDispose]() {
        this.disposed = true;
      }
    }

    @Injectable()
    class Scoped {
      public disposed = false;
      async [Symbol.asyncDispose]() {
        this.disposed = true;
      }
    }

    const registry = new InjectKitRegistry();
    registry.register(Singleton).useClass(Singleton).asSingleton();
    registry.register(Scoped).useClass(Scoped).asScoped();
    const root = registry.build();

    const singleton = root.get(Singleton);
    const scope = root.createScopedContainer();
    const scoped = scope.get(Scoped);

    await scope.disposeAsync();
    expect(scoped.disposed).toBe(true);
    expect(singleton.disposed).toBe(false);

    await root.disposeAsync();
    expect(singleton.disposed).toBe(true);
  });
});

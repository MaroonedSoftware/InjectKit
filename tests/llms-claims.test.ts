import { describe, it, expect } from 'vitest';
import { createRegistry, Injectable, Container, InjectKitContainerNoop, DefaultMetadataRegistry, Singleton, formatIdentifier } from '../src/index.js';

@Injectable()
class Thing {}

// Pins the behavioral claims made in llms.txt, which coding agents consume as
// authoritative. A failure here means the doc is now lying, not just that a test broke.
describe('llms.txt claims', () => {
  it('default lifetime is transient', () => {
    const r = createRegistry();
    r.register(Thing).useClass(Thing);
    const c = r.build();
    expect(c.get(Thing)).not.toBe(c.get(Thing));
  });

  it('useValue is always singleton even after asTransient-style intent', () => {
    const r = createRegistry();
    r.register<{ a: number }>('cfg').useValue({ a: 1 });
    const c = r.build();
    expect(c.get<{ a: number }>('cfg')).toBe(c.get<{ a: number }>('cfg'));
  });

  it('useInstance is always singleton', () => {
    const inst = new Thing();
    const r = createRegistry();
    r.register(Thing).useInstance(inst);
    const c = r.build();
    expect(c.get(Thing)).toBe(inst);
  });

  it('registerValue accepts a string token and is a singleton', () => {
    const r = createRegistry();
    r.registerValue('n', 42);
    const c = r.build();
    expect(c.get<number>('n')).toBe(42);
  });

  it('Container is auto-registered and resolves to the resolving scope', () => {
    const r = createRegistry();
    const c = r.build();
    const scope = c.createScopedContainer();
    expect(c.get(Container)).toBe(c);
    expect(scope.get(Container)).toBe(scope);
  });

  it('symbol token requires an explicit type parameter and resolves', () => {
    const LOGGER = Symbol('Logger');
    const r = createRegistry();
    r.register<Thing>(LOGGER).useClass(Thing).asSingleton();
    const c = r.build();
    expect(c.get<Thing>(LOGGER)).toBeInstanceOf(Thing);
  });

  it('noop container behaves as documented', async () => {
    const noop = new InjectKitContainerNoop();
    expect(() => noop.get(Thing)).toThrow();
    expect(noop.hasRegistration(Thing)).toBe(false);
    expect(() => noop.override(Thing, new Thing())).not.toThrow();
    await expect(noop.disposeAsync()).resolves.toBeUndefined();
  });

  it('supports await using on a scope', async () => {
    const r = createRegistry();
    const c = r.build();
    {
      await using scope = c.createScopedContainer();
      expect(scope.hasRegistration(Container)).toBe(true);
    }
  });

  it('child scope inherits a scoped instance the parent already created', () => {
    const r = createRegistry();
    r.register(Thing).useClass(Thing).asScoped();
    const c = r.build();
    const parent = c.createScopedContainer();
    const child = parent.createScopedContainer();
    const fromParent = parent.get(Thing);
    expect(child.get(Thing)).toBe(fromParent);
  });

  it('but a child resolving first caches its own, and the parent then gets a different one', () => {
    const r = createRegistry();
    r.register(Thing).useClass(Thing).asScoped();
    const c = r.build();
    const parent = c.createScopedContainer();
    const child = parent.createScopedContainer();
    const fromChild = child.get(Thing);
    expect(parent.get(Thing)).not.toBe(fromChild);
  });

  it('disposing a scope does not dispose root singletons', async () => {
    let disposed = 0;
    class Res {
      [Symbol.asyncDispose]() {
        disposed += 1;
        return Promise.resolve();
      }
    }
    const r = createRegistry();
    r.register(Res).useClass(Res).asSingleton();
    const c = r.build();
    const scope = c.createScopedContainer();
    scope.get(Res);
    await scope.disposeAsync();
    expect(disposed).toBe(0);
    await c.disposeAsync();
    expect(disposed).toBe(1);
  });

  it('useValue is reachable through the public RegistrationType interface', () => {
    const r = createRegistry();
    r.register<number>('answer').useValue(42);
    const c = r.build();
    expect(c.get<number>('answer')).toBe(42);
  });

  it('the container build() returns supports override', () => {
    @Injectable()
    class Dep {
      readonly real: boolean = true;
    }
    @Injectable({ deps: [Dep] })
    class Service {
      constructor(readonly dep: Dep) {}
    }
    const r = createRegistry();
    r.register(Dep).useClass(Dep).asSingleton();
    r.register(Service).useClass(Service).asSingleton();
    const c = r.build();
    const stub = { real: false } as Dep;
    c.override(Dep, stub);
    expect(c.get(Service).dep).toBe(stub);
  });

  it('useArray resolves its items in push order', () => {
    @Injectable()
    class A {
      readonly name = 'a';
    }
    @Injectable()
    class B {
      readonly name = 'b';
    }
    class Items extends Array<A | B> {}
    const r = createRegistry();
    r.register(A).useClass(A).asSingleton();
    r.register(B).useClass(B).asSingleton();
    r.register(Items).useArray(Items).push(A).push(B);
    const items = r.build().get(Items);
    expect(items.map(i => i.name)).toEqual(['a', 'b']);
  });

  it('useMap resolves its items by key', () => {
    @Injectable()
    class Fast {
      readonly speed = 'fast';
    }
    class Processors extends Map<string, Fast> {}
    const r = createRegistry();
    r.register(Fast).useClass(Fast).asSingleton();
    r.register(Processors).useMap(Processors).set('fast', Fast);
    expect(r.build().get(Processors).get('fast')).toBeInstanceOf(Fast);
  });

  it('disposes in reverse creation order', async () => {
    const order: string[] = [];
    @Injectable()
    class Inner {
      async [Symbol.asyncDispose]() {
        order.push('inner');
      }
    }
    @Injectable({ deps: [Inner] })
    class Outer {
      constructor(readonly inner: Inner) {}
      async [Symbol.asyncDispose]() {
        order.push('outer');
      }
    }
    const r = createRegistry();
    r.register(Inner).useClass(Inner).asSingleton();
    r.register(Outer).useClass(Outer).asSingleton();
    const c = r.build();
    c.get(Outer);
    await c.disposeAsync();
    expect(order).toEqual(['outer', 'inner']);
  });

  it('a bare dispose() method is not a dispose protocol', async () => {
    let called = 0;
    @Injectable()
    class NotDisposable {
      dispose() {
        called += 1;
      }
    }
    const r = createRegistry();
    r.register(NotDisposable).useClass(NotDisposable).asSingleton();
    const c = r.build();
    c.get(NotDisposable);
    await c.disposeAsync();
    expect(called).toBe(0);
  });

  it('a disposed container rejects get, createScopedContainer and override', async () => {
    const c = createRegistry().build();
    await c.disposeAsync();
    await expect(c.disposeAsync()).resolves.toBeUndefined(); // idempotent
    expect(() => c.get(Thing)).toThrow('Cannot resolve from a disposed container');
    expect(() => c.createScopedContainer()).toThrow('Cannot create a scope from a disposed container');
    expect(() => c.override(Thing, new Thing())).toThrow('Cannot override a registration in a disposed container');
  });

  it('a fresh DefaultMetadataRegistry does not see globally decorated classes', () => {
    @Singleton()
    class GloballyDecorated {}

    const isolated = createRegistry(new DefaultMetadataRegistry()).build({ autoRegisterDecorated: true });
    expect(isolated.hasRegistration(GloballyDecorated)).toBe(false);

    const global = createRegistry().build({ autoRegisterDecorated: true });
    expect(global.hasRegistration(GloballyDecorated)).toBe(true);
  });

  it('formatIdentifier renders identifiers the way error messages do', () => {
    expect(formatIdentifier(Thing)).toContain('Thing');
    expect(() => createRegistry().build().get(Thing)).toThrow(`Registration for ${formatIdentifier(Thing)} not found`);
  });

  it('useValue and useInstance values are not disposed by the container', async () => {
    let disposed = 0;
    const value = {
      [Symbol.asyncDispose]() {
        disposed += 1;
        return Promise.resolve();
      },
    };
    const r = createRegistry();
    r.registerValue('res', value);
    const c = r.build();
    c.get('res');
    await c.disposeAsync();
    expect(disposed).toBe(0);
  });
});

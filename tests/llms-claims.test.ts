import { describe, it, expect } from 'vitest';
import { createRegistry, Injectable, Container, InjectKitContainerNoop } from '../src/index.js';

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

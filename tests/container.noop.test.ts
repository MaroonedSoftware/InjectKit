import { describe, it, expect } from 'vitest';
import { InjectKitContainerNoop, type ScopedContainer } from '../src/index.js';

class Service {}
const stringToken = 'string-token';
const symbolToken = Symbol('symbol-token');

describe('InjectKitContainerNoop', () => {
  describe('get', () => {
    it('always throws a "not found" error for class identifiers', () => {
      const container = new InjectKitContainerNoop();
      expect(() => container.get(Service)).toThrow('Registration for Service not found');
    });

    it('formats string identifiers in the error message', () => {
      const container = new InjectKitContainerNoop();
      expect(() => container.get(stringToken)).toThrow('Registration for string-token not found');
    });

    it('formats symbol identifiers in the error message', () => {
      const container = new InjectKitContainerNoop();
      expect(() => container.get(symbolToken)).toThrow('Registration for Symbol(symbol-token) not found');
    });
  });

  describe('hasRegistration', () => {
    it('always returns false', () => {
      const container = new InjectKitContainerNoop();
      expect(container.hasRegistration(Service)).toBe(false);
      expect(container.hasRegistration(stringToken)).toBe(false);
    });

    it('returns false even when a parent scope is present', () => {
      const parent = new InjectKitContainerNoop();
      const child = parent.createScopedContainer();
      expect(child.hasRegistration(Service)).toBe(false);
    });
  });

  describe('override', () => {
    it('is a no-op that does not throw', () => {
      const container = new InjectKitContainerNoop();
      expect(() => container.override(Service, new Service())).not.toThrow();
    });

    it('does not make a subsequent get resolve', () => {
      const container = new InjectKitContainerNoop();
      container.override(Service, new Service());
      expect(() => container.get(Service)).toThrow('Registration for Service not found');
    });
  });

  describe('createScopedContainer', () => {
    it('returns a new scoped noop container', () => {
      const container = new InjectKitContainerNoop();
      const scope = container.createScopedContainer();
      expect(scope).toBeInstanceOf(InjectKitContainerNoop);
      expect(scope).not.toBe(container);
    });

    it('produces a scope that still behaves as a noop', () => {
      const container = new InjectKitContainerNoop();
      const scope: ScopedContainer = container.createScopedContainer();
      expect(() => scope.get(Service)).toThrow('Registration for Service not found');
      expect(scope.hasRegistration(Service)).toBe(false);
    });

    it('does not dispose child scopes when the parent is disposed', async () => {
      const container = new InjectKitContainerNoop();
      const scope = container.createScopedContainer();
      await container.disposeAsync();
      // The child was created independently and remains usable.
      expect(() => scope.get(Service)).toThrow('Registration for Service not found');
    });
  });

  describe('disposal', () => {
    it('rejects resolution after disposal', async () => {
      const container = new InjectKitContainerNoop();
      await container.disposeAsync();
      expect(() => container.get(Service)).toThrow('Cannot resolve from a disposed container');
    });

    it('rejects override after disposal', async () => {
      const container = new InjectKitContainerNoop();
      await container.disposeAsync();
      expect(() => container.override(Service, new Service())).toThrow(
        'Cannot override a registration in a disposed container',
      );
    });

    it('rejects scope creation after disposal', async () => {
      const container = new InjectKitContainerNoop();
      await container.disposeAsync();
      expect(() => container.createScopedContainer()).toThrow('Cannot create a scope from a disposed container');
    });

    it('returns false from hasRegistration after disposal', async () => {
      const container = new InjectKitContainerNoop();
      await container.disposeAsync();
      expect(container.hasRegistration(Service)).toBe(false);
    });

    it('is idempotent', async () => {
      const container = new InjectKitContainerNoop();
      await expect(container.disposeAsync()).resolves.toBeUndefined();
      await expect(container.disposeAsync()).resolves.toBeUndefined();
    });

    it('supports await using via [Symbol.asyncDispose]', async () => {
      let captured: InjectKitContainerNoop;
      {
        await using container = new InjectKitContainerNoop();
        captured = container;
        expect(() => container.get(Service)).toThrow('Registration for Service not found');
      }
      // After the block the container is disposed.
      expect(() => captured.get(Service)).toThrow('Cannot resolve from a disposed container');
    });
  });
});

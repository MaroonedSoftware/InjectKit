import { describe, it, expect } from 'vitest';
import { formatIdentifier, InjectKitNotSet } from '../src/index.js';

describe('formatIdentifier', () => {
  it('returns string tokens unchanged', () => {
    expect(formatIdentifier('CONFIG')).toBe('CONFIG');
  });

  it('renders symbols with their description', () => {
    expect(formatIdentifier(Symbol('LOGGER'))).toBe('Symbol(LOGGER)');
  });

  it('falls back to Symbol.prototype.toString for symbols without a description', () => {
    expect(formatIdentifier(Symbol())).toBe('Symbol()');
  });

  it('uses the class name for constructors', () => {
    class Logger {}
    expect(formatIdentifier(Logger)).toBe('Logger');
  });

  it('uses the class name for abstract classes', () => {
    abstract class Repository {}
    expect(formatIdentifier(Repository)).toBe('Repository');
  });

  it('returns <anonymous> for nameless constructors', () => {
    const Anon = (() => class {})();
    Object.defineProperty(Anon, 'name', { value: '' });
    expect(formatIdentifier(Anon)).toBe('<anonymous>');
  });
});

describe('InjectKitNotSet', () => {
  it('is a unique symbol with a descriptive label', () => {
    expect(typeof InjectKitNotSet).toBe('symbol');
    expect(InjectKitNotSet.description).toBe('InjectKitNotSet');
    expect(InjectKitNotSet).not.toBe(Symbol('InjectKitNotSet'));
  });
});

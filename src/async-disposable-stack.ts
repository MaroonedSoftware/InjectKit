/**
 * Local, dependency-free reimplementation of the TC39 explicit-resource-management
 * `AsyncDisposableStack`.
 *
 * The class only landed natively in V8 13.6 (Node 24), but injectkit targets
 * Node >= 20 where the global is absent at runtime even though TypeScript's
 * `esnext` lib declares its type. Importing this module-scoped class avoids both
 * a runtime `ReferenceError` and an external polyfill dependency.
 *
 * Behaviour mirrors the specification: resources are disposed in LIFO order, the
 * stack is single-use (idempotent after disposal), and multiple disposal
 * failures are chained through `SuppressedError`.
 */

/**
 * Constructor shape for `SuppressedError`, used so the fallback below can stand
 * in for the native global without leaking an `any`.
 */
type SuppressedErrorConstructor = new (error: unknown, suppressed: unknown, message?: string) => Error;

/**
 * `SuppressedError` (the error wrapper the spec uses to chain disposal failures)
 * shipped alongside the stack classes in Node 24, so it is equally absent on the
 * supported Node floor. Fall back to a minimal, spec-compatible shape when the
 * global is missing.
 */
const SuppressedErrorImpl: SuppressedErrorConstructor =
  typeof SuppressedError !== 'undefined'
    ? SuppressedError
    : class SuppressedError extends Error {
        public error: unknown;
        public suppressed: unknown;

        constructor(error: unknown, suppressed: unknown, message?: string) {
          super(message);
          this.name = 'SuppressedError';
          this.error = error;
          this.suppressed = suppressed;
        }
      };

/**
 * A single registered teardown action. `value` is the resource the disposer is
 * bound to (or undefined for `defer`); `onDispose` performs the teardown.
 */
interface DisposeEntry {
  value: unknown;
  onDispose: (value: unknown) => void | PromiseLike<void>;
}

/**
 * Reads the async (preferred) or sync dispose method from a resource.
 * @param value The resource to inspect.
 * @returns The bound dispose method, or undefined when the value carries none.
 * @throws {TypeError} If a dispose property exists but is not callable.
 */
const getDisposeMethod = (value: object): ((this: object) => void | PromiseLike<void>) | undefined => {
  const indexed = value as Record<symbol, unknown>;
  const method = indexed[Symbol.asyncDispose] ?? indexed[Symbol.dispose];

  if (method === undefined || method === null) {
    return undefined;
  }

  if (typeof method !== 'function') {
    throw new TypeError('Object is not async disposable: dispose property is not a function');
  }

  return method as (this: object) => void | PromiseLike<void>;
};

/**
 * Stack-based container that aggregates async (and sync) disposable resources and
 * tears them all down in reverse registration order.
 *
 * Exported separately from {@link AsyncDisposableStack} so tests can exercise this
 * fallback implementation directly even on runtimes that ship the native class.
 */
export class LocalAsyncDisposableStack implements AsyncDisposable {
  /** Registered teardown actions, ordered oldest-first; disposed in reverse. */
  private stack: DisposeEntry[] = [];

  /** Whether the stack has been disposed or moved, after which it is inert. */
  private isDisposed = false;

  /**
   * Whether this stack has already been disposed (or had its resources moved).
   */
  public get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Registers a resource whose own `[Symbol.asyncDispose]` or `[Symbol.dispose]`
   * method should be invoked on disposal. Null and undefined are accepted and
   * ignored so callers can pass through optional values.
   * @template T The type of the resource value.
   * @param value The disposable resource (or null/undefined).
   * @returns The same value, for convenient inline use.
   * @throws {ReferenceError} If the stack is already disposed.
   * @throws {TypeError} If the value is non-nullish but not disposable.
   */
  public use<T>(value: T): T {
    this.assertNotDisposed();

    if (value !== null && value !== undefined) {
      const method = getDisposeMethod(value as object);
      if (method === undefined) {
        throw new TypeError('Object is not async disposable: missing [Symbol.asyncDispose]/[Symbol.dispose]');
      }
      this.stack.push({ value, onDispose: (resource) => method.call(resource as object) });
    }

    return value;
  }

  /**
   * Registers a resource together with an explicit teardown callback, for values
   * that do not implement a dispose protocol themselves.
   * @template T The type of the resource value.
   * @param value The resource to dispose.
   * @param onDisposeAsync Callback invoked with the value on disposal.
   * @returns The same value, for convenient inline use.
   * @throws {ReferenceError} If the stack is already disposed.
   * @throws {TypeError} If `onDisposeAsync` is not a function.
   */
  public adopt<T>(value: T, onDisposeAsync: (value: T) => void | PromiseLike<void>): T {
    this.assertNotDisposed();

    if (typeof onDisposeAsync !== 'function') {
      throw new TypeError('onDisposeAsync must be a function');
    }

    this.stack.push({ value, onDispose: (resource) => onDisposeAsync(resource as T) });
    return value;
  }

  /**
   * Registers a teardown callback with no associated resource value.
   * @param onDisposeAsync Callback invoked on disposal.
   * @throws {ReferenceError} If the stack is already disposed.
   * @throws {TypeError} If `onDisposeAsync` is not a function.
   */
  public defer(onDisposeAsync: () => void | PromiseLike<void>): void {
    this.assertNotDisposed();

    if (typeof onDisposeAsync !== 'function') {
      throw new TypeError('onDisposeAsync must be a function');
    }

    this.stack.push({ value: undefined, onDispose: () => onDisposeAsync() });
  }

  /**
   * Transfers ownership of all registered resources to a new stack and marks this
   * one disposed, so the resources are torn down exactly once by the new owner.
   * @returns A new stack holding the moved resources.
   * @throws {ReferenceError} If the stack is already disposed.
   */
  public move(): LocalAsyncDisposableStack {
    this.assertNotDisposed();

    const next = new LocalAsyncDisposableStack();
    next.stack = this.stack;
    this.stack = [];
    this.isDisposed = true;
    return next;
  }

  /**
   * Disposes every registered resource in reverse registration order. Idempotent:
   * a second call is a no-op. Disposal failures do not abort the run; they are
   * collected and the first (chained through `SuppressedError`) is rethrown.
   * @returns A promise that settles once all resources have been disposed.
   */
  public async disposeAsync(): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;

    let hasError = false;
    let error: unknown;

    // Pop in reverse so the most recently acquired resource is released first.
    while (this.stack.length > 0) {
      const entry = this.stack.pop() as DisposeEntry;
      try {
        await entry.onDispose(entry.value);
      } catch (thrown) {
        // Each new failure suppresses the one held so far, matching the spec's
        // SuppressedError chaining, so no error is silently dropped.
        error = hasError ? new SuppressedErrorImpl(thrown, error) : thrown;
        hasError = true;
      }
    }

    if (hasError) {
      throw error;
    }
  }

  /**
   * Async-dispose protocol entry point, enabling `await using` and delegation
   * from other disposables. Aliases {@link disposeAsync}.
   * @returns A promise that settles once all resources have been disposed.
   */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.disposeAsync();
  }

  /**
   * Guards mutating operations once the stack has been disposed or moved.
   * @throws {ReferenceError} If the stack is already disposed.
   */
  private assertNotDisposed(): void {
    if (this.isDisposed) {
      throw new ReferenceError('AsyncDisposableStack already disposed');
    }
  }
}

/**
 * The `AsyncDisposableStack` to use throughout injectkit.
 *
 * Prefers the engine's native class when present (Node >= 24 / V8 >= 13.6) so
 * consumers automatically benefit from its performance and any future spec fixes,
 * and falls back to {@link LocalAsyncDisposableStack} on older supported runtimes.
 * The native global and the local class share the same spec contract, so callers
 * are agnostic to which one they receive.
 */
export const AsyncDisposableStack: typeof globalThis.AsyncDisposableStack =
  typeof globalThis.AsyncDisposableStack !== 'undefined'
    ? globalThis.AsyncDisposableStack
    : (LocalAsyncDisposableStack as unknown as typeof globalThis.AsyncDisposableStack);

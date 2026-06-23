import { describe, it, expect } from 'vitest';
import { AsyncDisposableStack, LocalAsyncDisposableStack } from '../src/async-disposable-stack.js';

// The behaviour suite targets the local fallback directly so it keeps testing our
// implementation even on runtimes where the prefer-native export resolves to the
// engine's built-in class.
describe('LocalAsyncDisposableStack', () => {
  it('disposes registered resources in LIFO order', async () => {
    const order: number[] = [];
    const stack = new LocalAsyncDisposableStack();

    stack.defer(() => {
      order.push(1);
    });
    stack.defer(() => {
      order.push(2);
    });
    stack.defer(() => {
      order.push(3);
    });

    await stack.disposeAsync();

    expect(order).toEqual([3, 2, 1]);
  });

  it('use() invokes [Symbol.asyncDispose] and returns the value', async () => {
    let disposed = false;
    const resource = {
      async [Symbol.asyncDispose]() {
        disposed = true;
      },
    };

    const stack = new LocalAsyncDisposableStack();
    const returned = stack.use(resource);

    expect(returned).toBe(resource);
    await stack.disposeAsync();
    expect(disposed).toBe(true);
  });

  it('use() falls back to [Symbol.dispose] when async is absent', async () => {
    let disposed = false;
    const resource = {
      [Symbol.dispose]() {
        disposed = true;
      },
    };

    const stack = new LocalAsyncDisposableStack();
    stack.use(resource);
    await stack.disposeAsync();

    expect(disposed).toBe(true);
  });

  it('use() ignores null and undefined and returns them', () => {
    const stack = new LocalAsyncDisposableStack();
    expect(stack.use(null)).toBeNull();
    expect(stack.use(undefined)).toBeUndefined();
  });

  it('use() throws for non-disposable values', () => {
    const stack = new LocalAsyncDisposableStack();
    expect(() => stack.use({})).toThrow(TypeError);
  });

  it('adopt() disposes the value with the supplied callback', async () => {
    const closed: string[] = [];
    const stack = new LocalAsyncDisposableStack();

    const handle = stack.adopt('db', (value) => {
      closed.push(value);
    });

    expect(handle).toBe('db');
    await stack.disposeAsync();
    expect(closed).toEqual(['db']);
  });

  it('is idempotent — a second disposal is a no-op', async () => {
    let count = 0;
    const stack = new LocalAsyncDisposableStack();
    stack.defer(() => {
      count++;
    });

    await stack.disposeAsync();
    await stack.disposeAsync();

    expect(count).toBe(1);
    expect(stack.disposed).toBe(true);
  });

  it('rejects mutation after disposal', async () => {
    const stack = new LocalAsyncDisposableStack();
    await stack.disposeAsync();

    expect(() => stack.defer(() => {})).toThrow(ReferenceError);
    expect(() => stack.use(null)).toThrow(ReferenceError);
    expect(() => stack.adopt('x', () => {})).toThrow(ReferenceError);
    expect(() => stack.move()).toThrow(ReferenceError);
  });

  it('move() transfers ownership and disposes the source', async () => {
    let disposed = false;
    const stack = new LocalAsyncDisposableStack();
    stack.defer(() => {
      disposed = true;
    });

    const moved = stack.move();

    expect(stack.disposed).toBe(true);
    // The source no longer owns the resource, so disposing it does nothing.
    await stack.disposeAsync();
    expect(disposed).toBe(false);

    await moved.disposeAsync();
    expect(disposed).toBe(true);
  });

  it('continues disposing after a failure and chains errors', async () => {
    const order: number[] = [];
    const stack = new LocalAsyncDisposableStack();

    stack.defer(() => {
      order.push(1);
    });
    stack.defer(() => {
      throw new Error('boom-a');
    });
    stack.defer(() => {
      order.push(3);
      throw new Error('boom-b');
    });

    await expect(stack.disposeAsync()).rejects.toThrow();
    // Both non-failing deferrals still ran despite the thrown errors.
    expect(order).toEqual([3, 1]);
  });

  it('supports await using via the async-dispose protocol', async () => {
    let disposed = false;

    {
      await using stack = new LocalAsyncDisposableStack();
      stack.defer(() => {
        disposed = true;
      });
      expect(disposed).toBe(false);
    }

    expect(disposed).toBe(true);
  });
});

describe('AsyncDisposableStack (prefer-native export)', () => {
  it('resolves to the native class when present, otherwise the local fallback', () => {
    const native = (globalThis as { AsyncDisposableStack?: unknown }).AsyncDisposableStack;
    if (native !== undefined) {
      expect(AsyncDisposableStack).toBe(native);
    } else {
      expect(AsyncDisposableStack).toBe(LocalAsyncDisposableStack);
    }
  });

  it('behaves to spec regardless of which implementation backs it', async () => {
    const order: number[] = [];
    const stack = new AsyncDisposableStack();
    stack.defer(() => {
      order.push(1);
    });
    stack.defer(() => {
      order.push(2);
    });

    await stack.disposeAsync();

    expect(order).toEqual([2, 1]);
    expect(stack.disposed).toBe(true);
  });
});

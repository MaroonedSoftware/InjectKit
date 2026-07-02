import { Container, formatIdentifier, Identifier, Instance, ScopedContainer } from './interfaces.js';

/**
 * Null-object container that satisfies the {@link Container} and {@link ScopedContainer}
 * contracts while holding no registrations. Every resolution fails as "not found" and
 * `override` is a no-op, making it a safe default or placeholder wherever a real container
 * is not yet available. Mirrors {@link InjectKitContainer}'s disposed-state semantics.
 */
export class InjectKitContainerNoop implements ScopedContainer, Container {
  /** Whether this container has been disposed, after which it is inert. */
  private disposed = false;

  /**
   * Creates a new noop container.
   * @param parent Optional parent noop container for scope hierarchies.
   */
  constructor(private readonly parent?: InjectKitContainerNoop) {}

  /**
   * Async-dispose protocol entry point enabling `await using`. Aliases {@link disposeAsync}.
   * @returns A promise that settles once the container is marked disposed.
   */
  [Symbol.asyncDispose](): Promise<void> {
    return this.disposeAsync();
  }

  /**
   * No-op override retained for contract compatibility; a noop container holds no
   * registrations, so the arguments are intentionally ignored.
   * @throws {Error} If the container has been disposed.
   */
  override<T>(_id: Identifier<T>, _instance: Instance<T>): void {
    if (this.disposed) {
      throw new Error('Cannot override a registration in a disposed container');
    }
  }

  /**
   * Always fails to resolve, since a noop container holds no registrations.
   * @param id The identifier being resolved, used only to format the error.
   * @throws {Error} If the container has been disposed, or (always) that no registration exists.
   */
  get<T>(id: Identifier<T>): T {
    if (this.disposed) {
      throw new Error('Cannot resolve from a disposed container');
    }

    throw new Error(`Registration for ${formatIdentifier(id)} not found`);
  }

  /**
   * Creates a new noop scope with this container as its parent.
   * @returns A new {@link InjectKitContainerNoop} scoped to this one.
   * @throws {Error} If the container has been disposed.
   */
  createScopedContainer(): ScopedContainer {
    if (this.disposed) {
      throw new Error('Cannot create a scope from a disposed container');
    }
    return new InjectKitContainerNoop(this);
  }

  /**
   * Always reports the identifier as unregistered, since a noop container holds no registrations.
   * @returns False in every case.
   */
  hasRegistration<T>(id: Identifier<T>): boolean {
    if (this.disposed) {
      return false;
    }
    return this.parent?.hasRegistration(id) ?? false;
  }

  /**
   * Marks the container as disposed, after which resolving, overriding, or scoping throws.
   * Idempotent: a second call is a no-op.
   * @returns A resolved promise.
   */
  disposeAsync(): Promise<void> {
    this.disposed = true;
    return Promise.resolve();
  }
}

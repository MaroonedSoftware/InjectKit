import { Container, ScopedContainer, Identifier, Instance, formatIdentifier, InjectKitNotSet } from './interfaces.js';
import { Registration } from './internal.js';
import { AsyncDisposableStack } from './async-disposable-stack.js';

/**
 * Implementation of the dependency injection container.
 * Manages service registrations and resolves instances based on their lifetime strategy.
 */
export class InjectKitContainer implements ScopedContainer, Container {
  /** Map storing cached instances for singleton and scoped lifetimes. */
  private readonly instances = new Map<Identifier<unknown>, unknown>();

  /**
   * Disposable instances this container owns, released in reverse creation order on
   * disposal. Singletons are tracked on the root container, scoped instances on the
   * scope that created them — mirroring where each is cached.
   */
  private readonly disposables = new AsyncDisposableStack();

  /** Whether this container has been disposed, after which it is inert. */
  private disposed = false;

  /**
   * Per-scope override registrations. Held separately from the shared base
   * registration map so calling override() on a child scope cannot mutate the
   * parent (or sibling) scopes.
   */
  private readonly overrides = new Map<Identifier<unknown>, Registration<unknown>>();

  /**
   * Creates a new container instance.
   * @param registrations Map of registered services and their normalized configurations.
   * @param parent Optional parent container for scoped container hierarchies.
   */
  constructor(
    private readonly registrations: Map<Identifier<unknown>, Registration<unknown>>,
    private readonly parent?: InjectKitContainer,
  ) {}

  /**
   * Resolves the active registration for an identifier, preferring the nearest
   * override in the parent chain over the shared base registrations.
   * @template T The type represented by the identifier.
   * @param id The identifier to resolve.
   * @returns The matching registration, or undefined if none is registered.
   */
  private findRegistration<T>(id: Identifier<T>): Registration<T> | undefined {
    if (this.disposed) {
      return undefined;
    }

    let scope: InjectKitContainer | undefined = this;
    while (scope) {
      const override = scope.overrides.get(id);
      if (override) {
        return override as Registration<T>;
      }
      scope = scope.parent;
    }

    return this.registrations.get(id) as Registration<T> | undefined;
  }

  /**
   * Finds the root of this container's parent chain.
   * @returns The topmost container, or this container when it has no parent.
   */
  private rootContainer(): InjectKitContainer {
    let container: InjectKitContainer = this;

    while (container.parent) {
      container = container.parent;
    }

    return container;
  }

  /**
   * Creates a new instance from a normalized registration.
   * Handles constructor-based, factory-based and instance-based registrations,
   * then caches singleton and scoped instances according to their lifetime.
   *
   * Singletons resolve their dependencies from the root container rather than
   * from the scope that happened to trigger construction. A singleton is cached
   * at the root and outlives every scope, so resolving its dependencies through
   * a scope would let the first caller permanently capture that scope's
   * instances and per-scope {@link override} values, and would leave the
   * singleton holding objects that are disposed when the scope ends.
   * @template T The type of instance to create.
   * @param id The identifier for the registration being resolved.
   * @param registration The normalized registration configuration.
   * @returns A new or cached instance of type T.
   * @throws {Error} If the registration has no valid creation strategy.
   */
  private createInstance<T>(id: Identifier<T>, registration: Registration<T>): T {
    if (this.disposed) {
      throw new Error('Cannot create an instance from a disposed container');
    }

    const resolver = registration.lifetime === 'singleton' ? this.rootContainer() : this;

    let instance: T;

    if (registration.constructor) {
      const dependencies: unknown[] = [];
      for (const dependency of registration.ctorDependencies || []) {
        dependencies.push(resolver.get(dependency));
      }

      instance = new registration.constructor(...dependencies);
    } else if (registration.factory) {
      instance = registration.factory(resolver);
    } else if (registration.instance !== InjectKitNotSet) {
      instance = registration.instance;
    } else {
      throw new Error(`Invalid registration for ${formatIdentifier(id)}`);
    }

    // Array and map registrations are constructed first, then populated with
    // resolved dependency instances so collection lifetimes still apply.
    if (registration.collectionDependencies) {
      if (Array.isArray(registration.collectionDependencies) && instance instanceof Array) {
        for (const dependency of registration.collectionDependencies) {
          instance.push(resolver.get(dependency));
        }
      } else if (registration.collectionDependencies instanceof Map && instance instanceof Map) {
        for (const [key, dependency] of registration.collectionDependencies) {
          instance.set(key, resolver.get(dependency));
        }
      }
    }

    // Only instances the container itself constructed are container-owned and
    // therefore eligible for disposal; caller-supplied instances/values are not.
    const containerOwned = registration.constructor !== undefined || registration.factory !== undefined;

    if (registration.lifetime === 'singleton') {
      // Singletons are shared across the whole scope tree, so cache them at the
      // root: the same container their dependencies were resolved from.
      resolver.instances.set(id, instance);
      resolver.trackDisposable(instance, containerOwned);
    } else if (registration.lifetime === 'scoped') {
      this.instances.set(id, instance);
      this.trackDisposable(instance, containerOwned);
    }

    return instance;
  }

  /**
   * Registers a container-owned instance for disposal when it implements a dispose
   * protocol. Containers are skipped so the auto-registered `Container` (and any
   * factory returning a container) never schedules itself for self-disposal.
   * @param instance The cached instance to consider for disposal.
   * @param containerOwned Whether the container constructed the instance itself.
   */
  private trackDisposable(instance: unknown, containerOwned: boolean): void {
    if (!containerOwned || instance instanceof InjectKitContainer) {
      return;
    }

    if (InjectKitContainer.isDisposable(instance)) {
      this.disposables.use(instance);
    }
  }

  /**
   * Determines whether a value implements the async or sync dispose protocol.
   * @param value The value to inspect.
   * @returns True when the value carries `[Symbol.asyncDispose]` or `[Symbol.dispose]`.
   */
  private static isDisposable(value: unknown): value is AsyncDisposable | Disposable {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
      return false;
    }

    const indexed = value as Record<symbol, unknown>;
    return typeof indexed[Symbol.asyncDispose] === 'function' || typeof indexed[Symbol.dispose] === 'function';
  }

  /**
   * Retrieves a cached non-transient instance by traversing up the container hierarchy.
   * Scoped instances are inherited by child scopes, while singleton instances are found
   * at the root container after their first creation.
   * Uses Map.has so cached values of `undefined` (a valid registered value) are honored.
   * @template T The type of instance to retrieve.
   * @param id The identifier for the type to retrieve.
   * @returns A `{ instance }` wrapper when cached, otherwise undefined.
   */
  private getScopedInstance<T>(id: Identifier<T>): { instance: T } | undefined {
    if (this.instances.has(id)) {
      return { instance: this.instances.get(id) as T };
    }

    if (this.parent) {
      return this.parent.getScopedInstance(id);
    }

    return undefined;
  }

  /**
   * Retrieves an instance of the specified token from the container.
   * For singleton and scoped lifetimes, returns cached instances when available.
   * For transient lifetimes, creates a new instance each time.
   *
   * Resolving a singleton from a scope still builds it from the root container,
   * so it never captures the resolving scope's instances or overrides.
   * @template T The type of instance to retrieve.
   * @param id The identifier for the type to resolve.
   * @returns An instance of type T.
   * @throws {Error} If no registration is found for the specified identifier.
   */
  public get<T>(id: Identifier<T>): T {
    if (this.disposed) {
      throw new Error('Cannot resolve from a disposed container');
    }

    const registration = this.findRegistration(id);
    if (!registration) {
      throw new Error(`Registration for ${formatIdentifier(id)} not found`);
    }

    if (registration.lifetime !== 'transient') {
      const cached = this.getScopedInstance<T>(id);
      if (cached) {
        return cached.instance;
      }
    }

    return this.createInstance(id, registration);
  }

  /**
   * Checks if a service has a registration with the container.
   * @template T The type of the service to check.
   * @param id The identifier for the type to check.
   * @returns True if the service has a registration, false otherwise.
   */
  public hasRegistration<T>(id: Identifier<T>): boolean {
    return this.findRegistration(id) !== undefined;
  }

  /**
   * Creates a new scoped container that inherits all registrations from this container.
   * Scoped containers allow per-scope instance management, where scoped services are
   * shared within a scope chain but isolated between sibling scopes.
   * @returns A new scoped container instance with this container as its parent.
   */
  public createScopedContainer(): ScopedContainer {
    if (this.disposed) {
      throw new Error('Cannot create a scope from a disposed container');
    }

    return new InjectKitContainer(this.registrations, this);
  }

  /**
   * Disposes the disposable instances this container created, in reverse creation order.
   * Releases only instances owned by this container — scoped instances for a scope, or
   * singletons for the root — never bubbling to parent singletons or down into child
   * scopes. Idempotent: a second call is a no-op.
   * @returns A promise that settles once every owned instance has been disposed.
   */
  public async disposeAsync(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.disposables.disposeAsync();
  }

  /**
   * Async-dispose protocol entry point enabling `await using`. Aliases {@link disposeAsync}.
   * @returns A promise that settles once every owned instance has been disposed.
   */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.disposeAsync();
  }

  /**
   * Overrides a registration with an existing instance in the current scope.
   * The override is stored in the per-scope override map so it never leaks to
   * the parent or sibling scopes.
   *
   * Singletons are unaffected: they resolve their dependencies from the root
   * container, so a scope-level override is not visible to them. Override on
   * the root container to substitute a singleton's dependency.
   * @template T The type of instance to override.
   * @param id The identifier for the type to override.
   * @param instance The instance to use for the override.
   * @throws {Error} If the container has been disposed.
   */
  public override<T>(id: Identifier<T>, instance: Instance<T>): void {
    if (this.disposed) {
      throw new Error('Cannot override a registration in a disposed container');
    }
    this.overrides.set(id, {
      constructor: undefined,
      lifetime: 'scoped',
      dependencies: [],
      ctorDependencies: [],
      factory: undefined,
      instance,
      collectionDependencies: undefined,
    });
    this.instances.set(id, instance);
  }
}

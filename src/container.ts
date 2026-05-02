import { Container, ScopedContainer, Token } from './interfaces.js';
import { Registration } from './internal.js';
import { formatToken } from './token.js';

/**
 * Implementation of the dependency injection container.
 * Manages service registrations and resolves instances based on their lifetime strategy.
 */
export class InjectKitContainer implements ScopedContainer, Container {
  /** Map storing cached instances for singleton and scoped lifetimes. */
  private readonly instances = new Map<Token<unknown>, unknown>();

  /**
   * Per-scope override registrations. Held separately from the shared base
   * registration map so calling override() on a child scope cannot mutate the
   * parent (or sibling) scopes.
   */
  private readonly overrides = new Map<Token<unknown>, Registration<unknown>>();

  /**
   * Creates a new container instance.
   * @param registrations Map of registered services and their normalized configurations.
   * @param parent Optional parent container for scoped container hierarchies.
   */
  constructor(
    private readonly registrations: Map<Token<unknown>, Registration<unknown>>,
    private readonly parent?: InjectKitContainer,
  ) {}

  /**
   * Resolves the active registration for a token, preferring the nearest
   * override in the parent chain over the shared base registrations.
   * @template T The type represented by the token.
   * @param token The token to resolve.
   * @returns The matching registration, or undefined if none is registered.
   */
  private findRegistration<T>(token: Token<T>): Registration<T> | undefined {
    let scope: InjectKitContainer | undefined = this;
    while (scope) {
      const override = scope.overrides.get(token);
      if (override) {
        return override as Registration<T>;
      }
      scope = scope.parent;
    }

    return this.registrations.get(token) as Registration<T> | undefined;
  }

  /**
   * Creates a new instance from a normalized registration.
   * Handles constructor-based, factory-based and instance-based registrations,
   * then caches singleton and scoped instances according to their lifetime.
   * @template T The type of instance to create.
   * @param token The runtime token for the registration being resolved.
   * @param registration The normalized registration configuration.
   * @returns A new or cached instance of type T.
   * @throws {Error} If the registration has no valid creation strategy.
   */
  private createInstance<T>(token: Token<T>, registration: Registration<T>): T {
    let instance: T;

    if (registration.constructor) {
      const dependencies: unknown[] = [];
      for (const dependency of registration.ctorDependencies || []) {
        dependencies.push(this.get(dependency));
      }

      instance = new registration.constructor(...dependencies);
    } else if (registration.factory) {
      instance = registration.factory(this);
    } else if (registration.hasInstance) {
      instance = registration.instance as T;
    } else {
      throw new Error(`Invalid registration for ${formatToken(token)}`);
    }

    // Array and map registrations are constructed first, then populated with
    // resolved dependency instances so collection lifetimes still apply.
    if (registration.collectionDependencies) {
      if (Array.isArray(registration.collectionDependencies) && instance instanceof Array) {
        for (const dependency of registration.collectionDependencies) {
          instance.push(this.get(dependency));
        }
      } else if (registration.collectionDependencies instanceof Map && instance instanceof Map) {
        for (const [key, dependency] of registration.collectionDependencies) {
          instance.set(key, this.get(dependency));
        }
      }
    }

    if (registration.lifetime === 'singleton') {
      // Singletons are shared across the whole scope tree, so cache them at the root.
      let container: InjectKitContainer = this;

      while (container.parent) {
        container = container.parent;
      }

      container.instances.set(token, instance);
    } else if (registration.lifetime === 'scoped') {
      this.instances.set(token, instance);
    }

    return instance;
  }

  /**
   * Retrieves a cached non-transient instance by traversing up the container hierarchy.
   * Scoped instances are inherited by child scopes, while singleton instances are found
   * at the root container after their first creation.
   * Uses Map.has so cached values of `undefined` (a valid registered value) are honored.
   * @template T The type of instance to retrieve.
   * @param token The runtime token for the type to retrieve.
   * @returns A `{ instance }` wrapper when cached, otherwise undefined.
   */
  private getScopedInstance<T>(token: Token<T>): { instance: T } | undefined {
    if (this.instances.has(token)) {
      return { instance: this.instances.get(token) as T };
    }

    if (this.parent) {
      return this.parent.getScopedInstance(token);
    }

    return undefined;
  }

  /**
   * Retrieves an instance of the specified token from the container.
   * For singleton and scoped lifetimes, returns cached instances when available.
   * For transient lifetimes, creates a new instance each time.
   * @template T The type of instance to retrieve.
   * @param token The runtime token for the type to resolve.
   * @returns An instance of type T.
   * @throws {Error} If no registration is found for the specified token.
   */
  public get<T>(token: Token<T>): T {
    const registration = this.findRegistration(token);
    if (!registration) {
      throw new Error(`Registration for ${formatToken(token)} not found`);
    }

    if (registration.lifetime !== 'transient') {
      const cached = this.getScopedInstance<T>(token);
      if (cached) {
        return cached.instance;
      }
    }

    return this.createInstance(token, registration);
  }

  /**
   * Checks if a service has a registration with the container.
   * @template T The type of the service to check.
   * @param token The runtime token for the type to check.
   * @returns True if the service has a registration, false otherwise.
   */
  public hasRegistration<T>(token: Token<T>): boolean {
    return this.findRegistration(token) !== undefined;
  }

  /**
   * Creates a new scoped container that inherits all registrations from this container.
   * Scoped containers allow per-scope instance management, where scoped services are
   * shared within a scope chain but isolated between sibling scopes.
   * @returns A new scoped container instance with this container as its parent.
   */
  public createScopedContainer(): ScopedContainer {
    return new InjectKitContainer(this.registrations, this);
  }

  /**
   * Overrides a registration with an existing instance in the current scope.
   * The override is stored in the per-scope override map so it never leaks to
   * the parent or sibling scopes.
   * @template T The type of instance to override.
   * @param token The runtime token for the type to override.
   * @param instance The instance to use for the override.
   */
  public override<T>(token: Token<T>, instance: T): void {
    this.overrides.set(token, {
      constructor: undefined,
      lifetime: 'scoped',
      dependencies: [],
      ctorDependencies: [],
      factory: undefined,
      instance,
      hasInstance: true,
      collectionDependencies: undefined,
    });
    this.instances.set(token, instance);
  }
}

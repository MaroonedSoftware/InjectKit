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
   * Creates a new container instance.
   * @param registrations Map of registered services and their normalized configurations.
   * @param parent Optional parent container for scoped container hierarchies.
   */
  constructor(
    private readonly registrations: Map<Token<unknown>, Registration<unknown>>,
    private readonly parent?: InjectKitContainer,
  ) {}

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
    } else if (registration.instance !== undefined) {
      instance = registration.instance;
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
   * @template T The type of instance to retrieve.
   * @param token The runtime token for the type to retrieve.
   * @returns The cached instance, or undefined if no cached instance exists.
   */
  private getScopedInstance<T>(token: Token<T>): T | undefined {
    const instance = this.instances.get(token) as T | undefined;

    if (instance === undefined && this.parent) {
      return this.parent.getScopedInstance(token);
    }

    return instance;
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
    const registration = this.registrations.get(token) as Registration<T>;
    if (!registration) {
      throw new Error(`Registration for ${formatToken(token)} not found`);
    }

    if (registration.lifetime !== 'transient') {
      const instance = this.getScopedInstance(token);
      if (instance !== undefined) {
        return instance;
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
    return this.registrations.has(token);
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
   * The instance is cached locally so resolutions from this scope prefer the override.
   * @template T The type of instance to override.
   * @param token The runtime token for the type to override.
   * @param instance The instance to use for the override.
   */
  public override<T>(token: Token<T>, instance: T): void {
    this.registrations.set(token, {
      constructor: undefined,
      lifetime: 'scoped',
      dependencies: [],
      ctorDependencies: [],
      factory: undefined,
      instance,
      collectionDependencies: undefined,
    });
    this.instances.set(token, instance);
  }
}

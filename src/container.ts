import { Container, Identifier, Instance, ScopedContainer } from './interfaces.js';
import { Registration } from './internal.js';

/**
 * Implementation of the dependency injection container.
 * Manages service registrations and resolves instances based on their lifetime strategy.
 */
export class InjectKitContainer implements ScopedContainer, Container {
  /** Map storing cached instances for singleton and scoped lifetimes. */
  private readonly instances = new Map<Identifier<unknown>, unknown>();

  /**
   * Creates a new container instance.
   * @param registrations Map of registered services and their configurations.
   * @param parent Optional parent container for scoped container hierarchies.
   */
  constructor(
    private readonly registrations: Map<Identifier<unknown>, Registration<unknown>>,
    private readonly parent?: InjectKitContainer,
  ) {}

  /**
   * Creates a new instance of the specified type based on its registration configuration.
   * Handles constructor-based, factory-based, and instance-based registrations.
   * Manages singleton and scoped instance caching.
   * Also handles array and map collection dependencies by populating them with resolved instances.
   * @template T The type of instance to create.
   * @param id The identifier for the type to instantiate.
   * @param registration The registration configuration containing creation strategy.
   * @returns A new or cached instance of type T.
   * @throws {Error} If the registration is invalid (no constructor, factory, or instance provided).
   */
  private createInstance<T>(id: Identifier<T>, registration: Registration<T>): T {
    let instance: T;

    if (registration.constructor) {
      const dependencies = [];
      for (const dependency of registration.ctorDependencies || []) {
        dependencies.push(this.get(dependency));
      }

      instance = new registration.constructor(...dependencies);
    } else if (registration.factory) {
      instance = registration.factory(this);
    } else if (registration.instance) {
      instance = registration.instance;
    } else {
      throw new Error(`Invalid registration for ${id.name}`);
    }

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
      // @eslint-disable-next-line @typescript-eslint/no-this-alias
      let container: InjectKitContainer = this;

      while (container.parent) {
        container = container.parent;
      }

      container.instances.set(id, instance);
    } else if (registration.lifetime === 'scoped') {
      this.instances.set(id, instance);
    }

    return instance;
  }

  /**
   * Retrieves a cached scoped instance by traversing up the container hierarchy.
   * For scoped lifetimes, instances are stored in the container where they were created.
   * @template T The type of instance to retrieve.
   * @param id The identifier for the type to retrieve.
   * @returns The cached scoped instance, or undefined if not found.
   */
  private getScopedInstance<T>(id: Identifier<T>): T {
    const instance = this.instances.get(id) as T;

    if (!instance && this.parent) {
      return this.parent.getScopedInstance(id);
    } else {
      return instance;
    }
  }

  /**
   * Retrieves an instance of the specified type from the container.
   * For singleton and scoped lifetimes, returns cached instances when available.
   * For transient lifetimes, creates a new instance each time.
   * @template T The type of instance to retrieve.
   * @param id The identifier (constructor or abstract class) for the type to resolve.
   * @returns An instance of type T.
   * @throws {Error} If no registration is found for the specified identifier.
   */
  public get<T>(id: Identifier<T>): T {
    const registration = this.registrations.get(id) as Registration<T>;
    if (!registration) {
      throw new Error(`Registration for ${id.name} not found`);
    }

    if (registration.lifetime !== 'transient') {
      const instance = this.getScopedInstance<T>(id);
      if (instance) {
        return instance;
      }
    }

    return this.createInstance<T>(id, registration);
  }

  /**
   * Creates a new scoped container that inherits all registrations from this container.
   * Scoped containers allow for per-scope instance management, where scoped services
   * are shared within a scope but isolated between different scopes.
   * @returns A new scoped container instance with this container as its parent.
   */
  public createScopedContainer(): ScopedContainer {
    return new InjectKitContainer(this.registrations, this);
  }

  /**
   * Overrides the instance of the specified type in the container.
   * @template T The type of instance to override.
   * @param id The identifier for the type to override.
   * @param instance The instance to override.
   */
  public override<T>(id: Identifier<T>, instance: Instance<T>): void {
    this.registrations.set(id, {
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

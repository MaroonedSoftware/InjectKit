import 'reflect-metadata';
import {
  Constructor,
  Factory,
  Identifier,
  Instance,
  Lifetime,
  RegistrationType,
  Container,
  Abstract,
  RegistrationLifeTime,
  Registry,
  ArrayType,
  RegistrationArray,
  MapType,
  RegistrationMap,
} from './interfaces.js';
import { InjectKitContainer } from './container.js';
import { Registration } from './internal.js';

/**
 * Registry implementation for managing service registrations.
 * Allows registration of services with various creation strategies (class, factory, instance)
 * and lifetime management (singleton, transient, scoped).
 * Validates registrations for missing dependencies, circular dependencies, and tag conflicts
 * before building the container.
 */
export class InjectKitRegistry implements Registry {
  /** Internal map storing all service registrations by their identifier. */
  private readonly registrations: Map<Identifier<unknown>, InjectKitRegistration<unknown>> = new Map();

  /**
   * Registers a service with the registry.
   * @template T The type of the service to register.
   * @param id The identifier (constructor or abstract class) for the type to register.
   * @returns The registration type for configuring how the service should be created.
   * @throws {Error} If a registration for the given identifier already exists.
   */
  public register<T>(id: Identifier<T>): RegistrationType<T> {
    if (this.registrations.has(id)) {
      throw new Error(`Registration for ${id.name} already exists`);
    }
    const registration = new InjectKitRegistration<T>();
    this.registrations.set(id, registration);

    return registration;
  }

  /**
   * Removes a service registration from the registry.
   * @template T The type of the service to remove.
   * @param id The identifier (constructor or abstract class) for the type to remove.
   * @throws {Error} If the registration for the given identifier is not found.
   */
  public remove<T>(id: Identifier<T>): void {
    if (!this.registrations.delete(id)) {
      throw new Error(`Registration for ${id.name} not found`);
    }
  }

  /**
   * Checks if a service is registered with the registry.
   * @template T The type of the service to check.
   * @param id The identifier (constructor or abstract class) for the type to check.
   * @returns True if the service is registered, false otherwise.
   */
  public isRegistered<T>(id: Identifier<T>): boolean {
    return this.registrations.has(id);
  }

  /**
   * Verifies that all dependencies for registered services are also registered.
   * @param registrations Map of all registrations to verify.
   * @throws {Error} If any service has dependencies that are not registered.
   */
  private static verifyRegistrations(registrations: Map<Identifier<unknown>, Registration<unknown>>) {
    const missingDependencies: string[] = [];

    for (const [id, config] of registrations.entries()) {
      for (const dependency of config.dependencies) {
        if (!registrations.has(dependency)) {
          missingDependencies.push(dependency.name);
        }
      }

      if (missingDependencies.length > 0) {
        throw new Error(`Missing dependencies for ${id.name}: ${missingDependencies.join(', ')}`);
      }
    }
  }

  /**
   * Verifies that there are no circular dependencies in the registration graph.
   * Uses depth-first search to detect cycles in the dependency graph.
   * @param registrations Map of all registrations to verify.
   * @throws {Error} If a circular dependency is detected.
   */
  private static verifyNoCircularDependencies(registrations: Map<Identifier<unknown>, Registration<unknown>>) {
    /**
     * Recursively checks for circular dependencies starting from a given identifier.
     * @param id The identifier to check for circular dependencies.
     * @param registration The registration configuration for the identifier.
     * @param dependencies The path of dependencies traversed so far (for error reporting).
     */
    const checkCircularDependencies = (id: Identifier<unknown>, registration: Registration<unknown>, dependencies: string[]) => {
      for (const dependency of registration.dependencies) {
        if (id === dependency) {
          throw new Error(`Circular dependency found: ${[id.name, ...dependencies, id.name].join(' -> ')}`);
        }

        const dependencyRegistration = registrations.get(dependency);
        if (dependencyRegistration && dependencyRegistration.dependencies.length > 0) {
          checkCircularDependencies(id, dependencyRegistration, [...dependencies, dependency.name]);
        }
      }
    };

    for (const [id, config] of registrations.entries()) {
      checkCircularDependencies(id, config, []);
    }
  }

  /**
   * Builds a container from all registered services.
   * Performs validation checks for missing dependencies and circular dependencies.
   * @returns A configured container instance ready to resolve services.
   * @throws {Error} If validation fails (missing dependencies, circular dependencies).
   */
  public build(): Container {
    const registrations = new Map<Identifier<unknown>, Registration<unknown>>();

    for (const [id, registration] of this.registrations.entries()) {
      const config = registration.build();
      registrations.set(id, config);
    }

    if (!this.isRegistered(Container)) {
      registrations.set(Container, {
        lifetime: 'singleton',
        dependencies: [],
        ctorDependencies: [],
        collectionDependencies: undefined,
        constructor: undefined,
        factory: (container: Container) => container,
        instance: undefined,
      });
    }

    InjectKitRegistry.verifyRegistrations(registrations);
    InjectKitRegistry.verifyNoCircularDependencies(registrations);

    return new InjectKitContainer(registrations);
  }
}

/**
 * Internal registration builder that implements the fluent registration API.
 * Allows chaining of configuration methods to set up how a service should be created
 * and managed.
 * @template T The type being registered.
 * @internal
 */
class InjectKitRegistration<T> implements RegistrationType<T>, RegistrationLifeTime, RegistrationArray<T>, RegistrationMap<unknown, T> {
  /** Optional constructor function for class-based registration. */
  private ctor: Constructor<T> | undefined = undefined;
  /** Optional factory function for factory-based registration. */
  private factory: Factory<T> | undefined = undefined;
  /** Optional instance for instance-based registration. */
  private instance: Instance<T> | undefined = undefined;
  /** Optional collection of identifiers for array-based registration. */
  private collection: Array<Identifier<T>> | undefined = undefined;
  /** Optional collection of identifiers for map-based registration. */
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  private map: Map<any, Identifier<T>> | undefined = undefined;
  /** The lifetime management strategy for this registration. */
  private lifetime: Lifetime = 'transient';

  /**
   * Registers a service using a constructor class.
   * @param constructor The constructor function to use for creating instances.
   * @returns Registration lifetime options for further configuration.
   */
  useClass(constructor: Constructor<T>): RegistrationLifeTime {
    this.ctor = constructor;
    return this;
  }

  /**
   * Registers a service using a factory function.
   * @param factory The factory function that creates instances using the container.
   * @returns Registration lifetime options for further configuration.
   */
  useFactory(factory: Factory<T>): RegistrationLifeTime {
    this.factory = factory;
    return this;
  }

  /**
   * Registers a service using an existing instance.
   * @param instance The instance to register (will be used as a singleton).
   */
  useInstance(instance: Instance<T>): void {
    this.instance = instance;
    this.lifetime = 'singleton';
  }

  /**
   * Registers a service as an array type, allowing multiple implementations to be collected.
   * Use this when you need to register a service that extends Array and collect multiple implementations.
   * The array will be populated with instances resolved from the identifiers added via push().
   * @template U The array element type extracted from T.
   * @param constructor The constructor function for the array type (must extend Array).
   * @returns Registration array options for chaining push() calls to add implementations.
   * @example
   * ```typescript
   * @Injectable()
   * class NotificationService extends Array<Notifier> {}
   *
   * registry.register(NotificationService)
   *     .useArray(NotificationService)
   *     .push(EmailNotifier)
   *     .push(SmsNotifier);
   * ```
   */
  useArray<U extends ArrayType<T>>(constructor: Constructor<T>): RegistrationArray<U> {
    this.collection = [];
    this.ctor = constructor;
    return this as unknown as RegistrationArray<U>;
  }

  /**
   * Registers a service as a map type, allowing multiple implementations to be collected.
   * Use this when you need to register a service that extends Map and collect multiple implementations.
   * The map will be populated with instances resolved from the identifiers added via set().
   * @template U The map element type extracted from T.
   * @param constructor The constructor function for the map type (must extend Map).
   * @returns Registration map options for chaining set() calls to add implementations.
   * @example
   * ```typescript
   * @Injectable()
   * class ServiceMap extends Map<string, AbstractService> {}
   *
   * registry.register(ServiceMap)
   *     .useMap(ServiceMap)
   *     .set('email', EmailService)
   *     .set('sms', SmsService);
   * ```
   */
  useMap<U extends MapType<T>>(constructor: Constructor<T>): RegistrationMap<U[0], U[1]> {
    this.map = new Map();
    this.ctor = constructor;
    return this as unknown as RegistrationMap<U[0], U[1]>;
  }

  /**
   * Sets the lifetime to singleton (one instance shared across the container).
   */
  asSingleton(): void {
    this.lifetime = 'singleton';
  }

  /**
   * Sets the lifetime to transient (new instance created each time).
   */
  asTransient(): void {
    this.lifetime = 'transient';
  }

  /**
   * Sets the lifetime to scoped (one instance per scoped container).
   */
  asScoped(): void {
    this.lifetime = 'scoped';
  }

  /**
   * Adds an implementation identifier to the array collection.
   * Can be called multiple times to add multiple implementations.
   * The resolved instance will be pushed to the array when the service is created.
   * @param id The identifier of the implementation to add to the array.
   * @returns Registration array options for method chaining.
   * @example
   * ```typescript
   * registry.register(NotificationService)
   *     .useArray(NotificationService)
   *     .push(EmailNotifier)
   *     .push(SmsNotifier);
   * ```
   */
  push(id: Identifier<T>): RegistrationArray<T> {
    this.collection!.push(id);
    return this;
  }

  /**
   * Adds an implementation identifier to the map collection.
   * The resolved instance will be stored in the map with the provided key when the service is created.
   * @param key The key of the implementation to add to the map.
   * @param id The identifier of the implementation to add to the map.
   * @returns Registration map options for method chaining.
   * @example
   * ```typescript
   * registry.register(ServiceMap)
   *     .useMap(ServiceMap)
   *     .set('email', EmailService)
   *     .set('sms', SmsService);
   * ```
   */
  set(key: unknown, id: Identifier<T>): RegistrationMap<unknown, T> {
    this.map!.set(key, id);
    return this;
  }

  /**
   * Gets the base class of a given target class by inspecting its prototype chain.
   * @template T The type of the target.
   * @template B The type of the base class.
   * @param target The abstract class or constructor to get the base class for.
   * @returns The base class constructor, or undefined if the target extends Object directly.
   */
  private static getBaseClass<T extends B, B>(target: Abstract<T>) {
    const baseClass = Object.getPrototypeOf(target.prototype).constructor;
    if (baseClass === Object) {
      return undefined;
    }

    return baseClass;
  }

  /**
   * Extracts dependencies from a constructor using reflection metadata.
   * Handles inheritance by checking base classes if the current class has no dependencies.
   * Special handling for classes extending Array or Map - these don't require constructor dependency checks.
   * @template T The type of the target.
   * @param target The constructor or abstract class to extract dependencies from.
   * @param parents Array of parent class names for error reporting in case of missing decorators.
   * @returns Array of dependency identifiers.
   * @throws {Error} If the service is not properly decorated with dependency injection metadata.
   */
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  private static getDependencies<T>(target: Abstract<T>, parents: string[]): any {
    const dependencies = Reflect.getMetadata('design:paramtypes', target) ?? [];

    if (dependencies.length < target.length) {
      throw new Error(`Service not decorated: ${[...parents, target.name].join(' -> ')}`);
    }

    if (dependencies.length > 0) {
      return dependencies;
    }

    // If the target has a constructor with no parameters, return an empty array
    if (target.length > 0) {
      return [];
    }
    // Special handling for classes extending Array or Map - they don't need constructor dependencies
    const baseClass = this.getBaseClass(target);
    if (baseClass === Array || baseClass === Map) {
      return [];
    } else if (baseClass) {
      return this.getDependencies(baseClass, [...parents, target.name]);
    }

    return [];
  }

  /**
   * Builds the final registration configuration from the current builder state.
   * Extracts dependencies from the constructor if one is registered.
   * @returns A complete registration configuration object.
   */
  build(): Registration<T> {
    let ctorDependencies = [];

    // if (this._collection) {
    //     dependencies = this._collection;
    // } else if (this._map) {
    //     dependencies = Array.from(this._map);
    // } else
    if (this.ctor) {
      ctorDependencies = InjectKitRegistration.getDependencies(this.ctor, []);
    }

    const dependencies = [...ctorDependencies];
    if (this.collection) {
      dependencies.push(...this.collection);
    } else if (this.map) {
      dependencies.push(...Array.from(this.map.values()));
    }

    return {
      constructor: this.ctor,
      factory: this.factory,
      instance: this.instance,
      lifetime: this.lifetime,
      dependencies: dependencies,
      ctorDependencies: ctorDependencies,
      collectionDependencies: this.collection ?? this.map,
    };
  }
}

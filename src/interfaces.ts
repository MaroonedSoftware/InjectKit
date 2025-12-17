/**
 * Represents a constructor function that can be instantiated with the `new` operator.
 * @template T The type of instance that this constructor creates.
 */
export interface Constructor<T> extends Function {
  new (...args: any[]): T;
}

/**
 * Represents an abstract class or interface that cannot be directly instantiated.
 * @template T The type of the prototype.
 */
export interface Abstract<T> extends Function {
  prototype: T;
}

/**
 * A type identifier used to resolve dependencies in the container.
 * Can be either a concrete constructor or an abstract class/interface.
 * @template T The type being identified.
 */
export type Identifier<T> = Constructor<T> | Abstract<T>;

/**
 * Represents an instance of type T that is also an object.
 * @template T The type of the instance.
 */
export type Instance<T> = T & object;

/**
 * Extracts the element type from an array type.
 * @template T The array type to extract the element type from.
 * @example
 * ArrayType<Array<string>> // string
 * ArrayType<string[]> // string
 */
export type ArrayType<T> = T extends Array<infer I> ? I : never;

/**
 * Extracts the key and value types from a map type.
 * @template T The map type to extract the key and value types from.
 * @example
 * MapType<Map<string, number>> // [string, number]
 * MapType<Map<symbol, AbstractService>> // [symbol, AbstractService]
 */
export type MapType<T> = T extends Map<infer I, infer O> ? [I, O] : never;

/**
 * Dependency injection container that manages the creation and lifetime of registered services.
 */
export abstract class Container {
  /**
   * Retrieves an instance of the specified type from the container.
   * For singleton and scoped lifetimes, returns cached instances when available.
   * For transient lifetimes, creates a new instance each time.
   * @template T The type of instance to retrieve.
   * @param id The identifier (constructor or abstract class) for the type to resolve.
   * @returns An instance of type T.
   */
  abstract get<T>(id: Identifier<T>): T;

  /**
   * Creates a new scoped container that inherits all registrations from this container.
   * Scoped containers allow for per-scope instance management, where scoped services
   * are shared within a scope but isolated between different scopes.
   * @returns A new scoped container instance with this container as its parent.
   */
  abstract createScopedContainer(): ScopedContainer;
}

/**
 * Scoped container that extends the base container with the ability to override registrations.
 */
export type ScopedContainer = Container & {
  /**
   * Overrides the registration for the specified identifier with a new instance.
   * @template T The type of the instance to override.
   * @param id The identifier of the registration to override.
   * @param instance The instance to use for the registration.
   */
  override<T>(id: Identifier<T>, instance: Instance<T>): void;
};

/**
 * Factory function that creates an instance of type T using the provided container.
 * @template T The type of instance the factory creates.
 * @param container The container to use for resolving dependencies.
 * @returns An instance of type T.
 */
export type Factory<T> = (container: Container) => T;

/**
 * Defines the lifetime management strategy for a registered service.
 * - 'singleton': One instance shared across the entire container
 * - 'transient': A new instance created every time it's requested
 * - 'scoped': One instance per scoped container
 */
export type Lifetime = "singleton" | "transient" | "scoped";

/**
 * Fluent interface for configuring registration lifetime.
 * Allows chaining of configuration methods to set the lifetime of a registration.
 * @template T The type being registered.
 */
export interface RegistrationLifeTime {
  /**
   * Sets the lifetime to singleton (one instance shared across the container).
   */
  asSingleton(): void;

  /**
   * Sets the lifetime to transient (new instance created each time).
   */
  asTransient(): void;

  /**
   * Sets the lifetime to scoped (one instance per scoped container).
   */
  asScoped(): void;
}

/**
 * Fluent interface for configuring array-based registrations.
 * Allows chaining of push() calls to add multiple implementations to an array.
 * @template T The element type of the array being registered.
 */
export interface RegistrationArray<T> {
  /**
   * Adds an implementation identifier to the array collection.
   * The resolved instance will be pushed to the array when the service is created.
   * @param id The identifier of the implementation to add.
   * @returns Registration array options for method chaining.
   */
  push(id: Identifier<T>): RegistrationArray<T>;
}

/**
 * Fluent interface for configuring map-based registrations.
 * Allows chaining of set() calls to add multiple implementations to a map.
 * @template K The key type of the map being registered.
 * @template V The value type of the map being registered.
 */
export interface RegistrationMap<K, V> {
  /**
   * Adds an implementation identifier to the map collection.
   * The resolved instance will be stored in the map with the provided key when the service is created.
   * @param key The key of the implementation to add.
   * @param id The identifier of the implementation to add.
   * @returns Registration map options for method chaining.
   */
  set(key: K, id: Identifier<V>): RegistrationMap<K, V>;
}

/**
 * Fluent interface for specifying how a service should be created.
 * Provides methods to register a service using a class, factory, or instance.
 * @template T The type being registered.
 */
export interface RegistrationType<T> {
  /**
   * Registers a service using a constructor class.
   * @param constructor The constructor function to use for creating instances.
   * @returns Registration options for further configuration.
   */
  useClass(constructor: Constructor<T>): RegistrationLifeTime;

  /**
   * Registers a service using a factory function.
   * @param factory The factory function that creates instances.
   * @returns Registration options for further configuration.
   */
  useFactory(factory: Factory<T>): RegistrationLifeTime;

  /**
   * Registers a service using an existing instance.
   * @param instance The instance to register (will be used as a singleton).
   */
  useInstance(instance: Instance<T>): void;

  /**
   * Registers a service as an array type, allowing multiple implementations to be collected.
   * Use this when you need to register a service that extends Array and collect multiple implementations.
   * The array will be populated with instances resolved from the identifiers added via push().
   * @template U The array element type extracted from T.
   * @param constructor The constructor function for the array type (must extend Array).
   * @returns Registration array options for chaining push() calls to add implementations.
   */
  useArray<U extends ArrayType<T>>(
    constructor: Constructor<T>,
  ): RegistrationArray<U>;

  /**
   * Registers a service as a map type, allowing multiple implementations to be collected.
   * Use this when you need to register a service that extends Map and collect multiple implementations.
   * The map will be populated with instances resolved from the identifiers added via set().
   * @template U The map element type extracted from T.
   * @param constructor The constructor function for the map type (must extend Map).
   * @returns Registration map options for chaining set() calls to add implementations.
   */
  useMap<U extends MapType<T>>(
    constructor: Constructor<T>,
  ): RegistrationMap<U[0], U[1]>;
}

/**
 * Service registry that manages service registrations before building a container.
 * Allows registration, removal, and checking of services, and provides a method to build a container
 * with all registered services.
 */
export interface Registry {
  /**
   * Registers a service with the registry.
   * @template T The type of the service to register.
   * @param id The identifier (constructor or abstract class) for the type to register.
   * @returns The registration type for configuring how the service should be created.
   */
  register<T>(id: Identifier<T>): RegistrationType<T>;

  /**
   * Removes a service registration from the registry.
   * @template T The type of the service to remove.
   * @param id The identifier (constructor or abstract class) for the type to remove.
   */
  remove<T>(id: Identifier<T>): void;

  /**
   * Checks if a service is registered with the registry.
   * @template T The type of the service to check.
   * @param id The identifier (constructor or abstract class) for the type to check.
   * @returns True if the service is registered, false otherwise.
   */
  isRegistered<T>(id: Identifier<T>): boolean;

  /**
   * Builds a container from the registry.
   * @returns A container instance.
   */
  build(): Container;
}

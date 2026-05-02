/**
 * Represents a constructor function that can be instantiated with the `new` operator.
 * @template T The type of instance that this constructor creates.
 */
export interface Constructor<T> extends Function {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  new (...args: any[]): T;
}

/**
 * Represents an abstract class that cannot be directly instantiated.
 * @template T The type of the prototype.
 */
export interface Abstract<T> extends Function {
  prototype: T;
}

/**
 * Runtime token used to register and resolve dependencies.
 * Supports constructors, abstract classes, strings and symbols so consumers can
 * model both concrete services and nominal contracts.
 * @template T The type represented by the token.
 * @example
 * ```typescript
 * const LOGGER = Symbol('LOGGER');
 * registry.register(LOGGER).useClass(ConsoleLogger).asSingleton();
 * ```
 */
export type Token<T> = Constructor<T> | Abstract<T> | string | symbol;

/**
 * Backwards-compatible alias for previous API consumers.
 * @template T The type represented by the token.
 */
export type Identifier<T> = Token<T>;

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
 * Defines the lifetime management strategy for a registered service.
 * - 'singleton': One instance shared across the entire container tree
 * - 'transient': A new instance created every time it is requested
 * - 'scoped': One instance per scoped container chain
 */
export type Lifetime = 'singleton' | 'transient' | 'scoped';

/**
 * Dependency injection container that manages the creation and lifetime of registered services.
 */
export abstract class Container {
  /**
   * Retrieves an instance of the specified token from the container.
   * For singleton and scoped lifetimes, returns cached instances when available.
   * For transient lifetimes, creates a new instance each time.
   * @template T The type of instance to retrieve.
   * @param token The runtime token for the type to resolve.
   * @returns An instance of type T.
   */
  abstract get<T>(token: Token<T>): T;

  /**
   * Creates a new scoped container that inherits all registrations from this container.
   * Scoped services are shared within a scope chain but isolated between sibling scopes.
   * Singleton services are shared through the root container.
   * @returns A new scoped container instance with this container as its parent.
   */
  abstract createScopedContainer(): ScopedContainer;

  /**
   * Checks if a service has a registration with the container.
   * @template T The type of the service to check.
   * @param token The runtime token for the type to check.
   * @returns True if the service has a registration, false otherwise.
   */
  abstract hasRegistration<T>(token: Token<T>): boolean;
}

/**
 * Scoped container that extends the base container with the ability to override registrations.
 */
export type ScopedContainer = Container & {
  /**
   * Overrides the registration for the specified token with a new instance.
   * @template T The type of the instance to override.
   * @param token The runtime token of the registration to override.
   * @param instance The instance to use for the registration.
   */
  override<T>(token: Token<T>, instance: T): void;
};

/**
 * Factory function that creates an instance of type T using the provided container.
 * @template T The type of instance the factory creates.
 * @param container The container to use for resolving dependencies.
 * @returns An instance of type T.
 */
export type Factory<T> = (container: Container) => T;

/**
 * Fluent interface for configuring registration lifetime.
 * Allows chaining of configuration methods after choosing a creation strategy.
 */
export interface RegistrationLifeTime {
  /**
   * Sets the lifetime to singleton, sharing one instance across the container tree.
   */
  asSingleton(): void;

  /**
   * Sets the lifetime to transient, creating a new instance on every resolution.
   */
  asTransient(): void;

  /**
   * Sets the lifetime to scoped, sharing one instance within a scope chain.
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
   * Adds an implementation token to the array collection.
   * The resolved instance will be pushed to the array when the service is created.
   * @param token The runtime token of the implementation to add.
   * @returns Registration array options for method chaining.
   */
  push(token: Token<T>): RegistrationArray<T>;
}

/**
 * Fluent interface for configuring map-based registrations.
 * Allows chaining of set() calls to add multiple implementations to a map.
 * @template K The key type of the map being registered.
 * @template V The value type of the map being registered.
 */
export interface RegistrationMap<K, V> {
  /**
   * Adds an implementation token to the map collection.
   * The resolved instance will be stored in the map with the provided key.
   * @param key The key of the implementation to add.
   * @param token The runtime token of the implementation to add.
   * @returns Registration map options for method chaining.
   */
  set(key: K, token: Token<V>): RegistrationMap<K, V>;
}

/**
 * Fluent interface for specifying how a service should be created.
 * Provides methods to register a service using a class, factory, instance,
 * array collection or map collection.
 * @template T The type being registered.
 */
export interface RegistrationType<T> {
  /**
   * Registers a service using a constructor class.
   * Constructor dependencies are read from explicit decorator metadata first,
   * then from legacy reflect metadata when explicit deps are absent.
   * @param constructor The constructor function to use for creating instances.
   * @returns Registration lifetime options for further configuration.
   */
  useClass(constructor: Constructor<T>): RegistrationLifeTime;

  /**
   * Registers a service using a factory function.
   * @param factory The factory function that creates instances using the container.
   * @returns Registration lifetime options for further configuration.
   */
  useFactory(factory: Factory<T>): RegistrationLifeTime;

  /**
   * Registers a service using an existing instance or value.
   * Instance registrations always behave as singletons.
   * @param instance The instance or value to register.
   */
  useInstance(instance: T): void;

  /**
   * Registers a service as an array type, allowing multiple implementations to be collected.
   * The array will be populated with instances resolved from tokens added via push().
   * @template U The array element type extracted from T.
   * @param constructor The constructor function for the array type.
   * @returns Registration array options for chaining push() calls.
   */
  useArray<U extends ArrayType<T>>(constructor: Constructor<T>): RegistrationArray<U>;

  /**
   * Registers a service as a map type, allowing multiple implementations to be collected.
   * The map will be populated with instances resolved from tokens added via set().
   * @template U The map key/value tuple extracted from T.
   * @param constructor The constructor function for the map type.
   * @returns Registration map options for chaining set() calls.
   */
  useMap<U extends MapType<T>>(constructor: Constructor<T>): RegistrationMap<U[0], U[1]>;
}

/**
 * Override descriptor used by build() to replace or inject registrations.
 * @template T The type handled by the override.
 */
export type Override<T = unknown> =
  /**
   * Replaces a token with a class registration for the build call.
   */
  | {
      token: Token<T>;
      useClass: Constructor<T>;
      lifetime?: Lifetime;
    }
  /**
   * Replaces a token with a factory registration for the build call.
   */
  | {
      token: Token<T>;
      useFactory: Factory<T>;
      lifetime?: Lifetime;
    }
  /**
   * Replaces a token with a singleton value registration for the build call.
   */
  | {
      token: Token<T>;
      useValue: T;
    };

/**
 * Build options used to compose the final container graph.
 */
export interface BuildOptions {
  /**
   * When true, decorated classes known to the metadata registry are added if
   * they have not already been registered explicitly.
   */
  autoRegisterDecorated?: boolean;

  /**
   * Registrations applied after explicit and decorated registrations.
   * Useful for tests and environment-specific composition.
   */
  overrides?: Override[];
}

/**
 * Service registry that manages registrations before building a container.
 * Allows registration, removal and checking of services before materializing
 * a validated runtime container.
 */
export interface Registry {
  /**
   * Registers a service with the registry.
   * @template T The type of the service to register.
   * @param token The runtime token for the type to register.
   * @returns The registration type for configuring how the service should be created.
   */
  register<T>(token: Token<T>): RegistrationType<T>;

  /**
   * Registers an existing value for the specified token.
   * @template T The type of the registered value.
   * @param token The runtime token for the value.
   * @param value The value to register.
   * @returns This registry for chaining.
   */
  registerValue<T>(token: Token<T>, value: T): this;

  /**
   * Registers a factory for the specified token.
   * @template T The type created by the factory.
   * @param token The runtime token for the factory result.
   * @param factory The factory function that creates the value.
   * @param lifetime Optional lifetime, defaulting to transient.
   * @returns This registry for chaining.
   */
  registerFactory<T>(token: Token<T>, factory: Factory<T>, lifetime?: Lifetime): this;

  /**
   * Removes a service registration from the registry.
   * @template T The type of the service to remove.
   * @param token The runtime token for the type to remove.
   */
  remove<T>(token: Token<T>): void;

  /**
   * Checks if a service is registered with the registry.
   * @template T The type of the service to check.
   * @param token The runtime token for the type to check.
   * @returns True if the service is registered, false otherwise.
   */
  isRegistered<T>(token: Token<T>): boolean;

  /**
   * Builds a validated container from explicit registrations, optional decorated
   * registrations and optional overrides.
   * @param options Optional build-time composition settings.
   * @returns A container instance.
   */
  build(options?: BuildOptions): Container;
}

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
 * Supports strings and symbols so consumers can model both concrete services and nominal contracts.
 */
export type Token = string | symbol;

/**
 * A type identifier used to resolve dependencies in the container.
 * Can be either a concrete constructor, an abstract class/interface, or a token.
 * @template T The type being identified.
 */
export type Identifier<T> = Constructor<T> | Abstract<T> | Token;

/**
 * Represents an instance of type T that is also an object.
 * @template T The type of the instance.
 */
export type Instance<T> = T & object;

/**
 * Sentinel used by internal registrations to mark the absence of a configured
 * instance. A unique symbol is required because `undefined` is a valid
 * registered value and cannot itself signal "not set".
 */
export const InjectKitNotSet = Symbol('InjectKitNotSet');

/**
 * Value held in a registration's instance slot. Either a real instance, an
 * arbitrary value (for primitive/value registrations), or the `InjectKitNotSet`
 * sentinel when the registration was not configured with an instance.
 * @template T The type being registered.
 */
export type InstanceOrValue<T> = Instance<T> | T | typeof InjectKitNotSet;

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
 *
 * Implements {@link AsyncDisposable} so a container (or scope) can be torn down with
 * `await using` or an explicit {@link Container.disposeAsync} call. Disposal releases the
 * disposable instances the container itself created — singletons on the root container and
 * scoped instances on each scope — in reverse creation order.
 */
export abstract class Container implements AsyncDisposable {
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
   * Scoped services are shared within a scope chain but isolated between sibling scopes.
   * Singleton services are shared through the root container.
   * @returns A new scoped container instance with this container as its parent.
   */
  abstract createScopedContainer(): ScopedContainer;

  /**
   * Checks if a service has a registration with the container.
   * @template T The type of the service to check.
   * @param id The identifier (constructor or abstract class) for the type to check.
   * @returns True if the service has a registration, false otherwise.
   */
  abstract hasRegistration<T>(id: Identifier<T>): boolean;

  /**
   * Disposes the disposable instances this container created, in reverse creation order.
   *
   * Only instances the container constructed via `useClass`/`useFactory` that implement
   * `[Symbol.asyncDispose]` or `[Symbol.dispose]` are disposed; instances supplied via
   * `useInstance`/`useValue`/overrides are caller-owned and left untouched, and transient
   * instances are never tracked. Disposing a scope releases only that scope's instances —
   * it never bubbles to parent singletons, and disposing the root never reaches child
   * scopes you created (dispose those explicitly). Idempotent; after disposal, resolving
   * from or scoping the container throws.
   * @returns A promise that settles once every owned instance has been disposed.
   */
  abstract disposeAsync(): Promise<void>;

  /**
   * Async-dispose protocol entry point enabling `await using container = registry.build()`.
   * Aliases {@link Container.disposeAsync}.
   * @returns A promise that settles once every owned instance has been disposed.
   */
  abstract [Symbol.asyncDispose](): Promise<void>;
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
 * - 'singleton': One instance shared across the entire container tree
 * - 'transient': A new instance created every time it is requested
 * - 'scoped': One instance per scoped container chain
 */
export type Lifetime = 'singleton' | 'transient' | 'scoped';

/**
 * Fluent interface for configuring registration lifetime.
 * Allows chaining of configuration methods after choosing a creation strategy.
 */
export interface RegistrationLifeTime {
  /**
   * Sets the lifetime to singleton, sharing one instance across the container tree.
   * Singletons resolve their dependencies from the root container, and may not
   * depend on a scoped registration: `build()` rejects that as a captive dependency.
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
   * Registers a service using an existing instance.
   * @param instance The instance to register (will be used as a singleton).
   */
  useInstance(instance: Instance<T>): void;

  /**
   * Registers a service using an arbitrary value, including primitives, falsy
   * values, or `undefined`. Value registrations always behave as singletons,
   * regardless of any lifetime call on the same registration.
   * @param value The value to register.
   */
  useValue(value: T): void;

  /**
   * Registers a service as an array type, allowing multiple implementations to be collected.
   * The array will be populated with instances resolved from tokens added via push().
   * The element type is inferred from `T` when `T` is an array.
   * @param constructor The constructor function for the array type.
   * @returns Registration array options for chaining push() calls.
   */
  useArray(constructor: Constructor<T>): T extends Array<infer V> ? RegistrationArray<V> : never;

  /**
   * Registers a service as a map type, allowing multiple implementations to be collected.
   * The map will be populated with instances resolved from tokens added via set().
   * The key and value types are inferred from `T` when `T` is a map.
   * @param constructor The constructor function for the map type.
   * @returns Registration map options for chaining set() calls.
   */
  useMap(constructor: Constructor<T>): T extends Map<infer K, infer V> ? RegistrationMap<K, V> : never;
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
      token: Identifier<T>;
      useClass: Constructor<T>;
      lifetime?: Lifetime;
    }
  /**
   * Replaces a token with a factory registration for the build call.
   */
  | {
      token: Identifier<T>;
      useFactory: Factory<T>;
      lifetime?: Lifetime;
    }
  /**
   * Replaces a token with a singleton value registration for the build call.
   */
  | {
      token: Identifier<T>;
      useValue: Instance<T>;
    };

/**
 * Build options used to compose the final container graph.
 */
export interface BuildOptions {
  /**
   * Controls auto-registration of decorator-marked classes.
   *
   * - `false` (default): only explicit registrations are used.
   * - `true`: every injectable class known to the metadata registry is added
   *   if it has not been registered explicitly. Convenient, but the default
   *   metadata registry is process-global, so this can pull in classes from
   *   unrelated modules. Prefer the array form in non-trivial apps.
   * - `Class[]`: only the listed classes (and their inferred provide tokens)
   *   are auto-registered. Recommended for production use.
   */
  autoRegisterDecorated?: boolean | readonly (Constructor<unknown> | Abstract<unknown>)[];

  /**
   * Registrations applied after explicit and decorated registrations.
   * Useful for tests and environment-specific composition.
   */
  overrides?: Override[];
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
   * Registers an existing value for the specified token.
   * @template T The type of the registered value.
   * @param token The runtime token for the value.
   * @param value The value to register.
   * @returns This registry for chaining.
   */
  registerValue<T>(token: Token, value: T): this;

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
   * Builds a validated container from explicit registrations, optional decorated
   * registrations and optional overrides.
   * @param options Optional build-time composition settings.
   * @returns A container instance. Returned as a {@link ScopedContainer} because
   * the root container supports `override`, which is how a singleton's
   * dependency is stubbed (scope-level overrides are invisible to singletons).
   */
  build(options?: BuildOptions): ScopedContainer;
}

/**
 * Formats a runtime identifier into a readable string for diagnostics.
 * String and symbol identifiers do not have a class name, so error messages need a
 * shared formatter instead of directly reading `.name`.
 * @param id The identifier to format.
 * @returns A stable readable representation of the identifier.
 */
export const formatIdentifier = (id: Identifier<unknown>): string => {
  if (typeof id === 'string') {
    return id;
  } else if (typeof id === 'symbol') {
    return id.description ? `Symbol(${id.description})` : id.toString();
  }

  return id.name || '<anonymous>';
};

import {
  Abstract,
  ArrayType,
  BuildOptions,
  Container,
  Constructor,
  Factory,
  Lifetime,
  MapType,
  Override,
  RegistrationArray,
  RegistrationLifeTime,
  RegistrationMap,
  RegistrationType,
  Registry,
  Identifier,
  Instance,
  formatIdentifier,
  Token,
  InstanceOrValue,
  InjectKitNotSet,
} from './interfaces.js';
import { InjectKitContainer } from './container.js';
import { Registration } from './internal.js';
import { getDefaultMetadataRegistry, MetadataRegistry } from './metadata.js';

/**
 * Registry implementation for managing service registrations.
 * Allows registration of services with various creation strategies (class, factory, instance)
 * and lifetime management (singleton, transient, scoped). The registry owns the
 * composition phase and validates the final graph before creating a runtime container.
 */
export class InjectKitRegistry implements Registry {
  /** Internal map storing all explicit service registrations by runtime token. */
  private readonly registrations: Map<Identifier<unknown>, InjectKitRegistration<unknown>> = new Map();

  /**
   * Creates a registry.
   * @param metadataRegistry Metadata backend used to read decorator metadata and explicit deps.
   */
  constructor(private readonly metadataRegistry: MetadataRegistry = getDefaultMetadataRegistry()) {}

  /**
   * Registers a service with the registry.
   * @template T The type of the service to register.
   * @param id The identifier for the type to register.
   * @returns The registration type for configuring how the service should be created.
   * @throws {Error} If a registration for the given identifier already exists.
   */
  public register<T>(id: Identifier<T>): RegistrationType<T> {
    if (this.registrations.has(id)) {
      throw new Error(`Registration for ${formatIdentifier(id)} already exists`);
    }

    const registration = new InjectKitRegistration<T>(this.metadataRegistry);
    this.registrations.set(id, registration);
    return registration;
  }

  /**
   * Registers an existing value as a singleton registration.
   * @template T The type of the value to register.
   * @param token The runtime token for the value.
   * @param value The value to register.
   * @returns This registry for chaining.
   */
  public registerValue<T>(token: Token, value: T): this {
    if (this.registrations.has(token)) {
      throw new Error(`Registration for ${formatIdentifier(token)} already exists`);
    }

    const registration = new InjectKitRegistration<T>(this.metadataRegistry);
    registration.useValue(value);
    this.registrations.set(token, registration);

    return this;
  }

  /**
   * Removes a service registration from the registry.
   * @template T The type of the service to remove.
   * @param id The identifier for the type to remove.
   * @throws {Error} If the registration for the given token is not found.
   */
  public remove<T>(id: Identifier<T>): void {
    if (!this.registrations.delete(id)) {
      throw new Error(`Registration for ${formatIdentifier(id)} not found`);
    }
  }

  /**
   * Checks if a service is registered with the registry.
   * @template T The type of the service to check.
   * @param id The identifier for the type to check.
   * @returns True if the service is registered, false otherwise.
   */
  public isRegistered<T>(id: Identifier<T>): boolean {
    return this.registrations.has(id);
  }

  /**
   * Verifies that all dependencies for registered services are also registered.
   * @param registrations Map of all normalized registrations to verify.
   * @throws {Error} If any service has dependencies that are not registered.
   */
  private static verifyRegistrations(registrations: Map<Identifier<unknown>, Registration<unknown>>) {
    for (const [id, config] of registrations.entries()) {
      const missingDependencies: string[] = [];

      for (const dependency of config.dependencies) {
        if (!registrations.has(dependency)) {
          missingDependencies.push(formatIdentifier(dependency));
        }
      }

      if (missingDependencies.length > 0) {
        throw new Error(`Missing dependencies for ${formatIdentifier(id)}: ${missingDependencies.join(', ')}`);
      }
    }
  }

  /**
   * Verifies that there are no circular dependencies in the registration graph.
   * Uses depth-first traversal and formatted tokens so string and symbol tokens
   * produce useful diagnostic messages.
   * @param registrations Map of all normalized registrations to verify.
   * @throws {Error} If a circular dependency is detected.
   */
  private static verifyNoCircularDependencies(registrations: Map<Identifier<unknown>, Registration<unknown>>) {
    /**
     * Recursively checks for circular dependencies starting from an identifier.
     * @param id The identifier being checked for a cycle.
     * @param registration The normalized registration for the identifier.
     * @param dependencies The path traversed so far, formatted for error reporting.
     */
    const checkCircularDependencies = (id: Identifier<unknown>, registration: Registration<unknown>, dependencies: string[]) => {
      for (const dependency of registration.dependencies) {
        if (id === dependency) {
          throw new Error(`Circular dependency found: ${[formatIdentifier(id), ...dependencies, formatIdentifier(id)].join(' -> ')}`);
        }

        const dependencyRegistration = registrations.get(dependency);
        if (dependencyRegistration && dependencyRegistration.dependencies.length > 0) {
          checkCircularDependencies(id, dependencyRegistration, [...dependencies, formatIdentifier(dependency)]);
        }
      }
    };

    for (const [token, config] of registrations.entries()) {
      checkCircularDependencies(token, config, []);
    }
  }

  /**
   * Creates a normalized registration from a decorated class.
   * This path is used by auto-registration and class-based build overrides.
   * @param token The token that should resolve to the class.
   * @param constructor The constructor to instantiate.
   * @param lifetime Optional lifetime read from decorator metadata or override options.
   * @returns A normalized registration ready for validation.
   */
  private createRegistrationFromClass(constructor: Constructor<unknown>, lifetime?: Lifetime): Registration<unknown> {
    const registration = new InjectKitRegistration<unknown>(this.metadataRegistry);
    registration.useClass(constructor);

    if (lifetime === 'singleton') {
      registration.asSingleton();
    } else if (lifetime === 'scoped') {
      registration.asScoped();
    } else if (lifetime === 'transient') {
      registration.asTransient();
    }

    return registration.build();
  }

  /**
   * Creates a normalized registration from a build-time override descriptor.
   * Overrides are applied after explicit and decorated registrations so they can
   * intentionally replace either source.
   * @param override The override descriptor supplied to build().
   * @returns A normalized registration ready for validation.
   */
  private createRegistrationFromOverride(override: Override): Registration<unknown> {
    if ('useValue' in override) {
      return {
        constructor: undefined,
        factory: undefined,
        instance: override.useValue,
        lifetime: 'singleton',
        dependencies: [],
        ctorDependencies: [],
        collectionDependencies: undefined,
      };
    }

    if ('useFactory' in override) {
      return {
        constructor: undefined,
        factory: override.useFactory,
        instance: InjectKitNotSet,
        lifetime: override.lifetime ?? 'transient',
        dependencies: [],
        ctorDependencies: [],
        collectionDependencies: undefined,
      };
    }

    return this.createRegistrationFromClass(override.useClass, override.lifetime);
  }

  /**
   * Adds decorated classes known to the metadata registry into the final graph.
   * Explicit registrations win over decorated registrations, which keeps the
   * composition root in control even when auto-registration is enabled.
   * @param registrations The final registration map being composed.
   * @param targets When provided, only these classes are auto-registered;
   *   otherwise every injectable class known to the metadata registry is used.
   */
  private applyDecoratedRegistrations(
    registrations: Map<Identifier<unknown>, Registration<unknown>>,
    targets?: readonly (Constructor<unknown> | Abstract<unknown>)[],
  ): void {
    const candidates = targets ?? this.metadataRegistry.getDecoratedClasses();

    for (const target of candidates) {
      const metadata = this.metadataRegistry.getServiceMetadata(target);
      if (!metadata?.injectable) {
        continue;
      }

      const id = metadata.provide ?? target;
      if (registrations.has(id)) {
        continue;
      }

      registrations.set(id, this.createRegistrationFromClass(target as Constructor<unknown>, metadata.lifetime));
    }
  }

  /**
   * Builds a container from all configured sources.
   * The build order is explicit registrations, optional decorated registrations,
   * automatic Container registration, then build overrides. The final graph is
   * validated for missing and circular dependencies before a container is returned.
   * @param options Optional build-time composition settings.
   * @returns A configured container instance ready to resolve services.
   * @throws {Error} If validation fails.
   */
  public build(options: BuildOptions = {}): Container {
    const registrations = new Map<Identifier<unknown>, Registration<unknown>>();

    for (const [token, registration] of this.registrations.entries()) {
      registrations.set(token, registration.build());
    }

    // Build order is deliberate: explicit registrations (already populated above)
    // win over decorated, the Container self-registration only fills in if no
    // explicit/decorated registration was provided, and overrides are applied
    // last so they can replace either source.
    if (options.autoRegisterDecorated) {
      const targets = Array.isArray(options.autoRegisterDecorated) ? options.autoRegisterDecorated : undefined;
      this.applyDecoratedRegistrations(registrations, targets);
    }

    if (!registrations.has(Container)) {
      registrations.set(Container, {
        lifetime: 'singleton',
        dependencies: [],
        ctorDependencies: [],
        collectionDependencies: undefined,
        constructor: undefined,
        factory: (container: Container) => container,
        instance: InjectKitNotSet,
      });
    }

    for (const override of options.overrides ?? []) {
      registrations.set(override.token, this.createRegistrationFromOverride(override));
    }

    InjectKitRegistry.verifyRegistrations(registrations);
    InjectKitRegistry.verifyNoCircularDependencies(registrations);

    return new InjectKitContainer(registrations);
  }
}

/**
 * Creates a registry. By default the registry shares the process-global
 * metadata registry, which is convenient but exposes auto-registration to any
 * decorated class loaded anywhere in the process. Pass a fresh
 * `DefaultMetadataRegistry` (or any `MetadataRegistry`) for hard isolation.
 * @param metadataRegistry Optional metadata backend to use instead of the global one.
 * @returns A new registry instance.
 */
export const createRegistry = (metadataRegistry?: MetadataRegistry): InjectKitRegistry => new InjectKitRegistry(metadataRegistry);

class InjectKitRegistration<T> implements RegistrationType<T>, RegistrationLifeTime, RegistrationArray<T>, RegistrationMap<unknown, T> {
  /** Optional constructor function for class-based registration. */
  private ctor: Constructor<T> | undefined = undefined;

  /** Optional factory function for factory-based registration. */
  private factory: Factory<T> | undefined = undefined;

  /** Optional instance for instance-based registration. */
  private instance: InstanceOrValue<T> = InjectKitNotSet;

  /** Optional collection of tokens for array-based registration. */
  private collection: Array<Identifier<T>> | undefined = undefined;

  /** Optional collection of keyed tokens for map-based registration. */
  private map: Map<unknown, Identifier<T>> | undefined = undefined;

  /** The lifetime management strategy for this registration. */
  private lifetime: Lifetime = 'transient';

  /** Tracks whether the user explicitly chose a lifetime in the fluent API. */
  private lifetimeConfigured = false;

  /**
   * Creates a fluent registration builder.
   * @param metadataRegistry Metadata backend used to read constructor dependencies.
   */
  constructor(private readonly metadataRegistry: MetadataRegistry) {}

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
   * Registers a service using an existing object instance. Instance
   * registrations always behave as singletons.
   * @param instance The pre-built object instance to register.
   */
  useInstance(instance: Instance<T>): void {
    this.instance = instance;
    this.lifetime = 'singleton';
    this.lifetimeConfigured = true;
  }

  /**
   * Registers a service using an arbitrary value, including primitives, falsy
   * values, or `undefined`. Value registrations always behave as singletons.
   * @param value The value to register.
   */
  useValue(value: T): void {
    this.instance = value;
    this.lifetime = 'singleton';
    this.lifetimeConfigured = true;
  }

  /**
   * Registers a service as an array type, allowing multiple implementations to be collected.
   * The array will be populated with instances resolved from tokens added via push().
   * @template U The array element type extracted from T.
   * @param constructor The constructor function for the array type.
   * @returns Registration array options for chaining push() calls.
   */
  useArray<U extends ArrayType<T>>(constructor: Constructor<T>): RegistrationArray<U> {
    this.collection = [];
    this.ctor = constructor;
    return this as unknown as RegistrationArray<U>;
  }

  /**
   * Registers a service as a map type, allowing multiple implementations to be collected.
   * The map will be populated with instances resolved from tokens added via set().
   * @template U The map key/value tuple extracted from T.
   * @param constructor The constructor function for the map type.
   * @returns Registration map options for chaining set() calls.
   */
  useMap<U extends MapType<T>>(constructor: Constructor<T>): RegistrationMap<U[0], U[1]> {
    this.map = new Map();
    this.ctor = constructor;
    return this as unknown as RegistrationMap<U[0], U[1]>;
  }

  /**
   * Sets the lifetime to singleton, sharing one instance across the container tree.
   */
  asSingleton(): void {
    this.lifetime = 'singleton';
    this.lifetimeConfigured = true;
  }

  /**
   * Sets the lifetime to transient, creating a new instance on every resolution.
   */
  asTransient(): void {
    this.lifetime = 'transient';
    this.lifetimeConfigured = true;
  }

  /**
   * Sets the lifetime to scoped, sharing one instance within a scope chain.
   */
  asScoped(): void {
    this.lifetime = 'scoped';
    this.lifetimeConfigured = true;
  }

  /**
   * Adds an implementation identifier to an array collection registration.
   * @param id The identifier of the implementation to add.
   * @returns Registration array options for method chaining.
   */
  push(id: Identifier<T>): RegistrationArray<T> {
    this.collection!.push(id);
    return this;
  }

  /**
   * Adds an implementation identifier to a map collection registration.
   * @param key The key of the implementation to add.
   * @param id The identifier of the implementation to add.
   * @returns Registration map options for method chaining.
   */
  set(key: unknown, id: Identifier<T>): RegistrationMap<unknown, T> {
    this.map!.set(key, id);
    return this;
  }

  /**
   * Builds a normalized registration for validation and runtime resolution.
   * Constructor dependencies come from explicit decorator metadata or legacy
   * reflect metadata fallback, while array and map registrations append their
   * collection item identifiers as dependencies.
   * @returns A normalized registration.
   * @throws {Error} If constructor dependencies are missing or incomplete.
   */
  build(): Registration<T> {
    let ctorDependencies: Identifier<unknown>[] = [];
    if (this.ctor) {
      ctorDependencies = this.metadataRegistry.getConstructorDependencies(this.ctor as unknown as Abstract<unknown>);
    }

    const dependencies = [...ctorDependencies];
    if (this.collection) {
      dependencies.push(...this.collection);
    } else if (this.map) {
      dependencies.push(...Array.from(this.map.values()));
    }

    const lifetime =
      !this.lifetimeConfigured && this.ctor
        ? (this.metadataRegistry.getServiceMetadata(this.ctor as unknown as Abstract<unknown>)?.lifetime ?? this.lifetime)
        : this.lifetime;

    return {
      constructor: this.ctor,
      factory: this.factory,
      instance: this.instance,
      lifetime,
      dependencies,
      ctorDependencies,
      collectionDependencies: this.collection ?? this.map,
    };
  }
}

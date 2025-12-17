import { Constructor, Factory, Identifier, Instance, Lifetime } from './interfaces.js';

/**
 * Internal representation of a service registration in the container.
 * Contains all the information needed to resolve and create instances of the service.
 * @template T The type being registered.
 * @internal
 */
export type Registration<T> = {
    /** Optional constructor function for class-based registration. */
    constructor?: Constructor<T>;
    /** Optional factory function for factory-based registration. */
    factory?: Factory<T>;
    /** Optional instance for instance-based registration. */
    instance?: Instance<T>;
    /** The lifetime management strategy for this registration. */
    lifetime: Lifetime;
    /**
     * Array of all dependencies required by this registration.
     * This is the union of ctorDependencies and collectionDependencies.
     */
    dependencies: Identifier<unknown>[];
    /** Array of dependencies required by the constructor (extracted via reflection). */
    ctorDependencies: Identifier<unknown>[];
    /**
     * Optional collection of dependencies for array or map registration.
     * For arrays: Array of identifiers that will be resolved and pushed to the array.
     * For maps: Map of key-value pairs where values are identifiers that will be resolved and stored.
     */
    collectionDependencies?: Array<Identifier<unknown>> | Map<unknown, Identifier<unknown>>;
};

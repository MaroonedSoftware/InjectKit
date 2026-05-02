import { Constructor, Factory, Lifetime, Token } from './interfaces.js';

/**
 * Internal representation of a service registration in the container.
 * Contains all the information needed to resolve and create instances of the service.
 * @template T The type being registered.
 * @internal
 */
export type Registration<T> = {
  /** Constructor used for class-based registrations. */
  constructor?: Constructor<T>;

  /** Factory used for factory-based registrations. */
  factory?: Factory<T>;

  /** Existing instance or value used for instance-based registrations. */
  instance?: T;

  /** Lifetime strategy used when resolving the registration. */
  lifetime: Lifetime;

  /** All tokens that must exist in the final graph before build succeeds. */
  dependencies: Token<unknown>[];

  /** Constructor dependency tokens, resolved in parameter order. */
  ctorDependencies: Token<unknown>[];

  /** Collection item tokens for array and map registrations. */
  collectionDependencies?: Array<Token<unknown>> | Map<unknown, Token<unknown>>;
};

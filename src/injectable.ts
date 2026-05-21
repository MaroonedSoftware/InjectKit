import { Identifier, Lifetime } from './interfaces.js';
import { getDefaultMetadataRegistry } from './metadata.js';

const metadataRegistry = getDefaultMetadataRegistry();

/**
 * Options shared by service decorators.
 */
export interface ServiceDecoratorOptions {
  /**
   * Explicit constructor dependency tokens, in constructor parameter order.
   * When omitted, InjectKit falls back to legacy reflect-metadata constructor
   * metadata when it is available.
   */
  deps?: readonly Identifier<unknown>[];
}

type ServiceMetadataOptions = ServiceDecoratorOptions & {
  injectable?: boolean;
  lifetime?: Lifetime;
  provide?: Identifier<unknown>;
};

const applyServiceMetadata =
  (metadata: ServiceMetadataOptions = {}): ClassDecorator =>
  <TFunction extends Function>(target: TFunction): TFunction => {
    // Copy deps so callers cannot mutate stored metadata after decoration.
    metadataRegistry.defineServiceMetadata(target, {
      ...metadata,
      deps: metadata.deps ? [...metadata.deps] : undefined,
      injectable: metadata.injectable ?? true,
    });

    return target;
  };

/**
 * Marks a class as injectable and eligible for metadata-driven registration.
 * Classes can declare explicit deps for portability, or omit deps and keep using
 * legacy emitDecoratorMetadata metadata for backwards compatibility.
 * @param options Optional explicit dependency metadata.
 * @returns A class decorator that marks the class as injectable.
 * @example
 * ```typescript
 * @Injectable({ deps: [Logger] })
 * class UserService {
 *   constructor(private logger: Logger) {}
 * }
 * ```
 */
export const Injectable = (options: ServiceDecoratorOptions = {}): ClassDecorator => applyServiceMetadata({ injectable: true, ...options });

/**
 * Marks a class as injectable with singleton lifetime by default.
 * The fluent registration API can still override this lifetime explicitly.
 * @param options Optional explicit dependency metadata.
 * @returns A class decorator that marks the class as a singleton.
 */
export const Singleton = (options: ServiceDecoratorOptions = {}): ClassDecorator =>
  applyServiceMetadata({ injectable: true, lifetime: 'singleton', ...options });

/**
 * Marks a class as injectable with scoped lifetime by default.
 * The fluent registration API can still override this lifetime explicitly.
 * @param options Optional explicit dependency metadata.
 * @returns A class decorator that marks the class as scoped.
 */
export const Scoped = (options: ServiceDecoratorOptions = {}): ClassDecorator =>
  applyServiceMetadata({ injectable: true, lifetime: 'scoped', ...options });

/**
 * Marks a class as injectable with transient lifetime by default.
 * The fluent registration API can still override this lifetime explicitly.
 * @param options Optional explicit dependency metadata.
 * @returns A class decorator that marks the class as transient.
 */
export const Transient = (options: ServiceDecoratorOptions = {}): ClassDecorator =>
  applyServiceMetadata({ injectable: true, lifetime: 'transient', ...options });

/**
 * Declares the identifier satisfied by the decorated implementation.
 * Used by auto-registration to register the implementation under a class,
 * abstract class, string or symbol that differs from the class itself.
 * @param id The runtime identifier provided by the decorated class.
 * @param options Optional explicit dependency metadata.
 * @returns A class decorator that associates the class with the identifier.
 */
export const Provider = (id: Identifier<unknown>, options: ServiceDecoratorOptions = {}): ClassDecorator =>
  applyServiceMetadata({ injectable: true, provide: id, ...options });

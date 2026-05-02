import { Lifetime, Token } from './interfaces.js';
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
  deps?: readonly Token<unknown>[];
}

type ServiceMetadataOptions = ServiceDecoratorOptions & {
  injectable?: boolean;
  lifetime?: Lifetime;
  provide?: Token<unknown>;
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
export const Injectable = (
  options: ServiceDecoratorOptions = {},
): ClassDecorator => applyServiceMetadata({ injectable: true, ...options });

/**
 * Marks a class as injectable with singleton lifetime by default.
 * The fluent registration API can still override this lifetime explicitly.
 * @param options Optional explicit dependency metadata.
 * @returns A class decorator that marks the class as a singleton.
 */
export const Singleton = (
  options: ServiceDecoratorOptions = {},
): ClassDecorator =>
  applyServiceMetadata({ injectable: true, lifetime: 'singleton', ...options });

/**
 * Marks a class as injectable with scoped lifetime by default.
 * The fluent registration API can still override this lifetime explicitly.
 * @param options Optional explicit dependency metadata.
 * @returns A class decorator that marks the class as scoped.
 */
export const Scoped = (
  options: ServiceDecoratorOptions = {},
): ClassDecorator =>
  applyServiceMetadata({ injectable: true, lifetime: 'scoped', ...options });

/**
 * Marks a class as injectable with transient lifetime by default.
 * The fluent registration API can still override this lifetime explicitly.
 * @param options Optional explicit dependency metadata.
 * @returns A class decorator that marks the class as transient.
 */
export const Transient = (
  options: ServiceDecoratorOptions = {},
): ClassDecorator =>
  applyServiceMetadata({ injectable: true, lifetime: 'transient', ...options });

/**
 * Declares the token satisfied by the decorated implementation.
 * Used by auto-registration to register the implementation under a class,
 * abstract class, string or symbol token that differs from the class itself.
 * @param token The runtime token provided by the decorated class.
 * @param options Optional explicit dependency metadata.
 * @returns A class decorator that associates the class with the token.
 */
export const Provider = (
  token: Token<unknown>,
  options: ServiceDecoratorOptions = {},
): ClassDecorator =>
  applyServiceMetadata({ injectable: true, provide: token, ...options });

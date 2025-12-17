/**
 * Decorator for injectable classes. Every registered service must
 * be decorated because without decorators TypeScript won't emit
 * constructor parameter metadata required for dependency injection.
 *
 * @returns A class decorator that marks the class as injectable.
 *
 * @example
 * ```typescript
 * @Injectable()
 * class UserService {
 *     constructor(private db: DatabaseService) {}
 * }
 * ```
 *
 * @remarks
 * This decorator is required for classes registered with `useClass()`.
 * Without it, the container cannot determine constructor dependencies.
 */
export const Injectable = (): ClassDecorator => {
  return <TFunction extends Function>(target: TFunction): TFunction => {
    return target;
  };
};

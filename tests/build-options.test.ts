import { describe, expect, it } from 'vitest';
import {
  createRegistry,
  Injectable,
  Provider,
  Singleton,
} from '../src/index.js';

const LOGGER = Symbol('LOGGER');
const CONFIG = 'CONFIG';

@Singleton()
class Logger {
  log(message: string) {
    return `log:${message}`;
  }
}

@Singleton()
@Provider(LOGGER)
class LoggerProvider extends Logger {}

@Injectable()
class HomeContentService {
  getTitle() {
    return 'portfolio';
  }
}

@Injectable({ deps: [HomeContentService] })
class HomeInitializer {
  constructor(public readonly content: HomeContentService) {}
}

describe('build options', () => {
  it('should auto-register decorated classes', () => {
    const container = createRegistry().build({
      autoRegisterDecorated: true,
    });

    const initializer = container.get(HomeInitializer);
    expect(initializer.content.getTitle()).toBe('portfolio');
  });

  it('should auto-register decorated classes with legacy reflect metadata', () => {
    @Injectable()
    class LegacyContentService {
      getTitle() {
        return 'legacy';
      }
    }

    @Injectable()
    class LegacyInitializer {
      constructor(public readonly content: LegacyContentService) {}
    }

    const container = createRegistry().build({
      autoRegisterDecorated: true,
    });

    expect(container.get(LegacyInitializer).content.getTitle()).toBe('legacy');
  });

  it('should support registerValue for nominal tokens', () => {
    const container = createRegistry()
      .registerValue(CONFIG, { env: 'test' })
      .build();

    expect(container.get(CONFIG)).toEqual({ env: 'test' });
  });

  it('should resolve falsy registered values', () => {
    const container = createRegistry()
      .registerValue('enabled', false)
      .registerValue('retryCount', 0)
      .build();

    expect(container.get('enabled')).toBe(false);
    expect(container.get('retryCount')).toBe(0);
  });

  it('should support symbol tokens provided by decorators', () => {
    const container = createRegistry().build({
      autoRegisterDecorated: true,
    });

    const logger = container.get(LOGGER);
    expect(logger).toBeInstanceOf(LoggerProvider);
    expect(logger.log('hello')).toBe('log:hello');
  });

  it('should allow overrides to replace decorated registrations', () => {
    class TestLogger extends Logger {
      override log(message: string) {
        return `test:${message}`;
      }
    }

    const container = createRegistry().build({
      autoRegisterDecorated: true,
      overrides: [{ token: LOGGER, useClass: TestLogger, lifetime: 'singleton' }],
    });

    expect(container.get(LOGGER).log('hello')).toBe('test:hello');
  });
});

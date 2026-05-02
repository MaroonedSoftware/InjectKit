import { Token } from './interfaces.js';

/**
 * Formats a runtime token into a readable string for diagnostics.
 * String and symbol tokens do not have a class name, so error messages need a
 * shared formatter instead of directly reading `.name`.
 * @param token The token to format.
 * @returns A stable readable representation of the token.
 */
export const formatToken = (token: Token<unknown>): string => {
  if (typeof token === 'string') {
    return token;
  }

  if (typeof token === 'symbol') {
    return token.description ? `Symbol(${token.description})` : token.toString();
  }

  return token.name || '<anonymous>';
};

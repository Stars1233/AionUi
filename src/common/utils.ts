/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const uuid = (length = 8) => {
  try {
    // Prefer Web Crypto API for browser compatibility
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID && length >= 36) {
      return window.crypto.randomUUID();
    }

    // Use Web Crypto getRandomValues for browser environment
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(Math.ceil(length / 2));
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, length);
    }

    // Node.js environment - use dynamic import to avoid webpack bundling
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        // Dynamic require to avoid webpack bundling issues
        const cryptoModule = eval('require')('crypto');
        if (typeof cryptoModule.randomUUID === 'function' && length >= 36) {
          return cryptoModule.randomUUID();
        }
        const bytes = cryptoModule.randomBytes(Math.ceil(length / 2));
        return bytes.toString('hex').slice(0, length);
      } catch {
        // Fall through to fallback
      }
    }
  } catch {
    // Fallback without crypto
  }

  // Monotonic fallback without cryptographically secure randomness
  const base = Date.now().toString(36);
  return (base + base).slice(0, length);
};

export const parseError = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return error.msg || error.message || JSON.stringify(error);
};

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { useTranslation } from 'react-i18next';
import type { CodexError, ErrorCode } from '@/common/codex/types/errorTypes';
import { ERROR_CODES } from '@/common/codex/types/errorTypes';

// Re-export types for convenience
export type { CodexError, ErrorCode };
export { ERROR_CODES };

export class CodexErrorService {
  private maxRetries = 3;
  private retryableErrors = new Set<string>([ERROR_CODES.NETWORK_TIMEOUT, ERROR_CODES.NETWORK_UNKNOWN]);

  createError(code: string, message: string, options?: Partial<CodexError>): CodexError {
    const error = new Error(message) as CodexError;
    error.code = code;
    error.timestamp = new Date();
    error.retryCount = 0;

    if (options) {
      Object.assign(error, options);
    }

    return error;
  }

  handleError(error: CodexError, context?: string): CodexError {
    const processedError = { ...error };
    const { t } = useTranslation();
    if (context) {
      processedError.context = context;
    }

    // Store the i18n key for user-friendly messages instead of hardcoded English text
    switch (error.code) {
      case ERROR_CODES.CLOUDFLARE_BLOCKED:
        processedError.userMessage = t('codex.network.cloudflare_blocked');
        break;
      case ERROR_CODES.NETWORK_TIMEOUT:
        processedError.userMessage = t('codex.network.network_timeout');
        break;
      case ERROR_CODES.NETWORK_REFUSED:
        processedError.userMessage = t('codex.network.connection_refused');
        break;
      case ERROR_CODES.SESSION_TIMEOUT:
        processedError.userMessage = t('codex.error.session_timeout');
        break;
      case ERROR_CODES.SYSTEM_INIT_FAILED:
        processedError.userMessage = t('codex.error.system_init_failed');
        break;
      case ERROR_CODES.INVALID_MESSAGE_FORMAT:
        processedError.userMessage = t('codex.error.invalid_message_format');
        break;
      case ERROR_CODES.INVALID_INPUT:
        processedError.userMessage = t('codex.error.invalid_input');
        break;
      case ERROR_CODES.PERMISSION_DENIED:
        processedError.userMessage = t('codex.error.permission_denied');
        break;
      default:
        processedError.userMessage = t('codex.error.generic');
    }

    return processedError;
  }

  shouldRetry(error: CodexError): boolean {
    if (!error.retryCount) {
      error.retryCount = 0;
    }

    return error.retryCount < this.maxRetries && this.retryableErrors.has(error.code);
  }

  incrementRetryCount(error: CodexError): CodexError {
    const updatedError = { ...error };
    updatedError.retryCount = (updatedError.retryCount || 0) + 1;
    return updatedError;
  }
}

// Utility functions for creating specific error types
export function fromNetworkError(originalError: string | Error, options: { source?: string; retryCount?: number } = {}): CodexError {
  const errorMsg = typeof originalError === 'string' ? originalError : originalError.message;
  const lowerMsg = errorMsg.toLowerCase();

  let code: string;
  let userMessageKey: string;

  if (lowerMsg.includes('403') && lowerMsg.includes('cloudflare')) {
    code = ERROR_CODES.CLOUDFLARE_BLOCKED;
    userMessageKey = 'codex.network.cloudflare_blocked';
  } else if (lowerMsg.includes('timeout') || lowerMsg.includes('etimedout')) {
    code = ERROR_CODES.NETWORK_TIMEOUT;
    userMessageKey = 'codex.network.network_timeout';
  } else if (lowerMsg.includes('connection refused') || lowerMsg.includes('econnrefused')) {
    code = ERROR_CODES.NETWORK_REFUSED;
    userMessageKey = 'codex.network.connection_refused';
  } else {
    code = ERROR_CODES.NETWORK_UNKNOWN;
    userMessageKey = 'codex.network.unknown_error';
  }

  return globalErrorService.createError(code, errorMsg, {
    originalError: typeof originalError === 'string' ? undefined : originalError,
    userMessage: userMessageKey,
    retryCount: options.retryCount || 0,
    context: options.source,
    technicalDetails: {
      source: options.source,
      originalMessage: errorMsg,
    },
  });
}

export function fromSystemError(code: string, message: string, context?: string): CodexError {
  return globalErrorService.createError(code, message, {
    context,
    technicalDetails: {
      errorCode: code,
      context,
    },
  });
}

// Global instance
export const globalErrorService = new CodexErrorService();

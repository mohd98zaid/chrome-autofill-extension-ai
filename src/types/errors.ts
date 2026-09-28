/**
 * Standard Error Model & Taxonomy
 * Conforms to Error-handling.md
 */

export type ErrorCategory =
  | 'E_DOM'
  | 'E_CLASSIFICATION'
  | 'E_INTERACTION'
  | 'E_VERIFICATION'
  | 'E_AI'
  | 'E_PROVIDER'
  | 'E_SCHEMA'
  | 'E_NETWORK'
  | 'E_STORAGE'
  | 'E_SESSION'
  | 'E_SECURITY'
  | 'E_PERMISSION'
  | 'E_USER_REQUIRED'
  | 'E_UNSUPPORTED';

export interface AppError {
  code: string;
  category: ErrorCategory;
  message: string;
  recoverable: boolean;
  retryable: boolean;
  fieldId?: string;
  semanticType?: string;
  correlationId: string;
  userAction?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export class AssistantException extends Error {
  public readonly appError: AppError;

  constructor(error: Omit<AppError, 'timestamp' | 'correlationId'> & { correlationId?: string; timestamp?: string }) {
    super(error.message);
    this.name = 'AssistantException';
    this.appError = {
      ...error,
      correlationId: error.correlationId || crypto.randomUUID(),
      timestamp: error.timestamp || new Date().toISOString()
    };
  }
}

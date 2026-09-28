/**
 * Logging Abstraction
 * Conforms to Security.md Section 13 (PII Redaction, Auditable Actions)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  category: string;
  message: string;
  correlationId?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

class Logger {
  private isDevelopment = true;

  // Patterns for redaction
  private emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  private apiKeyRegex = /(Bearer\s+|api[_-]?key[:=]\s*)['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi;

  private sanitize(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return obj
        .replace(this.apiKeyRegex, '$1[REDACTED_API_KEY]')
        .replace(this.emailRegex, '[REDACTED_EMAIL]')
        .replace(this.phoneRegex, '[REDACTED_PHONE]');
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitize(item));
    }

    if (obj !== null && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('password') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('apikey') ||
          lowerKey.includes('api_key')
        ) {
          sanitized[key] = '[REDACTED_SECRET]';
        } else if (lowerKey.includes('ssn') || lowerKey.includes('cardnumber')) {
          sanitized[key] = '[REDACTED_SENSITIVE]';
        } else {
          sanitized[key] = this.sanitize(value);
        }
      }
      return sanitized;
    }

    return obj;
  }

  public log(level: LogLevel, category: string, message: string, data?: Record<string, unknown>, correlationId?: string) {
    const entry: LogEntry = {
      level,
      category,
      message,
      correlationId,
      data: data ? (this.sanitize(data) as Record<string, unknown>) : undefined,
      timestamp: new Date().toISOString()
    };

    const formatted = `[${entry.timestamp}] [${level.toUpperCase()}] [${category}] ${message}`;

    switch (level) {
      case 'debug':
        if (this.isDevelopment) console.debug(formatted, entry.data || '');
        break;
      case 'info':
        console.info(formatted, entry.data || '');
        break;
      case 'warn':
        console.warn(formatted, entry.data || '');
        break;
      case 'error':
        console.error(formatted, entry.data || '');
        break;
    }
  }

  public debug(category: string, message: string, data?: Record<string, unknown>, correlationId?: string) {
    this.log('debug', category, message, data, correlationId);
  }

  public info(category: string, message: string, data?: Record<string, unknown>, correlationId?: string) {
    this.log('info', category, message, data, correlationId);
  }

  public warn(category: string, message: string, data?: Record<string, unknown>, correlationId?: string) {
    this.log('warn', category, message, data, correlationId);
  }

  public error(category: string, message: string, data?: Record<string, unknown>, correlationId?: string) {
    this.log('error', category, message, data, correlationId);
  }
}

export const logger = new Logger();

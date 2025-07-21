import { Injectable } from '@angular/core';

/**
 * Service for centralized logging throughout the application
 *
 * This service provides methods for logging different types of messages
 * (info, warning, error) and handles the actual logging mechanism.
 * It can be extended in the future to support different logging backends
 * or additional features like log levels.
 */
@Injectable({
  providedIn: 'root'
})
export class LoggingService {

  constructor() {}

  /**
   * Logs an informational message
   *
   * @param source The source of the log (component or service name)
   * @param message The message to log
   * @param data Optional data to include with the log
   */
  info(source: string, message: string, data?: any): void {
    this.log('INFO', source, message, data);
  }

  /**
   * Logs a warning message
   *
   * @param source The source of the log (component or service name)
   * @param message The message to log
   * @param data Optional data to include with the log
   */
  warn(source: string, message: string, data?: any): void {
    this.log('WARNING', source, message, data);
  }

  /**
   * Logs an error message
   *
   * @param source The source of the log (component or service name)
   * @param message The message to log
   * @param data Optional data to include with the log
   */
  error(source: string, message: string, data?: any): void {
    this.log('ERROR', source, message, data);
  }

  /**
   * Internal method to handle the actual logging
   *
   * @param level The log level (INFO, WARNING, ERROR)
   * @param source The source of the log (component or service name)
   * @param message The message to log
   * @param data Optional data to include with the log
   */
  private log(level: string, source: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      source,
      message,
      data
    };

    // For now just log to console
    console.log(`[${timestamp}] [${level}] [${source}]: ${message}`, data ? data : '');
  }
}

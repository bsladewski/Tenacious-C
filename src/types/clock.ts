/**
 * Clock interface (F30)
 * Abstracts time operations for testability and determinism
 */

/**
 * Interface for time operations
 * Implementations can be real (system clock) or mock (for testing)
 */
export interface Clock {
  /**
   * Get the current time as a Date object
   */
  now(): Date;

  /**
   * Get the current time as a Unix timestamp (milliseconds)
   */
  timestamp(): number;

  /**
   * Get the current time as an ISO 8601 string
   */
  iso(): string;

  /**
   * Wait for a specified duration
   * @param ms - Duration to wait in milliseconds
   */
  delay(ms: number): Promise<void>;

  /**
   * Create a timeout promise that rejects after the specified duration
   * @param ms - Timeout duration in milliseconds
   * @param message - Error message for the timeout
   */
  timeout<T>(ms: number, message?: string): Promise<T>;

  /**
   * Measure the duration of an async operation
   * @param fn - The async function to measure
   * @returns The result of the function and the duration in milliseconds
   */
  measure<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }>;
}

/**
 * Real implementation of Clock using system time
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  timestamp(): number {
    return Date.now();
  }

  iso(): string {
    return new Date().toISOString();
  }

  async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async timeout<T>(ms: number, message?: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(message ?? `Operation timed out after ${ms}ms`));
      }, ms);
    });
  }

  async measure<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = Date.now();
    const result = await fn();
    const durationMs = Date.now() - start;
    return { result, durationMs };
  }
}

/**
 * Mock implementation of Clock for testing
 * Allows controlling time in tests
 */
export class MockClock implements Clock {
  private currentTime: Date;
  private delayCallbacks: Array<{ time: number; resolve: () => void }> = [];

  constructor(initialTime?: Date) {
    this.currentTime = initialTime ?? new Date('2025-01-01T00:00:00.000Z');
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  timestamp(): number {
    return this.currentTime.getTime();
  }

  iso(): string {
    return this.currentTime.toISOString();
  }

  async delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.delayCallbacks.push({
        time: this.currentTime.getTime() + ms,
        resolve,
      });
    });
  }

  async timeout<T>(ms: number, message?: string): Promise<T> {
    return new Promise((_, reject) => {
      this.delayCallbacks.push({
        time: this.currentTime.getTime() + ms,
        resolve: () => reject(new Error(message ?? `Operation timed out after ${ms}ms`)),
      });
    });
  }

  async measure<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = this.timestamp();
    const result = await fn();
    const durationMs = this.timestamp() - start;
    return { result, durationMs };
  }

  /**
   * Advance time by the specified duration and trigger any pending delays
   */
  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
    this.processDelays();
  }

  /**
   * Set the current time to a specific value
   */
  setTime(time: Date): void {
    this.currentTime = new Date(time);
    this.processDelays();
  }

  private processDelays(): void {
    const now = this.currentTime.getTime();
    const toResolve = this.delayCallbacks.filter((cb) => cb.time <= now);
    this.delayCallbacks = this.delayCallbacks.filter((cb) => cb.time > now);
    toResolve.forEach((cb) => cb.resolve());
  }
}

/**
 * Default singleton clock instance
 */
let defaultClock: Clock = new SystemClock();

/**
 * Get the default clock instance
 */
export function getDefaultClock(): Clock {
  return defaultClock;
}

/**
 * Set the default clock instance (for testing)
 */
export function setDefaultClock(clock: Clock): void {
  defaultClock = clock;
}

/**
 * Reset the default clock to a system clock
 */
export function resetDefaultClock(): void {
  defaultClock = new SystemClock();
}

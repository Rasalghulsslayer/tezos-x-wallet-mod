/**
 * Clock: now() abstraction for time-based logic and time-mocked tests.
 */

export interface Clock {
  now(): number;
}

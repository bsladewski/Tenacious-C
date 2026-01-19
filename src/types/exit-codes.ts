/**
 * Standardized exit codes (F8)
 * Following the ENGINEERING_GUIDE.md Section 4.4 specification
 */

/**
 * Standard exit codes for the CLI
 */
export const ExitCode = {
  /** Successful execution */
  SUCCESS: 0,
  /** Unexpected/unhandled error */
  UNEXPECTED_ERROR: 1,
  /** Invalid CLI usage or missing requirements */
  USAGE_ERROR: 2,
  /** Artifact schema/contract validation failed */
  VALIDATION_ERROR: 3,
  /** Iteration limit exceeded / did not converge */
  LIMIT_EXCEEDED: 4,
  /** Engine invocation failed */
  ENGINE_ERROR: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * Get a human-readable description of an exit code
 */
export function getExitCodeDescription(code: ExitCode): string {
  switch (code) {
    case ExitCode.SUCCESS:
      return 'Successful execution';
    case ExitCode.UNEXPECTED_ERROR:
      return 'Unexpected or unhandled error';
    case ExitCode.USAGE_ERROR:
      return 'Invalid CLI usage or missing requirements';
    case ExitCode.VALIDATION_ERROR:
      return 'Artifact schema or contract validation failed';
    case ExitCode.LIMIT_EXCEEDED:
      return 'Iteration limit exceeded without convergence';
    case ExitCode.ENGINE_ERROR:
      return 'Engine invocation failed';
    default:
      return 'Unknown exit code';
  }
}

/**
 * Check if an exit code indicates success
 */
export function isSuccessExitCode(code: number): boolean {
  return code === ExitCode.SUCCESS;
}

/**
 * Check if an exit code indicates a recoverable error
 * (errors that might be fixed by retrying or user intervention)
 */
export function isRecoverableExitCode(code: number): boolean {
  return code === ExitCode.LIMIT_EXCEEDED || code === ExitCode.ENGINE_ERROR;
}

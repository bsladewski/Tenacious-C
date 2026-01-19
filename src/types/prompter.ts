/**
 * Prompter interface (F5, F30)
 * Abstracts user prompts for testability and non-interactive mode support
 */

import { Result } from './result';

/**
 * Options for a single choice in a select prompt
 */
export interface SelectChoice<T = string> {
  /** Display name for the choice */
  name: string;
  /** Value returned when this choice is selected */
  value: T;
  /** Optional description shown below the choice */
  description?: string;
  /** Whether this choice is disabled */
  disabled?: boolean | string;
}

/**
 * Options for a confirmation prompt
 */
export interface ConfirmOptions {
  /** The question to ask */
  message: string;
  /** Default value if user just presses enter */
  default?: boolean;
}

/**
 * Options for a text input prompt
 */
export interface InputOptions {
  /** The question to ask */
  message: string;
  /** Default value if user just presses enter */
  default?: string;
  /** Validation function (return true if valid, or error message) */
  validate?: (input: string) => boolean | string | Promise<boolean | string>;
  /** Transform the input before returning */
  transformer?: (input: string) => string;
}

/**
 * Options for a select prompt (single choice)
 */
export interface SelectOptions<T = string> {
  /** The question to ask */
  message: string;
  /** Choices to present */
  choices: SelectChoice<T>[];
  /** Default value */
  default?: T;
}

/**
 * Options for a multi-select prompt (checkbox)
 */
export interface MultiSelectOptions<T = string> {
  /** The question to ask */
  message: string;
  /** Choices to present */
  choices: SelectChoice<T>[];
  /** Default selected values */
  default?: T[];
  /** Minimum number of selections required */
  minSelections?: number;
  /** Maximum number of selections allowed */
  maxSelections?: number;
}

/**
 * Options for an editor prompt (opens external editor)
 */
export interface EditorOptions {
  /** The question to ask */
  message: string;
  /** Default content for the editor */
  default?: string;
  /** File extension for syntax highlighting */
  extension?: string;
}

/**
 * Error types for prompter operations
 */
export type PrompterErrorCode =
  | 'CANCELLED'
  | 'NON_INTERACTIVE'
  | 'TIMEOUT'
  | 'VALIDATION_FAILED'
  | 'IO_ERROR';

/**
 * Prompter operation error
 */
export interface PrompterError {
  code: PrompterErrorCode;
  message: string;
  cause?: Error;
}

/**
 * Interface for user prompts
 * Implementations can be real (inquirer) or mock (for testing)
 */
export interface Prompter {
  /**
   * Ask for confirmation (yes/no)
   */
  confirm(options: ConfirmOptions): Promise<Result<boolean, PrompterError>>;

  /**
   * Ask for text input
   */
  input(options: InputOptions): Promise<Result<string, PrompterError>>;

  /**
   * Ask user to select from a list (single choice)
   */
  select<T = string>(options: SelectOptions<T>): Promise<Result<T, PrompterError>>;

  /**
   * Ask user to select from a list (multiple choices)
   */
  multiSelect<T = string>(options: MultiSelectOptions<T>): Promise<Result<T[], PrompterError>>;

  /**
   * Open external editor for longer text input
   */
  editor(options: EditorOptions): Promise<Result<string, PrompterError>>;

  /**
   * Check if prompts are available (TTY and interactive mode)
   */
  isInteractive(): boolean;

  /**
   * Set whether to operate in non-interactive mode
   * In non-interactive mode, prompts should return defaults or errors
   */
  setNonInteractive(nonInteractive: boolean): void;
}

/**
 * Create a PrompterError
 */
export function createPrompterError(
  code: PrompterErrorCode,
  message?: string,
  cause?: Error
): PrompterError {
  const defaultMessages: Record<PrompterErrorCode, string> = {
    CANCELLED: 'User cancelled the prompt',
    NON_INTERACTIVE: 'Cannot prompt in non-interactive mode',
    TIMEOUT: 'Prompt timed out',
    VALIDATION_FAILED: 'Input validation failed',
    IO_ERROR: 'IO error during prompt',
  };

  return {
    code,
    message: message ?? defaultMessages[code],
    cause,
  };
}

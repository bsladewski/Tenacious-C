/**
 * Inquirer-based Prompter Implementation (Phase 8)
 * Real implementation of Prompter interface using inquirer
 */

import inquirer from 'inquirer';
import {
  Prompter,
  ConfirmOptions,
  InputOptions,
  SelectOptions,
  MultiSelectOptions,
  EditorOptions,
  PrompterError,
  createPrompterError,
} from '../types/prompter';
import { Result, ok, err } from '../types/result';

/**
 * Configuration for the inquirer prompter
 */
export interface InquirerPrompterConfig {
  /** Whether running in interactive mode */
  interactive: boolean;
  /** Default values to use in non-interactive mode */
  defaults?: {
    confirm?: boolean;
    input?: string;
  };
}

/**
 * Inquirer-based implementation of the Prompter interface
 */
export class InquirerPrompter implements Prompter {
  private config: InquirerPrompterConfig;

  constructor(config: Partial<InquirerPrompterConfig> = {}) {
    this.config = {
      interactive: config.interactive ?? true,
      defaults: config.defaults,
    };
  }

  isInteractive(): boolean {
    return this.config.interactive && (process.stdout.isTTY ?? false);
  }

  setNonInteractive(nonInteractive: boolean): void {
    this.config.interactive = !nonInteractive;
  }

  async confirm(options: ConfirmOptions): Promise<Result<boolean, PrompterError>> {
    if (!this.isInteractive()) {
      if (options.default !== undefined) {
        return ok(options.default);
      }
      if (this.config.defaults?.confirm !== undefined) {
        return ok(this.config.defaults.confirm);
      }
      return err(
        createPrompterError('NON_INTERACTIVE', 'Cannot prompt for confirmation in non-interactive mode')
      );
    }

    try {
      const response = await inquirer.prompt<{ value: boolean }>([
        {
          type: 'confirm',
          name: 'value',
          message: options.message,
          default: options.default ?? true,
        },
      ]);
      return ok(response.value);
    } catch (error) {
      if (this.isCancelledError(error)) {
        return err(createPrompterError('CANCELLED', 'User cancelled the prompt'));
      }
      return err(this.wrapError(error, 'confirm'));
    }
  }

  async input(options: InputOptions): Promise<Result<string, PrompterError>> {
    if (!this.isInteractive()) {
      if (options.default !== undefined) {
        return ok(options.default);
      }
      if (this.config.defaults?.input !== undefined) {
        return ok(this.config.defaults.input);
      }
      return err(
        createPrompterError('NON_INTERACTIVE', 'Cannot prompt for input in non-interactive mode')
      );
    }

    try {
      const response = await inquirer.prompt<{ value: string }>([
        {
          type: 'input',
          name: 'value',
          message: options.message,
          default: options.default,
          validate: options.validate,
          transformer: options.transformer,
        },
      ]);
      return ok(response.value);
    } catch (error) {
      if (this.isCancelledError(error)) {
        return err(createPrompterError('CANCELLED', 'User cancelled the prompt'));
      }
      return err(this.wrapError(error, 'input'));
    }
  }

  async select<T = string>(options: SelectOptions<T>): Promise<Result<T, PrompterError>> {
    if (!this.isInteractive()) {
      // Use default if available
      if (options.default !== undefined) {
        return ok(options.default);
      }
      // Return first choice as fallback
      if (options.choices.length > 0) {
        return ok(options.choices[0].value);
      }
      return err(
        createPrompterError('NON_INTERACTIVE', 'Cannot prompt for selection in non-interactive mode')
      );
    }

    try {
      const response = await inquirer.prompt<{ value: T }>([
        {
          type: 'list',
          name: 'value',
          message: options.message,
          choices: options.choices.map((c) => ({
            name: c.description ? `${c.name} - ${c.description}` : c.name,
            value: c.value,
            disabled: c.disabled,
          })),
          default: options.default,
        },
      ]);
      return ok(response.value);
    } catch (error) {
      if (this.isCancelledError(error)) {
        return err(createPrompterError('CANCELLED', 'User cancelled the prompt'));
      }
      return err(this.wrapError(error, 'select'));
    }
  }

  async multiSelect<T = string>(options: MultiSelectOptions<T>): Promise<Result<T[], PrompterError>> {
    if (!this.isInteractive()) {
      // Use defaults if available
      if (options.default && options.default.length > 0) {
        return ok(options.default);
      }
      return err(
        createPrompterError('NON_INTERACTIVE', 'Cannot prompt for multi-selection in non-interactive mode')
      );
    }

    try {
      const response = await inquirer.prompt<{ value: T[] }>([
        {
          type: 'checkbox',
          name: 'value',
          message: options.message,
          choices: options.choices.map((c) => ({
            name: c.description ? `${c.name} - ${c.description}` : c.name,
            value: c.value,
            checked: options.default?.includes(c.value) ?? false,
            disabled: c.disabled,
          })),
          validate: (value: T[]) => {
            if (options.minSelections && value.length < options.minSelections) {
              return `At least ${options.minSelections} option(s) must be selected`;
            }
            if (options.maxSelections && value.length > options.maxSelections) {
              return `At most ${options.maxSelections} option(s) can be selected`;
            }
            return true;
          },
        },
      ]);
      return ok(response.value);
    } catch (error) {
      if (this.isCancelledError(error)) {
        return err(createPrompterError('CANCELLED', 'User cancelled the prompt'));
      }
      return err(this.wrapError(error, 'multiSelect'));
    }
  }

  async editor(options: EditorOptions): Promise<Result<string, PrompterError>> {
    if (!this.isInteractive()) {
      if (options.default !== undefined) {
        return ok(options.default);
      }
      return err(
        createPrompterError('NON_INTERACTIVE', 'Cannot prompt for editor input in non-interactive mode')
      );
    }

    try {
      const response = await inquirer.prompt<{ value: string }>([
        {
          type: 'editor',
          name: 'value',
          message: options.message,
          default: options.default,
        },
      ]);
      return ok(response.value);
    } catch (error) {
      if (this.isCancelledError(error)) {
        return err(createPrompterError('CANCELLED', 'User cancelled the prompt'));
      }
      return err(this.wrapError(error, 'editor'));
    }
  }

  private isCancelledError(error: unknown): boolean {
    // Check for Ctrl+C cancellation
    if (error instanceof Error) {
      return (
        error.message.includes('User force closed') ||
        error.message.includes('cancelled') ||
        error.name === 'ExitPromptError'
      );
    }
    return false;
  }

  private wrapError(error: unknown, operation: string): PrompterError {
    return createPrompterError(
      'IO_ERROR',
      `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Create an inquirer-based prompter
 */
export function createInquirerPrompter(config?: Partial<InquirerPrompterConfig>): Prompter {
  return new InquirerPrompter(config);
}

/**
 * Create a non-interactive prompter that uses defaults
 */
export function createNonInteractivePrompter(defaults?: InquirerPrompterConfig['defaults']): Prompter {
  return new InquirerPrompter({
    interactive: false,
    defaults,
  });
}

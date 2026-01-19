/**
 * Copilot Engine Adapter (Phase 3.6)
 * Implementation of EngineAdapter for GitHub Copilot CLI
 */

import { EngineResult, EngineExecutionOptions } from '../types/engine-result';
import { BaseEngineAdapter, EngineAdapterOptions } from './engine-adapter';

/**
 * Engine adapter for GitHub Copilot CLI
 */
export class CopilotAdapter extends BaseEngineAdapter {
  readonly name = 'copilot';

  constructor(options: EngineAdapterOptions) {
    super(options);
  }

  protected getDefaultExecutablePath(): string {
    return 'copilot';
  }

  protected buildArgs(options: EngineExecutionOptions): string[] {
    const args: string[] = [
      '-p', // Non-interactive mode (print)
      options.userMessage,
      '--yolo', // YOLO mode - enable all permissions
    ];

    // Add model flag if specified
    if (options.model) {
      args.push('--model', options.model);
    }

    return args;
  }

  // Override execute to handle Copilot-specific error cases
  async execute(options: EngineExecutionOptions): Promise<EngineResult> {
    try {
      return await super.execute(options);
    } catch (error) {
      // Check if this is a model configuration error (non-retryable)
      if (error instanceof Error && error.message.includes('model needs to be enabled')) {
        throw new Error(
          `Copilot model needs to be enabled first. Please run:\n` +
            `  copilot --model <model-name>\n` +
            `in interactive mode to enable a model, then try again.\n` +
            `Available models: claude-sonnet-4.5, claude-haiku-4.5, claude-opus-4.5, gpt-5.1-codex, gpt-5, etc.`
        );
      }
      throw error;
    }
  }

  // Override executeOnce to detect model configuration errors
  protected async executeOnce(options: EngineExecutionOptions, attempt: number): Promise<EngineResult> {
    const result = await super.executeOnce(options, attempt);

    // Check stderr for model configuration errors
    if (result.exitCode !== 0 && result.stderrTail) {
      const stderrJoined = result.stderrTail.join('\n');
      if (
        stderrJoined.includes('Run `copilot --model') &&
        stderrJoined.includes('in interactive mode')
      ) {
        throw new Error('Copilot model needs to be enabled first');
      }
    }

    return result;
  }
}

/**
 * Create a Copilot adapter instance
 */
export function createCopilotAdapter(options: EngineAdapterOptions): CopilotAdapter {
  return new CopilotAdapter(options);
}

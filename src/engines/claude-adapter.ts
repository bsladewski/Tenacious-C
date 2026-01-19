/**
 * Claude Engine Adapter (Phase 3.4)
 * Implementation of EngineAdapter for Claude CLI
 */

import { EngineExecutionOptions } from '../types/engine-result';
import { BaseEngineAdapter, EngineAdapterOptions } from './engine-adapter';

/**
 * Engine adapter for Claude CLI
 */
export class ClaudeAdapter extends BaseEngineAdapter {
  readonly name = 'claude';

  constructor(options: EngineAdapterOptions) {
    super(options);
  }

  protected getDefaultExecutablePath(): string {
    return 'claude';
  }

  protected buildArgs(options: EngineExecutionOptions): string[] {
    const args: string[] = [
      '-p', // Non-interactive mode (print)
      options.userMessage,
      '--dangerously-skip-permissions', // YOLO mode - bypass permission checks
    ];

    // Add model flag if specified
    if (options.model) {
      args.push('--model', options.model);
    }

    return args;
  }
}

/**
 * Create a Claude adapter instance
 */
export function createClaudeAdapter(options: EngineAdapterOptions): ClaudeAdapter {
  return new ClaudeAdapter(options);
}

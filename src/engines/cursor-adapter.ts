/**
 * Cursor Engine Adapter (Phase 3.3)
 * Implementation of EngineAdapter for Cursor CLI (cursor-agent)
 */

import { EngineExecutionOptions } from '../types/engine-result';
import { BaseEngineAdapter, EngineAdapterOptions } from './engine-adapter';

/**
 * Engine adapter for Cursor CLI (cursor-agent)
 */
export class CursorAdapter extends BaseEngineAdapter {
  readonly name = 'cursor';

  constructor(options: EngineAdapterOptions) {
    super(options);
  }

  protected getDefaultExecutablePath(): string {
    return 'cursor-agent';
  }

  protected buildArgs(options: EngineExecutionOptions): string[] {
    const args: string[] = [
      '-p', // Non-interactive mode (print)
      options.userMessage,
      '--force', // YOLO mode - bypass permission prompts
    ];

    // Add model flag if specified
    if (options.model) {
      args.push('--model', options.model);
    }

    return args;
  }
}

/**
 * Create a Cursor adapter instance
 */
export function createCursorAdapter(options: EngineAdapterOptions): CursorAdapter {
  return new CursorAdapter(options);
}

/**
 * Codex Engine Adapter (Phase 3.5)
 * Implementation of EngineAdapter for Codex CLI
 */

import { EngineExecutionOptions } from '../types/engine-result';
import { BaseEngineAdapter, EngineAdapterOptions } from './engine-adapter';

/**
 * Engine adapter for Codex CLI
 */
export class CodexAdapter extends BaseEngineAdapter {
  readonly name = 'codex';

  constructor(options: EngineAdapterOptions) {
    super(options);
  }

  protected getDefaultExecutablePath(): string {
    return 'codex';
  }

  protected buildArgs(options: EngineExecutionOptions): string[] {
    const args: string[] = [
      'exec', // Codex exec subcommand
      '--dangerously-bypass-approvals-and-sandbox', // YOLO mode
      options.userMessage,
    ];

    // Add model flag if specified
    if (options.model) {
      args.push('--model', options.model);
    }

    return args;
  }

  // Override to use 'codex --help' instead of '--version' for availability check
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.processRunner.spawn(this.executablePath, {
        args: ['--help'],
        cwd: this.workingDirectory,
        timeoutMs: 5000,
      });
      // Codex returns 0 for --help
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }
}

/**
 * Create a Codex adapter instance
 */
export function createCodexAdapter(options: EngineAdapterOptions): CodexAdapter {
  return new CodexAdapter(options);
}

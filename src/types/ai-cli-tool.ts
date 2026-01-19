import { ExecutionContext } from './execution-context';

/**
 * Interface for AI CLI tools that can execute prompts
 */
export interface AICliTool {
  /**
   * Execute a prompt using the AI CLI tool
   * @param prompt - The string prompt to execute
   * @param model - Optional model name to use for this execution. If not provided, the tool will use its default model selection.
   * @param context - Optional execution context providing phase and iteration information
   * @returns Promise that resolves when execution completes
   */
  execute(prompt: string, model?: string, context?: ExecutionContext): Promise<void>;
}

/**
 * Interface for AI CLI tools that can execute prompts
 */
export interface AICliTool {
  /**
   * Execute a prompt using the AI CLI tool
   * @param prompt - The string prompt to execute
   * @returns Promise that resolves when execution completes
   */
  execute(prompt: string): Promise<void>;
}

import { spawn } from 'child_process';
import ora from 'ora';
import { AICliTool } from '../interfaces/ai-cli-tool';
import { ExecutionContext } from '../interfaces/execution-context';

/**
 * Implementation of AICliTool for Cursor CLI (cursor-agent)
 * Runs in the background with loading indicator
 * Uses non-interactive mode with --print and --force flags
 */
export class CursorCliTool implements AICliTool {
  private readonly cursorPath: string;
  private readonly workingDirectory?: string;

  constructor(cursorPath: string = 'cursor-agent', workingDirectory?: string) {
    this.cursorPath = cursorPath;
    this.workingDirectory = workingDirectory;
  }

  async execute(prompt: string, model?: string, context?: ExecutionContext): Promise<void> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.executeOnce(prompt, model, attempt);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          throw lastError;
        }

        // Wait 10 seconds before retrying
        const spinner = ora(`Cursor execution failed, retrying in 10 seconds... (attempt ${attempt + 1}/${maxRetries})`).start();
        await new Promise(resolve => setTimeout(resolve, 10000));
        spinner.stop();
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Cursor execution failed after retries');
  }

  private async executeOnce(prompt: string, model: string | undefined, attempt: number): Promise<void> {
    const spinner = ora(attempt > 0 ? `Running Cursor... (retry ${attempt + 1})` : 'Running Cursor...').start();

    return new Promise((resolve, reject) => {
      // Use cursor-agent with -p/--print for non-interactive mode
      // --force: Force allow commands unless explicitly denied (YOLO mode)
      // This matches the "YOLO mode" behavior - no prompts, full access
      const args = [
        '-p',
        prompt,
        '--force',
      ];

      // Add model flag if specified
      if (model) {
        args.push('--model', model);
      }

      const child = spawn(this.cursorPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'], // Suppress stdin, capture stdout/stderr
        cwd: this.workingDirectory || process.cwd(),
        shell: false,
      });

      // Collect output but don't display it
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', () => {
          // Collect but don't use stdout
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('error', (error) => {
        spinner.fail('Failed to start Cursor');
        reject(new Error(`Failed to spawn cursor process: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          spinner.succeed('Cursor execution completed');
          resolve();
        } else {
          spinner.fail('Cursor execution failed');
          // Optionally include stderr in error message for debugging
          const errorMsg = stderr.trim() 
            ? `Cursor process exited with code ${code}: ${stderr.trim()}`
            : `Cursor process exited with code ${code}`;
          reject(new Error(errorMsg));
        }
      });
    });
  }
}

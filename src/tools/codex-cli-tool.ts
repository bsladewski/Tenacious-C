import { spawn } from 'child_process';
import ora from 'ora';
import { AICliTool } from '../interfaces/ai-cli-tool';
import { ExecutionContext } from '../interfaces/execution-context';

/**
 * Implementation of AICliTool for the Codex CLI
 * Runs in YOLO mode - no prompts, full access
 */
export class CodexCliTool implements AICliTool {
  private readonly codexPath: string;
  private readonly workingDirectory?: string;

  constructor(codexPath: string = 'codex', workingDirectory?: string) {
    this.codexPath = codexPath;
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
        const spinner = ora(`Codex execution failed, retrying in 10 seconds... (attempt ${attempt + 1}/${maxRetries})`).start();
        await new Promise(resolve => setTimeout(resolve, 10000));
        spinner.stop();
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Codex execution failed after retries');
  }

  private async executeOnce(prompt: string, model: string | undefined, attempt: number): Promise<void> {
    const spinner = ora(attempt > 0 ? `Running Codex... (retry ${attempt + 1})` : 'Running Codex...').start();

    return new Promise((resolve, reject) => {
      // Use codex exec with YOLO mode flag
      // --dangerously-bypass-approvals-and-sandbox: Skip all confirmations and sandboxing
      const args = [
        'exec',
        '--dangerously-bypass-approvals-and-sandbox',
        prompt,
      ];

      // Add model flag if specified
      if (model) {
        args.push('--model', model);
      }

      const child = spawn(this.codexPath, args, {
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
        spinner.fail('Failed to start Codex');
        reject(new Error(`Failed to spawn codex process: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          spinner.succeed('Codex execution completed');
          resolve();
        } else {
          spinner.fail('Codex execution failed');
          // Optionally include stderr in error message for debugging
          const errorMsg = stderr.trim() 
            ? `Codex process exited with code ${code}: ${stderr.trim()}`
            : `Codex process exited with code ${code}`;
          reject(new Error(errorMsg));
        }
      });
    });
  }
}

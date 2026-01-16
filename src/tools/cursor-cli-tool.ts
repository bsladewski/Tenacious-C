import { spawn } from 'child_process';
import ora from 'ora';
import { AICliTool } from '../interfaces/ai-cli-tool';

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

  async execute(prompt: string, model?: string): Promise<void> {
    const spinner = ora('Running Cursor...').start();

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

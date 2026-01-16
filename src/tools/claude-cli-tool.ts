import { spawn } from 'child_process';
import ora from 'ora';
import { AICliTool } from '../interfaces/ai-cli-tool';

/**
 * Implementation of AICliTool for Claude Code CLI
 * Runs in the background with loading indicator
 * Uses non-interactive mode with --print and --dangerously-skip-permissions flags
 */
export class ClaudeCliTool implements AICliTool {
  private readonly claudePath: string;
  private readonly workingDirectory?: string;

  constructor(claudePath: string = 'claude', workingDirectory?: string) {
    this.claudePath = claudePath;
    this.workingDirectory = workingDirectory;
  }

  async execute(prompt: string, model?: string): Promise<void> {
    const spinner = ora('Running Claude...').start();

    return new Promise((resolve, reject) => {
      // Use claude with -p/--print for non-interactive mode
      // --dangerously-skip-permissions: Bypass all permission checks (YOLO mode)
      // This matches the "YOLO mode" behavior - no prompts, full access
      const args = [
        '-p',
        prompt,
        '--dangerously-skip-permissions',
      ];

      // Add model flag if specified
      if (model) {
        args.push('--model', model);
      }

      const child = spawn(this.claudePath, args, {
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
        spinner.fail('Failed to start Claude');
        reject(new Error(`Failed to spawn claude process: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          spinner.succeed('Claude execution completed');
          resolve();
        } else {
          spinner.fail('Claude execution failed');
          // Optionally include stderr in error message for debugging
          const errorMsg = stderr.trim() 
            ? `Claude process exited with code ${code}: ${stderr.trim()}`
            : `Claude process exited with code ${code}`;
          reject(new Error(errorMsg));
        }
      });
    });
  }
}

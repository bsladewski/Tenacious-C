import { spawn } from 'child_process';
import ora from 'ora';
import { AICliTool } from '../interfaces/ai-cli-tool';

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

  async execute(prompt: string): Promise<void> {
    const spinner = ora('Running Codex...').start();

    return new Promise((resolve, reject) => {
      // Use codex exec with YOLO mode flag
      // --dangerously-bypass-approvals-and-sandbox: Skip all confirmations and sandboxing
      const args = [
        'exec',
        '--dangerously-bypass-approvals-and-sandbox',
        prompt,
      ];

      const child = spawn(this.codexPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'], // Suppress stdin, capture stdout/stderr
        cwd: this.workingDirectory || process.cwd(),
        shell: false,
      });

      // Collect output but don't display it
      let stdout = '';
      let stderr = '';

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
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

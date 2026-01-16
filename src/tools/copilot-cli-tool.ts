import { spawn } from 'child_process';
import ora from 'ora';
import { AICliTool } from '../interfaces/ai-cli-tool';

/**
 * Implementation of AICliTool for GitHub Copilot CLI
 * Runs in the background with loading indicator
 * Uses the new standalone GitHub Copilot CLI (not the deprecated gh extension)
 */
export class CopilotCliTool implements AICliTool {
  private readonly copilotPath: string;
  private readonly workingDirectory?: string;

  constructor(copilotPath: string = 'copilot', workingDirectory?: string) {
    this.copilotPath = copilotPath;
    this.workingDirectory = workingDirectory;
  }

  async execute(prompt: string): Promise<void> {
    const spinner = ora('Running Copilot...').start();

    return new Promise((resolve, reject) => {
      // Use the new GitHub Copilot CLI with -p/--prompt to pass the prompt
      // --yolo: Enable all permissions (equivalent to --allow-all-tools --allow-all-paths --allow-all-urls)
      // Note: Models must be enabled in interactive mode first. If you get an error about enabling a model,
      // run `copilot --model <model-name>` in interactive mode first to enable it.
      // We don't specify --model here to use the default/enabled model
      const args = [
        '-p',
        prompt,
        '--yolo',
      ];

      const child = spawn(this.copilotPath, args, {
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
        spinner.fail('Failed to start Copilot');
        reject(new Error(`Failed to spawn copilot process: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          spinner.succeed('Copilot execution completed');
          resolve();
        } else {
          spinner.fail('Copilot execution failed');
          // Check if the error is about needing to enable a model
          if (stderr.includes('Run `copilot --model') && stderr.includes('in interactive mode')) {
            const errorMsg = `Copilot model needs to be enabled first. Please run:\n` +
              `  copilot --model <model-name>\n` +
              `in interactive mode to enable a model, then try again.\n` +
              `Available models: claude-sonnet-4.5, claude-haiku-4.5, claude-opus-4.5, gpt-5.1-codex, gpt-5, etc.\n` +
              `Original error: ${stderr.trim()}`;
            reject(new Error(errorMsg));
          } else {
            // Other errors
            const errorMsg = stderr.trim() 
              ? `Copilot process exited with code ${code}: ${stderr.trim()}`
              : `Copilot process exited with code ${code}`;
            reject(new Error(errorMsg));
          }
        }
      });
    });
  }
}

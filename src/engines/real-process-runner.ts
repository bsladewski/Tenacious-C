/**
 * Real ProcessRunner implementation (F4)
 * Uses child_process.spawn for subprocess execution
 */

import { spawn, ChildProcess } from 'child_process';
import { createWriteStream, WriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { ProcessRunner, SpawnOptions, SpawnResult } from '../types/process-runner';

/**
 * Circular buffer to track last N lines of output
 */
class TailBuffer {
  private lines: string[] = [];
  private buffer: string = '';
  private readonly maxLines: number;

  constructor(maxLines: number = 50) {
    this.maxLines = maxLines;
  }

  append(data: string): void {
    this.buffer += data;
    const parts = this.buffer.split('\n');
    // Keep incomplete line in buffer
    this.buffer = parts.pop() ?? '';
    // Add complete lines
    for (const line of parts) {
      this.lines.push(line);
      if (this.lines.length > this.maxLines) {
        this.lines.shift();
      }
    }
  }

  getLines(): string[] {
    // Include any remaining buffer content as a line
    if (this.buffer) {
      return [...this.lines, this.buffer];
    }
    return [...this.lines];
  }
}

/**
 * Real implementation of ProcessRunner using child_process
 */
export class RealProcessRunner implements ProcessRunner {
  private runningProcesses: Map<number, ChildProcess> = new Map();
  private processIdCounter = 0;

  async spawn(command: string, options: SpawnOptions): Promise<SpawnResult> {
    const startTime = Date.now();
    const tailLines = options.tailLines ?? 50;

    // Set up tail buffers
    const stdoutTail = new TailBuffer(tailLines);
    const stderrTail = new TailBuffer(tailLines);

    // Set up transcript files if requested
    let stdoutStream: WriteStream | undefined;
    let stderrStream: WriteStream | undefined;
    let stdoutTranscriptPath: string | undefined;
    let stderrTranscriptPath: string | undefined;

    if (options.captureTranscripts && options.transcriptDir) {
      mkdirSync(options.transcriptDir, { recursive: true });
      const prefix = options.transcriptPrefix ?? 'transcript';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      stdoutTranscriptPath = join(options.transcriptDir, `${prefix}-stdout-${timestamp}.log`);
      stderrTranscriptPath = join(options.transcriptDir, `${prefix}-stderr-${timestamp}.log`);

      stdoutStream = createWriteStream(stdoutTranscriptPath);
      stderrStream = createWriteStream(stderrTranscriptPath);
    }

    return new Promise((resolve, reject) => {
      // Merge environment
      const env = options.env ? { ...process.env, ...options.env } : process.env;

      // Spawn the process (shell: false for security)
      const child = spawn(command, options.args, {
        cwd: options.cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      // Track the process
      const processId = ++this.processIdCounter;
      this.runningProcesses.set(processId, child);

      // Result state
      let interrupted = false;
      let signal: string | undefined;

      // Handle stdout
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          const str = data.toString();
          stdoutTail.append(str);
          if (stdoutStream) {
            stdoutStream.write(data);
          }
          if (options.onStdout) {
            options.onStdout(str);
          }
        });
      }

      // Handle stderr
      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          const str = data.toString();
          stderrTail.append(str);
          if (stderrStream) {
            stderrStream.write(data);
          }
          if (options.onStderr) {
            options.onStderr(str);
          }
        });
      }

      // Handle process completion
      child.on('close', (code, sig) => {
        // Remove from running processes
        this.runningProcesses.delete(processId);

        // Close streams
        if (stdoutStream) {
          stdoutStream.end();
        }
        if (stderrStream) {
          stderrStream.end();
        }

        // Determine if interrupted
        if (sig) {
          interrupted = true;
          signal = sig;
        }

        const durationMs = Date.now() - startTime;

        resolve({
          exitCode: code ?? (interrupted ? 130 : 1),
          durationMs,
          stdoutTail: stdoutTail.getLines(),
          stderrTail: stderrTail.getLines(),
          stdoutTranscriptPath,
          stderrTranscriptPath,
          interrupted,
          signal,
        });
      });

      // Handle spawn errors
      child.on('error', (error) => {
        // Remove from running processes
        this.runningProcesses.delete(processId);

        // Close streams
        if (stdoutStream) {
          stdoutStream.end();
        }
        if (stderrStream) {
          stderrStream.end();
        }

        reject(error);
      });
    });
  }

  killAll(signal: NodeJS.Signals = 'SIGTERM'): void {
    for (const [, child] of this.runningProcesses) {
      child.kill(signal);
    }
    this.runningProcesses.clear();
  }
}

/**
 * Create a real process runner instance
 */
export function createRealProcessRunner(): ProcessRunner {
  return new RealProcessRunner();
}

/**
 * Integration tests for Engine Adapters
 * Tests the engine adapters with mock ProcessRunner
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CursorAdapter, createCursorAdapter } from './cursor-adapter';
import { ClaudeAdapter, createClaudeAdapter } from './claude-adapter';
import { CodexAdapter, createCodexAdapter } from './codex-adapter';
import { CopilotAdapter, createCopilotAdapter } from './copilot-adapter';
import {
  MockProcessRunner,
  createMockProcessRunner,
  createSuccessfulMockRunner,
  createFailingMockRunner,
  createTimeoutMockRunner,
} from './mock-process-runner';
import { EngineExecutionOptions } from '../types/engine-result';
import { SpawnOptions } from '../types/process-runner';

/**
 * Create standard execution options for testing
 */
function createTestExecutionOptions(overrides?: Partial<EngineExecutionOptions>): EngineExecutionOptions {
  return {
    userMessage: 'Test prompt: do something',
    mode: 'execute',
    cwd: '/test/working/dir', // cwd is required
    ...overrides,
  };
}

describe('Engine Adapters', () => {
  describe('CursorAdapter', () => {
    let processRunner: MockProcessRunner;
    let adapter: CursorAdapter;

    beforeEach(() => {
      processRunner = createSuccessfulMockRunner(['Output line 1', 'Output line 2']);
      adapter = createCursorAdapter({
        processRunner,
        defaultRetries: 0, // Disable retries for testing
      });
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('cursor');
    });

    it('should execute with correct command and args', async () => {
      const options = createTestExecutionOptions();
      await adapter.execute(options);

      const calls = processRunner.getCallHistory();
      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('cursor-agent');
      expect(calls[0].options.args).toContain('-p');
      expect(calls[0].options.args).toContain('Test prompt: do something');
      expect(calls[0].options.args).toContain('--force');
    });

    it('should include model flag when model is specified', async () => {
      const options = createTestExecutionOptions({ model: 'gpt-4' });
      await adapter.execute(options);

      const calls = processRunner.getCallHistory();
      expect(calls[0].options.args).toContain('--model');
      expect(calls[0].options.args).toContain('gpt-4');
    });

    it('should return EngineResult with correct structure', async () => {
      const options = createTestExecutionOptions();
      const result = await adapter.execute(options);

      expect(result).toHaveProperty('exitCode', 0);
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('stdoutTail');
      expect(result).toHaveProperty('stderrTail');
      expect(result).toHaveProperty('timedOut', false);
      expect(result).toHaveProperty('interrupted', false);
      expect(result).toHaveProperty('invocation');
      expect(result.invocation.command).toBe('cursor-agent');
    });

    it('should use custom executable path', async () => {
      adapter = createCursorAdapter({
        processRunner,
        executablePath: '/custom/path/cursor-agent',
        defaultRetries: 0,
      });

      await adapter.execute(createTestExecutionOptions());

      const calls = processRunner.getCallHistory();
      expect(calls[0].command).toBe('/custom/path/cursor-agent');
    });

    it('should check availability', async () => {
      processRunner.setCommandConfig('cursor-agent', { exitCode: 0 });
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('should detect unavailable engine', async () => {
      processRunner.setCommandConfig('cursor-agent', { exitCode: 127 });
      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('ClaudeAdapter', () => {
    let processRunner: MockProcessRunner;
    let adapter: ClaudeAdapter;

    beforeEach(() => {
      processRunner = createSuccessfulMockRunner(['Claude response']);
      adapter = createClaudeAdapter({
        processRunner,
        defaultRetries: 0,
      });
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('claude');
    });

    it('should execute with correct command and args', async () => {
      const options = createTestExecutionOptions();
      await adapter.execute(options);

      const calls = processRunner.getCallHistory();
      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('claude');
      expect(calls[0].options.args).toContain('-p');
      expect(calls[0].options.args).toContain('Test prompt: do something');
      expect(calls[0].options.args).toContain('--dangerously-skip-permissions');
    });

    it('should include model flag when model is specified', async () => {
      const options = createTestExecutionOptions({ model: 'claude-3-opus' });
      await adapter.execute(options);

      const calls = processRunner.getCallHistory();
      expect(calls[0].options.args).toContain('--model');
      expect(calls[0].options.args).toContain('claude-3-opus');
    });
  });

  describe('CodexAdapter', () => {
    let processRunner: MockProcessRunner;
    let adapter: CodexAdapter;

    beforeEach(() => {
      processRunner = createSuccessfulMockRunner(['Codex response']);
      adapter = createCodexAdapter({
        processRunner,
        defaultRetries: 0,
      });
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('codex');
    });

    it('should execute with correct command and args', async () => {
      const options = createTestExecutionOptions();
      await adapter.execute(options);

      const calls = processRunner.getCallHistory();
      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('codex');
      expect(calls[0].options.args).toContain('exec');
      expect(calls[0].options.args).toContain('--dangerously-bypass-approvals-and-sandbox');
      expect(calls[0].options.args).toContain('Test prompt: do something');
    });

    it('should include model flag when model is specified', async () => {
      const options = createTestExecutionOptions({ model: 'o1-mini' });
      await adapter.execute(options);

      const calls = processRunner.getCallHistory();
      expect(calls[0].options.args).toContain('--model');
      expect(calls[0].options.args).toContain('o1-mini');
    });
  });

  describe('CopilotAdapter', () => {
    let processRunner: MockProcessRunner;
    let adapter: CopilotAdapter;

    beforeEach(() => {
      processRunner = createSuccessfulMockRunner(['Copilot response']);
      adapter = createCopilotAdapter({
        processRunner,
        defaultRetries: 0,
      });
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('copilot');
    });

    it('should execute with correct command and args', async () => {
      const options = createTestExecutionOptions();
      await adapter.execute(options);

      const calls = processRunner.getCallHistory();
      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('copilot');
      expect(calls[0].options.args).toContain('-p');
      expect(calls[0].options.args).toContain('--yolo');
      expect(calls[0].options.args).toContain('Test prompt: do something');
    });
  });

  describe('Error handling', () => {
    let processRunner: MockProcessRunner;
    let adapter: CursorAdapter;

    beforeEach(() => {
      processRunner = createFailingMockRunner(1, ['Error message']);
      adapter = createCursorAdapter({
        processRunner,
        defaultRetries: 0,
      });
    });

    it('should return non-zero exit code on failure', async () => {
      const result = await adapter.execute(createTestExecutionOptions());
      expect(result.exitCode).toBe(1);
      expect(result.stderrTail).toContain('Error message');
    });

    it('should handle timeout', async () => {
      processRunner = createTimeoutMockRunner();
      adapter = createCursorAdapter({
        processRunner,
        defaultRetries: 0,
      });

      const result = await adapter.execute(createTestExecutionOptions());
      expect(result.timedOut).toBe(true);
    });

    it('should throw on spawn failure', async () => {
      processRunner = createMockProcessRunner({ throwError: new Error('Spawn failed') });
      adapter = createCursorAdapter({
        processRunner,
        defaultRetries: 0,
      });

      await expect(adapter.execute(createTestExecutionOptions())).rejects.toThrow('Spawn failed');
    });
  });

  describe('Retry behavior', () => {
    let processRunner: MockProcessRunner;
    let adapter: CursorAdapter;
    let callCount: number;

    beforeEach(() => {
      callCount = 0;
      processRunner = createMockProcessRunner({});

      // Make spawn return failure on first call, success on second
      processRunner.spawn = async (_command: string, _options: SpawnOptions) => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          return {
            exitCode: 1,
            durationMs: 100,
            stdoutTail: [],
            stderrTail: ['First attempt failed'],
            timedOut: false,
            interrupted: false,
          };
        }
        // Subsequent calls succeed
        return {
          exitCode: 0,
          durationMs: 100,
          stdoutTail: ['Success'],
          stderrTail: [],
          timedOut: false,
          interrupted: false,
        };
      };

      adapter = createCursorAdapter({
        processRunner,
        defaultRetries: 2,
        retryDelayMs: 10, // Short delay for testing
      });
    });

    it('should retry on failure and eventually succeed', async () => {
      const result = await adapter.execute(createTestExecutionOptions());

      expect(callCount).toBe(2);
      expect(result.exitCode).toBe(0);
      expect(result.stdoutTail).toContain('Success');
    });
  });

  describe('Transcript handling', () => {
    let processRunner: MockProcessRunner;
    let adapter: CursorAdapter;

    beforeEach(() => {
      processRunner = createSuccessfulMockRunner(['Transcript output']);
      adapter = createCursorAdapter({
        processRunner,
        defaultRetries: 0,
      });
    });

    it('should pass transcript options to process runner', async () => {
      const options = createTestExecutionOptions({
        transcriptDir: '/tmp/transcripts',
      });

      await adapter.execute(options);

      const calls = processRunner.getCallHistory();
      expect(calls[0].options.transcriptDir).toBe('/tmp/transcripts');
      expect(calls[0].options.captureTranscripts).toBe(true);
      expect(calls[0].options.transcriptPrefix).toBe('cursor-execute');
    });

    it('should not capture transcripts when transcriptDir is not set', async () => {
      const options = createTestExecutionOptions();

      await adapter.execute(options);

      const calls = processRunner.getCallHistory();
      expect(calls[0].options.captureTranscripts).toBe(false);
    });
  });

  describe('Working directory', () => {
    let processRunner: MockProcessRunner;

    beforeEach(() => {
      processRunner = createSuccessfulMockRunner();
    });

    it('should use custom working directory from options', async () => {
      const adapter = createCursorAdapter({
        processRunner,
        defaultRetries: 0,
      });

      await adapter.execute(createTestExecutionOptions({ cwd: '/custom/dir' }));

      const calls = processRunner.getCallHistory();
      expect(calls[0].options.cwd).toBe('/custom/dir');
    });

    it('should use execution options cwd over adapter workingDirectory', async () => {
      const adapter = createCursorAdapter({
        processRunner,
        workingDirectory: '/adapter/default/dir', // This would be the fallback
        defaultRetries: 0,
      });

      // Since cwd is required in EngineExecutionOptions, it always takes precedence
      await adapter.execute(createTestExecutionOptions({ cwd: '/options/override/dir' }));

      const calls = processRunner.getCallHistory();
      expect(calls[0].options.cwd).toBe('/options/override/dir');
    });
  });

  describe('Version detection', () => {
    let processRunner: MockProcessRunner;

    beforeEach(() => {
      processRunner = createMockProcessRunner({
        exitCode: 0,
        stdoutLines: ['1.2.3'],
      });
    });

    it('should return version when available', async () => {
      const adapter = createCursorAdapter({ processRunner });
      const version = await adapter.getVersion();
      expect(version).toBe('1.2.3');
    });

    it('should return undefined when version check fails', async () => {
      processRunner.setCommandConfig('cursor-agent', { exitCode: 1 });
      const adapter = createCursorAdapter({ processRunner });
      const version = await adapter.getVersion();
      expect(version).toBeUndefined();
    });
  });

  describe('Factory functions', () => {
    let processRunner: MockProcessRunner;

    beforeEach(() => {
      processRunner = createSuccessfulMockRunner();
    });

    it('should create CursorAdapter with factory function', () => {
      const adapter = createCursorAdapter({ processRunner });
      expect(adapter).toBeInstanceOf(CursorAdapter);
      expect(adapter.name).toBe('cursor');
    });

    it('should create ClaudeAdapter with factory function', () => {
      const adapter = createClaudeAdapter({ processRunner });
      expect(adapter).toBeInstanceOf(ClaudeAdapter);
      expect(adapter.name).toBe('claude');
    });

    it('should create CodexAdapter with factory function', () => {
      const adapter = createCodexAdapter({ processRunner });
      expect(adapter).toBeInstanceOf(CodexAdapter);
      expect(adapter.name).toBe('codex');
    });

    it('should create CopilotAdapter with factory function', () => {
      const adapter = createCopilotAdapter({ processRunner });
      expect(adapter).toBeInstanceOf(CopilotAdapter);
      expect(adapter.name).toBe('copilot');
    });
  });
});

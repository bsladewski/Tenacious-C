/**
 * Tests for execute-with-fallback.ts
 * Covers both legacy CLI tool interface and new engine adapter functions
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import {
  getEngineAdapter,
  contextToEngineOptions,
  executeWithEngineAdapter,
  isEngineAdapterAvailable,
  getEngineAdapterVersion,
  createMutableToolConfig,
  updatePhaseAfterFallback,
  ExecuteWithFallbackResult,
} from './execute-with-fallback';
import { ExecutionContext } from '../types';
import {
  validateExecutionArtifacts,
  validatePlanArtifacts,
  validateGapAuditArtifacts,
} from '../io';

// Mock the validation functions from ../io
vi.mock('../io', async () => {
  const actual = await vi.importActual('../io');
  return {
    ...actual,
    validateExecutionArtifacts: vi.fn(),
    validatePlanArtifacts: vi.fn(),
    validateGapAuditArtifacts: vi.fn(),
  };
});

describe('execute-with-fallback', () => {
  describe('getEngineAdapter', () => {
    it('should create a cursor adapter', () => {
      const adapter = getEngineAdapter('cursor');
      expect(adapter.name).toBe('cursor');
    });

    it('should create a claude adapter', () => {
      const adapter = getEngineAdapter('claude');
      expect(adapter.name).toBe('claude');
    });

    it('should create a codex adapter', () => {
      const adapter = getEngineAdapter('codex');
      expect(adapter.name).toBe('codex');
    });

    it('should create a copilot adapter', () => {
      const adapter = getEngineAdapter('copilot');
      expect(adapter.name).toBe('copilot');
    });

    it('should create a mock adapter', () => {
      const adapter = getEngineAdapter('mock');
      expect(adapter.name).toBe('mock');
    });
  });

  describe('contextToEngineOptions', () => {
    it('should convert plan-generation context to plan mode', () => {
      const context: ExecutionContext = {
        phase: 'plan-generation',
        outputDirectory: '/tmp/test',
      };
      const options = contextToEngineOptions('test prompt', 'gpt-4', context);

      expect(options.mode).toBe('plan');
      expect(options.userMessage).toBe('test prompt');
      expect(options.model).toBe('gpt-4');
      expect(options.cwd).toBe('/tmp/test');
      expect(options.transcriptDir).toBe('/tmp/test');
    });

    it('should convert execute-plan context to execute mode', () => {
      const context: ExecutionContext = {
        phase: 'execute-plan',
        outputDirectory: '/tmp/execute',
        executionIteration: 1,
      };
      const options = contextToEngineOptions('execute this', null, context);

      expect(options.mode).toBe('execute');
      expect(options.userMessage).toBe('execute this');
      expect(options.model).toBeUndefined();
    });

    it('should convert gap-audit context to audit mode', () => {
      const context: ExecutionContext = {
        phase: 'gap-audit',
        outputDirectory: '/tmp/audit',
        gapAuditIteration: 2,
      };
      const options = contextToEngineOptions('audit prompt', 'claude-3', context);

      expect(options.mode).toBe('audit');
    });

    it('should convert improve-plan context to plan mode', () => {
      const context: ExecutionContext = {
        phase: 'improve-plan',
        outputDirectory: '/tmp/improve',
        improvePlanIteration: 1,
      };
      const options = contextToEngineOptions('improve', null, context);

      expect(options.mode).toBe('plan');
    });

    it('should use process.cwd when no context provided', () => {
      const options = contextToEngineOptions('prompt', null);

      expect(options.mode).toBe('plan');
      expect(options.cwd).toBe(process.cwd());
      expect(options.transcriptDir).toBeUndefined();
    });
  });

  describe('executeWithEngineAdapter', () => {
    // Mock the console.log to suppress output during tests
    const originalLog = console.log;

    beforeEach(() => {
      console.log = vi.fn();
    });

    afterEach(() => {
      console.log = originalLog;
    });

    it('should successfully execute with mock adapter', async () => {
      const result = await executeWithEngineAdapter(
        'mock',
        'test prompt',
        null,
        [],
        {
          phase: 'plan-generation',
          outputDirectory: '/tmp/test',
        }
      );

      expect(result.success).toBe(true);
      expect(result.usedTool).toBe('mock');
      expect(result.fallbackOccurred).toBe(false);
      expect(result.usedModel).toBeNull();
      expect(result.remainingFallbackTools).toEqual([]);
    });

    it('should preserve model when no fallback occurs', async () => {
      const result = await executeWithEngineAdapter(
        'mock',
        'test prompt',
        'test-model',
        ['cursor', 'claude'],
        {
          phase: 'execute-plan',
          outputDirectory: '/tmp/test',
        }
      );

      expect(result.success).toBe(true);
      expect(result.usedModel).toBe('test-model');
      expect(result.fallbackOccurred).toBe(false);
      expect(result.remainingFallbackTools).toEqual(['cursor', 'claude']);
    });
  });

  describe('isEngineAdapterAvailable', () => {
    it('should return true for mock adapter', async () => {
      const available = await isEngineAdapterAvailable('mock');
      expect(available).toBe(true);
    });
  });

  describe('getEngineAdapterVersion', () => {
    it('should return version for mock adapter', async () => {
      const version = await getEngineAdapterVersion('mock');
      expect(version).toBe('mock-1.0.0');
    });
  });

  describe('createMutableToolConfig', () => {
    it('should create config with action-specific tools', () => {
      const config = createMutableToolConfig(
        'cursor',  // default
        'claude',  // plan
        'codex',   // execute
        'copilot', // audit
        'model-plan',
        'model-execute',
        'model-audit',
        ['cursor', 'claude']
      );

      expect(config.plan.tool).toBe('claude');
      expect(config.plan.model).toBe('model-plan');
      expect(config.execute.tool).toBe('codex');
      expect(config.execute.model).toBe('model-execute');
      expect(config.audit.tool).toBe('copilot');
      expect(config.audit.model).toBe('model-audit');
      expect(config.fallbackTools).toEqual(['cursor', 'claude']);
    });

    it('should use default tool when action-specific not provided', () => {
      const config = createMutableToolConfig(
        'cursor',
        null,
        null,
        null,
        null,
        null,
        null,
        []
      );

      expect(config.plan.tool).toBe('cursor');
      expect(config.execute.tool).toBe('cursor');
      expect(config.audit.tool).toBe('cursor');
    });
  });

  describe('updatePhaseAfterFallback', () => {
    it('should update config when fallback occurred', () => {
      const config = createMutableToolConfig(
        'cursor',
        'cursor',
        'cursor',
        'cursor',
        'model-1',
        'model-2',
        'model-3',
        ['claude', 'codex']
      );

      const result: ExecuteWithFallbackResult = {
        success: true,
        usedTool: 'claude',
        fallbackOccurred: true,
        usedModel: null,
        remainingFallbackTools: ['codex'],
      };

      updatePhaseAfterFallback(config, 'plan', result);

      expect(config.plan.tool).toBe('claude');
      expect(config.plan.model).toBeNull();
      expect(config.fallbackTools).toEqual(['codex']);
    });

    it('should not update config when no fallback occurred', () => {
      const config = createMutableToolConfig(
        'cursor',
        'cursor',
        'cursor',
        'cursor',
        'model-1',
        'model-2',
        'model-3',
        ['claude', 'codex']
      );

      const result: ExecuteWithFallbackResult = {
        success: true,
        usedTool: 'cursor',
        fallbackOccurred: false,
        usedModel: 'model-1',
        remainingFallbackTools: ['claude', 'codex'],
      };

      updatePhaseAfterFallback(config, 'plan', result);

      expect(config.plan.tool).toBe('cursor');
      expect(config.plan.model).toBe('model-1');
      expect(config.fallbackTools).toEqual(['claude', 'codex']);
    });
  });

  describe('artifact validation integration', () => {
    // Mock console.log to suppress output and verify messages
    const originalLog = console.log;

    beforeEach(() => {
      console.log = vi.fn();
      vi.resetAllMocks();
      // Use fake timers to avoid waiting for real 10-second retry delays
      vi.useFakeTimers();
    });

    afterEach(() => {
      console.log = originalLog;
      // Restore real timers
      vi.useRealTimers();
    });

    /**
     * Helper to execute an async operation while advancing fake timers.
     * This allows tests to complete quickly without waiting for real delays.
     */
    async function executeWithFakeTimers<T>(promise: Promise<T>): Promise<T> {
      // Track the result/error from the promise
      let result: T | undefined;
      let error: Error | undefined;
      let settled = false;

      promise
        .then((r) => { result = r; settled = true; })
        .catch((e) => { error = e; settled = true; });
      
      // Keep advancing timers until the promise settles
      while (!settled) {
        // Advance timers by a small amount to process pending timeouts
        await vi.advanceTimersByTimeAsync(100);
        // Yield to allow promise microtasks to execute
        await Promise.resolve();
      }
      
      // Rethrow error or return result
      if (error) {
        throw error;
      }
      return result as T;
    }

    describe('Test Case 1: Validation failure when execution succeeds but summary file is missing', () => {
      it('should throw an error when summary file is missing', async () => {
        // Setup: Mock validation to return missing summary file
        (validateExecutionArtifacts as Mock).mockReturnValue({
          valid: false,
          missing: ['execution-summary-1.md'],
          errors: [],
        });

        const context: ExecutionContext = {
          phase: 'execute-plan',
          outputDirectory: '/tmp/test-execute',
          executionIteration: 1,
        };

        // Execute and verify error is thrown (using fake timers to avoid real delays)
        let caughtError: Error | null = null;
        try {
          await executeWithFakeTimers(executeWithEngineAdapter('mock', 'test prompt', null, [], context));
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toContain('Artifact validation failed');
        expect(caughtError!.message).toContain('execution-summary-1.md');
        expect(caughtError!.message).toContain('Missing files');
      });
    });

    describe('Test Case 2: Validation failure when metadata file has invalid JSON', () => {
      it('should throw an error with validation error details', async () => {
        // Setup: Mock validation to return validation errors
        (validateExecutionArtifacts as Mock).mockReturnValue({
          valid: false,
          missing: [],
          errors: ['Invalid execute-metadata.json: missing required field schemaVersion'],
        });

        const context: ExecutionContext = {
          phase: 'execute-plan',
          outputDirectory: '/tmp/test-execute',
          executionIteration: 1,
        };

        // Execute and verify error is thrown (using fake timers to avoid real delays)
        let caughtError: Error | null = null;
        try {
          await executeWithFakeTimers(executeWithEngineAdapter('mock', 'test prompt', null, [], context));
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toContain('Artifact validation failed');
        expect(caughtError!.message).toContain('Validation errors');
        expect(caughtError!.message).toContain('missing required field schemaVersion');
      });
    });

    describe('Test Case 3: Fallback is triggered when validation fails on primary adapter', () => {
      it('should succeed when validation fails initially but succeeds on retry', async () => {
        // Setup: Mock validation to fail on first call, succeed on subsequent calls (retry)
        // With maxRetries=2, there are 3 total attempts - validation succeeds on retry
        
        let validationCallCount = 0;
        (validateExecutionArtifacts as Mock).mockImplementation(() => {
          validationCallCount++;
          if (validationCallCount === 1) {
            // First call (attempt 0) - fail validation
            return {
              valid: false,
              missing: ['execution-summary-1.md'],
              errors: [],
            };
          }
          // Subsequent calls (retries) - succeed
          return {
            valid: true,
            missing: [],
            errors: [],
          };
        });

        const context: ExecutionContext = {
          phase: 'execute-plan',
          outputDirectory: '/tmp/test-execute',
          executionIteration: 1,
        };

        // With retry logic, validation failure on first attempt triggers retry
        // Second attempt succeeds, so the result should be success
        const result = await executeWithFakeTimers(executeWithEngineAdapter(
          'mock',
          'test prompt',
          null,
          ['mock'], // Fallbacks won't be used since retry succeeds
          context
        ));

        // Verify success after retry
        expect(result.success).toBe(true);
        expect(result.fallbackOccurred).toBe(false); // Retry succeeded, no fallback needed
        // Validation called twice: once for initial attempt (fail), once for retry (success)
        expect(validationCallCount).toBe(2);
      });

      it('should fail after exhausting all retries when validation always fails', async () => {
        // This test verifies that when validation always fails, retries are exhausted
        // With maxRetries=2, there are 3 total attempts
        
        let validationCallCount = 0;
        (validateExecutionArtifacts as Mock).mockImplementation(() => {
          validationCallCount++;
          // Always fail - testing retry exhaustion
          return {
            valid: false,
            missing: ['execution-summary-1.md'],
            errors: [],
          };
        });

        const context: ExecutionContext = {
          phase: 'execute-plan',
          outputDirectory: '/tmp/test-execute',
          executionIteration: 1,
        };

        // No fallbacks means error is thrown after primary exhausts retries
        let caughtError: Error | null = null;
        try {
          await executeWithFakeTimers(executeWithEngineAdapter('mock', 'test prompt', null, [], context));
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toContain('Artifact validation failed');
        // With maxRetries=2, there are 3 total attempts (0, 1, 2)
        expect(validationCallCount).toBe(3);
      });
    });

    describe('Test Case 4: Error messages contain actionable guidance with file paths', () => {
      it('should include both missing file names in error message', async () => {
        // Setup: Mock validation to return detailed error with multiple missing files
        (validateExecutionArtifacts as Mock).mockReturnValue({
          valid: false,
          missing: ['execution-summary-1.md', 'execute-metadata.json'],
          errors: [],
        });

        const context: ExecutionContext = {
          phase: 'execute-plan',
          outputDirectory: '/tmp/test-execute',
          executionIteration: 1,
        };

        // Execute and catch the error (using fake timers)
        let caughtError: Error | null = null;
        try {
          await executeWithFakeTimers(executeWithEngineAdapter('mock', 'test prompt', null, [], context));
        } catch (error) {
          caughtError = error as Error;
        }

        // Verify error message includes both missing file names
        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toContain('execution-summary-1.md');
        expect(caughtError!.message).toContain('execute-metadata.json');
        expect(caughtError!.message).toMatch(/Missing files:.*execution-summary-1\.md.*execute-metadata\.json/);
      });
    });

    describe('Test Case 5: Validation passes for plan-generation phase with valid artifacts', () => {
      it('should succeed when plan artifacts are valid', async () => {
        // Setup: Mock plan validation to return success
        (validatePlanArtifacts as Mock).mockReturnValue({
          valid: true,
          missing: [],
          errors: [],
        });

        const context: ExecutionContext = {
          phase: 'plan-generation',
          outputDirectory: '/tmp/test-plan',
        };

        // Execute (using fake timers since we're in the fake timer describe block)
        const result = await executeWithFakeTimers(executeWithEngineAdapter(
          'mock',
          'test prompt',
          null,
          [],
          context
        ));

        // Verify success without error
        expect(result.success).toBe(true);
        expect(result.fallbackOccurred).toBe(false);
      });
    });

    describe('Test Case 6: Validation failure for gap-audit phase when metadata is missing', () => {
      it('should throw an error when gap-audit-metadata.json is missing', async () => {
        // Setup: Mock gap audit validation to return missing metadata
        (validateGapAuditArtifacts as Mock).mockReturnValue({
          valid: false,
          missing: ['gap-audit-metadata.json'],
          errors: [],
        });

        const context: ExecutionContext = {
          phase: 'gap-audit',
          outputDirectory: '/tmp/test-gap-audit',
          executionIteration: 1,
        };

        // Execute and verify error is thrown (using fake timers)
        let caughtError: Error | null = null;
        try {
          await executeWithFakeTimers(executeWithEngineAdapter('mock', 'test prompt', null, [], context));
        } catch (error) {
          caughtError = error as Error;
        }

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).toContain('Artifact validation failed');
        expect(caughtError!.message).toContain('gap-audit-metadata.json');
      });
    });
  });
});

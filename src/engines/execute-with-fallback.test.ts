/**
 * Tests for execute-with-fallback.ts
 * Covers both legacy CLI tool interface and new engine adapter functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
});

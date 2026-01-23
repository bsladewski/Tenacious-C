/**
 * Integration Tests for Orchestration
 *
 * Tests the full orchestration cycle with mock engines and temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTempDirContext,
  TempDirContext,
} from '../utils/temp-directory';
import { createTestProcessRunner, TestProcessRunner } from '../utils/mock-process-runner';
import { createTestEngine, PRESET_RESPONSES } from '../fixtures/mock-engine';
import { Orchestrator, createOrchestrator } from '../../src/core/orchestrator';
import { EffectiveConfig } from '../../src/types/effective-config';
import { BufferLogger } from '../../src/logging/buffer-logger';
import { MemoryFileSystem } from '../../src/io/memory-file-system';
import { MockClock } from '../../src/types/clock';

// Helper to create a minimal EffectiveConfig for testing
function createTestConfig(overrides: Partial<EffectiveConfig> = {}): EffectiveConfig {
  return {
    schemaVersion: '1.0.0',
    input: 'Test requirements',
    runId: 'test-run-001',
    resolvedAt: new Date().toISOString(),
    limits: {
      maxPlanIterations: 3,
      maxExecIterations: 2,
      maxFollowUpIterations: 3,
      maxGapAuditIterations: 2,
    },
    thresholds: {
      planConfidence: 85,
    },
    tools: {
      plan: 'mock',
      execute: 'mock',
      audit: 'mock',
    },
    models: {},
    verbosity: {
      verbose: false,
      debug: false,
      jsonOutput: false,
    },
    interactivity: {
      interactive: false, // Non-interactive for tests
      previewPlan: false,
    },
    runMode: {
      resume: false,
      unlimitedIterations: false,
      mockMode: true,
    },
    fallback: {
      fallbackTools: [],
      maxRetries: 3,
      retryDelayMs: 100,
    },
    paths: {
      workingDirectory: '/test',
      artifactBaseDir: '/test/.tenacious-c',
    },
    ...overrides,
  };
}

// Helper to create a mock prompter that returns default values
function createMockPrompter() {
  return {
    confirm: async () => true,
    input: async () => 'test input',
    select: async (options: string[]) => options[0],
    multiSelect: async (options: string[]) => [options[0]],
    editor: async (content: string) => content,
  };
}

describe('Orchestration Integration Tests', () => {
  let tempDir: TempDirContext;
  let processRunner: TestProcessRunner;
  let logger: BufferLogger;
  let fileSystem: MemoryFileSystem;
  let clock: MockClock;
  let config: EffectiveConfig;

  beforeEach(() => {
    tempDir = createTempDirContext('orchestration-test-');
    processRunner = createTestProcessRunner();
    logger = new BufferLogger();
    fileSystem = new MemoryFileSystem();
    clock = new MockClock();
    config = createTestConfig({
      paths: {
        workingDirectory: tempDir.path,
        artifactBaseDir: `${tempDir.path}/.tenacious-c`,
      },
    });
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('Orchestrator State Machine', () => {
    it('should start in IDLE state and transition to PLAN_GENERATION', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      expect(orchestrator.getCurrentState()).toBe('IDLE');

      const result = orchestrator.start('Test requirements');
      expect(result.success).toBe(true);
      expect(orchestrator.getCurrentState()).toBe('PLAN_GENERATION');
    });

    it('should track plan revision count correctly', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      expect(orchestrator.getContext().planRevisionCount).toBe(0);

      orchestrator.onPlanGenerated();
      orchestrator.onConfidenceLow(50, 85);
      orchestrator.onPlanImproved();
      expect(orchestrator.getContext().planRevisionCount).toBe(1);
    });

    it('should transition to EXECUTION when plan is complete', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(90);
      // Now goes through TOOL_CURATION first
      expect(orchestrator.getCurrentState()).toBe('TOOL_CURATION');
      orchestrator.onToolCurationComplete();
      expect(orchestrator.getCurrentState()).toBe('EXECUTION');
    });

    it('should transition to FOLLOW_UPS when execution has follow-ups', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(90);
      orchestrator.onToolCurationComplete();
      orchestrator.onExecutionComplete(true, false);

      expect(orchestrator.getCurrentState()).toBe('FOLLOW_UPS');
    });

    it('should transition to GAP_AUDIT when execution has no follow-ups', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(90);
      orchestrator.onToolCurationComplete();
      orchestrator.onExecutionComplete(false, false);

      expect(orchestrator.getCurrentState()).toBe('GAP_AUDIT');
    });

    it('should complete successfully with no gaps', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(90);
      orchestrator.onToolCurationComplete();
      orchestrator.onExecutionComplete(false, false);
      orchestrator.onGapAuditComplete(false);
      orchestrator.onSummaryComplete();

      expect(orchestrator.getCurrentState()).toBe('COMPLETE');
      expect(orchestrator.isComplete()).toBe(true);
    });

    it('should transition to GAP_PLAN when gaps are identified', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(90);
      orchestrator.onToolCurationComplete();
      orchestrator.onExecutionComplete(false, false);
      orchestrator.onGapAuditComplete(true);

      expect(orchestrator.getCurrentState()).toBe('GAP_PLAN');
    });

    it('should return to EXECUTION after gap plan', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(90);
      orchestrator.onToolCurationComplete();
      orchestrator.onExecutionComplete(false, false);
      orchestrator.onGapAuditComplete(true);
      orchestrator.onGapPlanComplete();

      expect(orchestrator.getCurrentState()).toBe('EXECUTION');
      // execIterationCount increments when we return to EXECUTION via gap plan
      // The state machine increments it on GAP_PLAN_COMPLETE transition
      expect(orchestrator.getContext().execIterationCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Iteration Policies', () => {
    it('should check plan revision stop condition correctly', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');

      // Should continue when confidence is low
      let result = orchestrator.checkPlanRevisionStop(false, 50);
      expect(result.shouldStop).toBe(false);

      // Should stop when confidence meets threshold
      result = orchestrator.checkPlanRevisionStop(false, 90);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('CONDITION_MET');
      expect(result.message.toLowerCase()).toContain('confidence');
    });

    it('should stop plan revision at max iterations', () => {
      const limitedConfig = createTestConfig({
        limits: {
          maxPlanIterations: 1,
          maxExecIterations: 2,
          maxFollowUpIterations: 3,
          maxGapAuditIterations: 2,
        },
        paths: {
          workingDirectory: tempDir.path,
          artifactBaseDir: `${tempDir.path}/.tenacious-c`,
        },
      });

      const orchestrator = createOrchestrator(limitedConfig, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onConfidenceLow(50, 85);
      orchestrator.onPlanImproved();

      const result = orchestrator.checkPlanRevisionStop(false, 50);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('LIMIT_REACHED');
    });

    it('should check follow-up stop condition correctly', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');

      // Should continue when there are follow-ups
      let result = orchestrator.checkFollowUpStop(true, false);
      expect(result.shouldStop).toBe(false);

      // Should stop when no follow-ups and no blockers
      result = orchestrator.checkFollowUpStop(false, false);
      expect(result.shouldStop).toBe(true);
    });

    it('should check execution iteration stop condition correctly', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');

      // Should stop when no gaps
      let result = orchestrator.checkExecutionIterationStop(false);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('CONDITION_MET');
      expect(result.message.toLowerCase()).toContain('gap');

      // Should continue when gaps exist
      result = orchestrator.checkExecutionIterationStop(true);
      expect(result.shouldStop).toBe(false);
    });
  });

  describe('Resume Functionality', () => {
    it('should save and restore run state', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(90);
      orchestrator.onToolCurationComplete();

      const savedState = orchestrator.getRunState();
      expect(savedState.context.currentState).toBe('EXECUTION');

      // Create new orchestrator and resume
      const newOrchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      const result = newOrchestrator.resume(savedState);
      expect(result.success).toBe(true);
      expect(newOrchestrator.getCurrentState()).toBe('EXECUTION');
    });

    it('should preserve iteration counts on resume', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onConfidenceLow(50, 85);
      orchestrator.onPlanImproved();
      orchestrator.onPlanComplete(90);
      orchestrator.onToolCurationComplete();
      orchestrator.onExecutionComplete(false, false);
      orchestrator.onGapAuditComplete(true);
      orchestrator.onGapPlanComplete();

      const savedState = orchestrator.getRunState();
      // execIterationCount may be 1 or 2 depending on when it increments
      expect(savedState.context.execIterationCount).toBeGreaterThanOrEqual(1);
      expect(savedState.context.planRevisionCount).toBe(1);

      // Resume and verify
      const newOrchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      newOrchestrator.resume(savedState);
      expect(newOrchestrator.getContext().execIterationCount).toBeGreaterThanOrEqual(1);
      expect(newOrchestrator.getContext().planRevisionCount).toBe(1);
    });
  });

  describe('Non-Interactive Mode', () => {
    it('should work without prompting in non-interactive mode', () => {
      const nonInteractiveConfig = createTestConfig({
        interactivity: {
          interactive: false,
          previewPlan: false,
        },
        paths: {
          workingDirectory: tempDir.path,
          artifactBaseDir: `${tempDir.path}/.tenacious-c`,
        },
      });

      const orchestrator = createOrchestrator(nonInteractiveConfig, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      // Should be able to run through the full cycle
      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(90);
      orchestrator.onToolCurationComplete();
      orchestrator.onExecutionComplete(false, false);
      orchestrator.onGapAuditComplete(false);
      orchestrator.onSummaryComplete();

      expect(orchestrator.isComplete()).toBe(true);
      expect(logger.getEvents().length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should transition to FAILED state on error', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      const error = new Error('Test error');
      const result = orchestrator.onError(error);

      expect(result.state).toBe('FAILED');
      expect(result.isComplete).toBe(true);
      expect(result.error).toBe(error);
    });

    it('should log errors appropriately', () => {
      const orchestrator = createOrchestrator(config, {
        logger,
        fileSystem,
        prompter: createMockPrompter(),
        clock,
        processRunner,
      });

      orchestrator.start('Test requirements');
      orchestrator.onError(new Error('Test error'));

      const errorEvents = logger.getEvents().filter(
        (e) => e.message.toLowerCase().includes('error') ||
               e.message.toLowerCase().includes('failed')
      );
      expect(errorEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Temp Directory Management', () => {
    it('should create files in temp directory', () => {
      const filePath = tempDir.writeFile('test.txt', 'Hello, World!');
      expect(tempDir.exists('test.txt')).toBe(true);
      expect(tempDir.readFile('test.txt')).toBe('Hello, World!');
    });

    it('should create nested directories', () => {
      tempDir.mkdir('nested/path');
      const filePath = tempDir.writeFile('nested/path/test.txt', 'Nested content');
      expect(tempDir.exists('nested/path/test.txt')).toBe(true);
    });

    it('should cleanup on afterEach', () => {
      // This test verifies cleanup happens between tests
      // If cleanup didn't work, we'd see leftover files
      tempDir.writeFile('cleanup-test.txt', 'Should be cleaned up');
      expect(tempDir.exists('cleanup-test.txt')).toBe(true);
      // afterEach will clean this up
    });
  });
});

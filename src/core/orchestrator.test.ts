/**
 * Integration tests for Orchestrator class
 * Tests the Orchestrator with mock dependencies
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Orchestrator,
  OrchestratorDependencies,
  createOrchestrator,
} from './orchestrator';
import { EffectiveConfig, DEFAULT_CONFIG } from '../types/effective-config';
import { Logger } from '../types/logger';
import { FileSystem, FileStats } from '../types/file-system';
import { Prompter } from '../types/prompter';
import { Clock } from '../types/clock';
import { ProcessRunner, SpawnResult } from '../types/process-runner';
import { ok } from '../types/result';

/**
 * Create a mock Logger for testing
 */
function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
    setContext: vi.fn(),
    clearContext: vi.fn(),
    getEvents: vi.fn(() => []),
    setMinLevel: vi.fn(),
    child: vi.fn(function(this: Logger) { return this; }),
  };
}

/**
 * Create a mock FileSystem for testing
 */
function createMockFileSystem(): FileSystem {
  return {
    readFile: vi.fn().mockResolvedValue(ok('')),
    writeFile: vi.fn().mockResolvedValue(ok(undefined)),
    exists: vi.fn().mockResolvedValue(false),
    stat: vi.fn().mockResolvedValue(ok({ isFile: true, isDirectory: false, size: 0, createdAt: new Date(), modifiedAt: new Date() } as FileStats)),
    mkdir: vi.fn().mockResolvedValue(ok(undefined)),
    remove: vi.fn().mockResolvedValue(ok(undefined)),
    rmdir: vi.fn().mockResolvedValue(ok(undefined)),
    list: vi.fn().mockResolvedValue(ok([])),
    copy: vi.fn().mockResolvedValue(ok(undefined)),
    rename: vi.fn().mockResolvedValue(ok(undefined)),
    resolve: vi.fn((...paths: string[]) => paths.join('/')),
    join: vi.fn((...paths: string[]) => paths.join('/')),
    dirname: vi.fn((path: string) => path.split('/').slice(0, -1).join('/')),
    basename: vi.fn((path: string) => path.split('/').pop() || ''),
    extname: vi.fn((path: string) => {
      const parts = path.split('.');
      return parts.length > 1 ? '.' + parts.pop() : '';
    }),
    isAbsolute: vi.fn((path: string) => path.startsWith('/')),
  };
}

/**
 * Create a mock Prompter for testing
 */
function createMockPrompter(): Prompter {
  return {
    confirm: vi.fn().mockResolvedValue(ok(true)),
    input: vi.fn().mockResolvedValue(ok('test input')),
    select: vi.fn().mockResolvedValue(ok('option1')),
    multiSelect: vi.fn().mockResolvedValue(ok(['option1'])),
    editor: vi.fn().mockResolvedValue(ok('edited text')),
    isInteractive: vi.fn().mockReturnValue(true),
    setNonInteractive: vi.fn(),
  };
}

/**
 * Create a mock Clock for testing
 */
function createMockClock(): Clock {
  const fixedTime = new Date('2025-01-19T12:00:00Z');
  return {
    now: vi.fn().mockReturnValue(fixedTime),
    timestamp: vi.fn().mockReturnValue(fixedTime.getTime()),
    iso: vi.fn().mockReturnValue(fixedTime.toISOString()),
    delay: vi.fn().mockResolvedValue(undefined),
    timeout: vi.fn().mockImplementation((_ms: number, message?: string) => {
      return Promise.reject(new Error(message || 'Timeout'));
    }),
    measure: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => {
      const result = await fn();
      return { result, durationMs: 100 };
    }),
  };
}

/**
 * Create a mock ProcessRunner for testing
 */
function createMockProcessRunner(): ProcessRunner {
  const defaultResult: SpawnResult = {
    exitCode: 0,
    durationMs: 1000,
    stdoutTail: ['Output line 1', 'Output line 2'],
    stderrTail: [],
    interrupted: false,
  };

  return {
    spawn: vi.fn().mockResolvedValue(defaultResult),
    killAll: vi.fn(),
  };
}

/**
 * Create mock dependencies with optional overrides
 */
function createMockDependencies(overrides?: Partial<OrchestratorDependencies>): OrchestratorDependencies {
  return {
    logger: createMockLogger(),
    fileSystem: createMockFileSystem(),
    prompter: createMockPrompter(),
    clock: createMockClock(),
    processRunner: createMockProcessRunner(),
    ...overrides,
  };
}

/**
 * Create test config with optional overrides
 */
function createTestConfig(overrides?: Partial<EffectiveConfig>): EffectiveConfig {
  const base = {
    ...DEFAULT_CONFIG,
    input: 'test input',
    runId: 'test-run-id',
    resolvedAt: new Date().toISOString(),
    paths: {
      workingDirectory: '/test/dir',
      artifactBaseDir: '/test/.tenacious-c',
    },
  };
  return {
    ...base,
    ...overrides,
  };
}

describe('Orchestrator', () => {
  let deps: OrchestratorDependencies;
  let config: EffectiveConfig;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    deps = createMockDependencies();
    config = createTestConfig();
    orchestrator = createOrchestrator(config, deps);
  });

  describe('initialization', () => {
    it('should start in IDLE state', () => {
      expect(orchestrator.getCurrentState()).toBe('IDLE');
    });

    it('should have empty transition history', () => {
      expect(orchestrator.getTransitionHistory()).toHaveLength(0);
    });

    it('should return correct state description for IDLE', () => {
      expect(orchestrator.getStateDescription()).toBe('Waiting to start');
    });

    it('should not be complete initially', () => {
      expect(orchestrator.isComplete()).toBe(false);
    });

    it('should have config available', () => {
      expect(orchestrator.getConfig()).toBe(config);
    });

    it('should have initial counters at zero', () => {
      const context = orchestrator.getContext();
      expect(context.planRevisionCount).toBe(0);
      expect(context.execIterationCount).toBe(0);
      expect(context.followUpIterationCount).toBe(0);
    });
  });

  describe('start()', () => {
    it('should transition to PLAN_GENERATION', () => {
      const result = orchestrator.start('Test requirements');
      expect(result.success).toBe(true);
      expect(result.state).toBe('PLAN_GENERATION');
      expect(result.isComplete).toBe(false);
    });

    it('should log the transition', () => {
      orchestrator.start('Test requirements');
      expect(deps.logger.event).toHaveBeenCalled();
    });

    it('should add to transition history', () => {
      orchestrator.start('Test requirements');
      expect(orchestrator.getTransitionHistory()).toHaveLength(1);
    });
  });

  describe('plan generation flow', () => {
    beforeEach(() => {
      orchestrator.start('Test requirements');
    });

    it('should transition through plan generation', () => {
      // Plan generated -> PLAN_REVISION
      const planGenResult = orchestrator.onPlanGenerated();
      expect(planGenResult.success).toBe(true);
      expect(planGenResult.state).toBe('PLAN_REVISION');
    });

    it('should handle open questions', () => {
      orchestrator.onPlanGenerated();
      const questionsResult = orchestrator.onOpenQuestionsFound(3);
      expect(questionsResult.success).toBe(true);
      // Open questions don't change state, just record the count
      expect(questionsResult.state).toBe('PLAN_REVISION');
    });

    it('should transition to EXECUTION when plan is complete', () => {
      orchestrator.onPlanGenerated();
      const completeResult = orchestrator.onPlanComplete(95);
      expect(completeResult.success).toBe(true);
      expect(completeResult.state).toBe('EXECUTION');
    });

    it('should increment exec iteration on plan complete', () => {
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(95);
      expect(orchestrator.getContext().execIterationCount).toBe(1);
    });
  });

  describe('execution flow', () => {
    beforeEach(() => {
      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(95);
    });

    it('should transition to FOLLOW_UPS when execution has follow-ups', () => {
      const result = orchestrator.onExecutionComplete(true, false);
      expect(result.success).toBe(true);
      expect(result.state).toBe('FOLLOW_UPS');
    });

    it('should transition to FOLLOW_UPS when execution has hard blockers', () => {
      const result = orchestrator.onExecutionComplete(false, true);
      expect(result.success).toBe(true);
      expect(result.state).toBe('FOLLOW_UPS');
    });

    it('should transition to GAP_AUDIT when execution has no follow-ups', () => {
      const result = orchestrator.onExecutionComplete(false, false);
      expect(result.success).toBe(true);
      expect(result.state).toBe('GAP_AUDIT');
    });
  });

  describe('follow-ups flow', () => {
    beforeEach(() => {
      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(95);
      orchestrator.onExecutionComplete(true, false);
    });

    it('should stay in FOLLOW_UPS if more follow-ups exist', () => {
      const result = orchestrator.onFollowUpsComplete(true);
      expect(result.success).toBe(true);
      expect(result.state).toBe('FOLLOW_UPS');
    });

    it('should increment follow-up iteration count', () => {
      const initialCount = orchestrator.getContext().followUpIterationCount;
      orchestrator.onFollowUpsComplete(true);
      expect(orchestrator.getContext().followUpIterationCount).toBe(initialCount + 1);
    });

    it('should transition to GAP_AUDIT when no more follow-ups', () => {
      const result = orchestrator.onFollowUpsComplete(false);
      expect(result.success).toBe(true);
      expect(result.state).toBe('GAP_AUDIT');
    });

    it('should transition to GAP_AUDIT on max follow-ups reached', () => {
      const result = orchestrator.onMaxFollowUpsReached();
      expect(result.success).toBe(true);
      expect(result.state).toBe('GAP_AUDIT');
    });
  });

  describe('gap audit flow', () => {
    beforeEach(() => {
      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(95);
      orchestrator.onExecutionComplete(false, false);
    });

    it('should transition to GAP_PLAN when gaps identified', () => {
      const result = orchestrator.onGapAuditComplete(true);
      expect(result.success).toBe(true);
      expect(result.state).toBe('GAP_PLAN');
    });

    it('should transition to SUMMARY_GENERATION when no gaps', () => {
      const result = orchestrator.onGapAuditComplete(false);
      expect(result.success).toBe(true);
      expect(result.state).toBe('SUMMARY_GENERATION');
    });
  });

  describe('gap plan flow', () => {
    beforeEach(() => {
      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(95);
      orchestrator.onExecutionComplete(false, false);
      orchestrator.onGapAuditComplete(true);
    });

    it('should return to EXECUTION after gap plan', () => {
      const result = orchestrator.onGapPlanComplete();
      expect(result.success).toBe(true);
      expect(result.state).toBe('EXECUTION');
    });

    it('should increment exec iteration count', () => {
      const initialCount = orchestrator.getContext().execIterationCount;
      orchestrator.onGapPlanComplete();
      expect(orchestrator.getContext().execIterationCount).toBe(initialCount + 1);
    });

    it('should reset follow-up iteration count', () => {
      // First simulate some follow-ups
      orchestrator.onGapPlanComplete();
      expect(orchestrator.getContext().followUpIterationCount).toBe(0);
    });
  });

  describe('completion flow', () => {
    beforeEach(() => {
      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(95);
      orchestrator.onExecutionComplete(false, false);
      orchestrator.onGapAuditComplete(false); // No gaps -> SUMMARY_GENERATION
    });

    it('should transition to COMPLETE after summary', () => {
      const result = orchestrator.onSummaryComplete();
      expect(result.success).toBe(true);
      expect(result.state).toBe('COMPLETE');
      expect(result.isComplete).toBe(true);
    });

    it('should be marked as complete', () => {
      orchestrator.onSummaryComplete();
      expect(orchestrator.isComplete()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should transition to FAILED on error', () => {
      orchestrator.start('Test requirements');
      const error = new Error('Test error');
      const result = orchestrator.onError(error);
      expect(result.success).toBe(true);
      expect(result.state).toBe('FAILED');
      expect(result.isComplete).toBe(true);
      expect(result.error).toBe(error);
    });

    it('should record error in context', () => {
      orchestrator.start('Test requirements');
      const error = new Error('Test error');
      orchestrator.onError(error);
      expect(orchestrator.getContext().lastError).toBe(error);
    });
  });

  describe('stop condition checks', () => {
    beforeEach(() => {
      config = createTestConfig({
        limits: {
          maxPlanIterations: 5,
          maxFollowUpIterations: 3,
          maxExecIterations: 2,
          maxGapAuditIterations: 5,
        },
      });
      orchestrator = createOrchestrator(config, deps);
    });

    it('should check plan revision stop condition', () => {
      const result = orchestrator.checkPlanRevisionStop(false, 90);
      expect(result).toHaveProperty('shouldStop');
      expect(result).toHaveProperty('message');
    });

    it('should check follow-up stop condition', () => {
      const result = orchestrator.checkFollowUpStop(true, false);
      expect(result).toHaveProperty('shouldStop');
      expect(result).toHaveProperty('message'); // reason is optional, message is always present
    });

    it('should check execution iteration stop condition', () => {
      const result = orchestrator.checkExecutionIterationStop(true);
      expect(result).toHaveProperty('shouldStop');
      expect(result).toHaveProperty('message'); // reason is optional, message is always present
    });
  });

  describe('state persistence', () => {
    it('should return serializable run state', () => {
      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      const runState = orchestrator.getRunState();

      expect(runState).toHaveProperty('context');
      expect(runState).toHaveProperty('config');
      expect(runState).toHaveProperty('transitionHistory');
      expect(runState.context.currentState).toBe('PLAN_REVISION');
      expect(runState.transitionHistory.length).toBe(2);
    });

    it('should resume from saved state', () => {
      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      const savedState = orchestrator.getRunState();

      // Create new orchestrator and resume
      const newOrchestrator = createOrchestrator(config, deps);
      const resumeResult = newOrchestrator.resume(savedState);

      expect(resumeResult.success).toBe(true);
      expect(newOrchestrator.getCurrentState()).toBe('PLAN_REVISION');
      // Transition history includes the 2 original transitions + the RESUME event = 3
      expect(newOrchestrator.getTransitionHistory().length).toBe(3);
    });
  });

  describe('run summary', () => {
    it('should provide run summary', () => {
      orchestrator.start('Test requirements');
      orchestrator.onPlanGenerated();
      orchestrator.onPlanComplete(95);

      const summary = orchestrator.getRunSummary();

      expect(summary.state).toBe('EXECUTION');
      expect(summary.phase).toBe('execution');
      expect(summary.planRevisions).toBe(0);
      expect(summary.execIterations).toBe(1);
      expect(summary.followUpIterations).toBe(0);
      expect(summary.transitionCount).toBe(3);
    });
  });

  describe('factory function', () => {
    it('should create orchestrator with createOrchestrator', () => {
      const orch = createOrchestrator(config, deps);
      expect(orch).toBeInstanceOf(Orchestrator);
      expect(orch.getCurrentState()).toBe('IDLE');
    });
  });
});

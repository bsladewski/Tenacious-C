/**
 * State Conversion Unit Tests
 *
 * Tests conversion between ExecutionState and OrchestratorRunState
 */

import { describe, it, expect } from 'vitest';
import {
  executionStateToOrchestratorRunState,
  orchestratorRunStateToExecutionState,
  extractResumeContext,
} from './state-conversion';
import { ExecutionState } from '../schemas/execution-state.schema';
import { EffectiveConfig, DEFAULT_CONFIG } from '../types';

// Helper to create a minimal EffectiveConfig for testing
function createTestConfig(overrides: Partial<EffectiveConfig> = {}): EffectiveConfig {
  return {
    ...DEFAULT_CONFIG,
    input: 'Test requirements',
    runId: 'test-run-id',
    resolvedAt: new Date().toISOString(),
    paths: {
      workingDirectory: '/test/workspace',
      artifactBaseDir: '/test/workspace/.tenacious-c',
      runDirectory: '/test/workspace/.tenacious-c/test-run-id',
    },
    ...overrides,
  };
}

// Helper to create a minimal ExecutionState for testing
function createTestExecutionState(overrides: Partial<ExecutionState> = {}): ExecutionState {
  return {
    timestampDirectory: '/test/workspace/.tenacious-c/2024-01-01_12-00-00-000Z',
    requirements: 'Test requirements',
    phase: 'plan-generation',
    config: {
      maxRevisions: 10,
      planConfidenceThreshold: 85,
      maxFollowUpIterations: 10,
      execIterations: 5,
      isDestinyMode: false,
      cliTool: 'cursor',
      previewPlan: false,
      planModel: null,
      executeModel: null,
      auditModel: null,
      planCliTool: 'cursor',
      executeCliTool: 'cursor',
      auditCliTool: 'cursor',
      fallbackCliTools: [],
    },
    lastSaved: new Date().toISOString(),
    ...overrides,
  };
}

describe('executionStateToOrchestratorRunState', () => {
  it('should convert plan-generation phase correctly', () => {
    const state = createTestExecutionState({
      phase: 'plan-generation',
    });
    const config = createTestConfig();

    const result = executionStateToOrchestratorRunState(state, config);

    expect(result.context.currentState).toBe('PLAN_GENERATION');
    expect(result.context.planRevisionCount).toBe(0);
    expect(result.context.execIterationCount).toBe(0);
    expect(result.config).toBe(config);
    expect(result.transitionHistory).toEqual([]);
  });

  it('should convert plan-revision phase with revision count', () => {
    const state = createTestExecutionState({
      phase: 'plan-revision',
      planGeneration: {
        revisionCount: 3,
        planPath: '/test/plan/plan.md',
        outputDirectory: '/test/plan',
      },
    });
    const config = createTestConfig();

    const result = executionStateToOrchestratorRunState(state, config);

    expect(result.context.currentState).toBe('PLAN_REVISION');
    expect(result.context.planRevisionCount).toBe(3);
  });

  it('should convert execution phase with iteration counts', () => {
    const state = createTestExecutionState({
      phase: 'execution',
      execution: {
        execIterationCount: 2,
        currentPlanPath: '/test/plan/plan.md',
        executeOutputDirectory: '/test/execute-2',
        followUpIterationCount: 5,
        hasDoneIteration0: true,
      },
    });
    const config = createTestConfig();

    const result = executionStateToOrchestratorRunState(state, config);

    expect(result.context.currentState).toBe('EXECUTION');
    expect(result.context.execIterationCount).toBe(2);
    expect(result.context.followUpIterationCount).toBe(5);
    expect(result.context.hasDoneIteration0).toBe(true);
  });

  it('should convert gap-audit phase correctly', () => {
    const state = createTestExecutionState({
      phase: 'gap-audit',
      execution: {
        execIterationCount: 1,
        currentPlanPath: '/test/plan/plan.md',
        executeOutputDirectory: '/test/execute',
        followUpIterationCount: 0,
        hasDoneIteration0: false,
      },
      gapAudit: {
        execIterationCount: 1,
        gapAuditOutputDirectory: '/test/gap-audit',
      },
    });
    const config = createTestConfig();

    const result = executionStateToOrchestratorRunState(state, config);

    expect(result.context.currentState).toBe('GAP_AUDIT');
    expect(result.context.execIterationCount).toBe(1);
  });

  it('should handle missing optional fields gracefully', () => {
    const state = createTestExecutionState({
      phase: 'execution',
      // No execution, planGeneration, or gapAudit fields
    });
    const config = createTestConfig();

    const result = executionStateToOrchestratorRunState(state, config);

    expect(result.context.currentState).toBe('EXECUTION');
    expect(result.context.planRevisionCount).toBe(0);
    expect(result.context.execIterationCount).toBe(0);
    expect(result.context.followUpIterationCount).toBe(0);
    expect(result.context.hasDoneIteration0).toBe(false);
  });
});

describe('orchestratorRunStateToExecutionState', () => {
  it('should convert PLAN_GENERATION state correctly', () => {
    const config = createTestConfig();
    const runState = {
      context: {
        currentState: 'PLAN_GENERATION' as const,
        planRevisionCount: 0,
        execIterationCount: 0,
        followUpIterationCount: 0,
        hasDoneIteration0: false,
        lastConfidence: 0,
        startedAt: new Date().toISOString(),
        lastTransitionAt: new Date().toISOString(),
      },
      config,
      transitionHistory: [],
    };

    const result = orchestratorRunStateToExecutionState(
      runState,
      '/test/timestamp',
      'Test requirements',
      '/test/plan',
      '/test/plan/plan.md'
    );

    expect(result.phase).toBe('plan-generation');
    expect(result.timestampDirectory).toBe('/test/timestamp');
    expect(result.requirements).toBe('Test requirements');
  });

  it('should convert EXECUTION state with directories', () => {
    const config = createTestConfig();
    const runState = {
      context: {
        currentState: 'EXECUTION' as const,
        planRevisionCount: 2,
        execIterationCount: 1,
        followUpIterationCount: 3,
        hasDoneIteration0: true,
        lastConfidence: 90,
        startedAt: new Date().toISOString(),
        lastTransitionAt: new Date().toISOString(),
      },
      config,
      transitionHistory: [],
    };

    const result = orchestratorRunStateToExecutionState(
      runState,
      '/test/timestamp',
      'Test requirements',
      '/test/plan',
      '/test/plan/plan.md',
      '/test/execute'
    );

    expect(result.phase).toBe('execution');
    expect(result.execution).toBeDefined();
    expect(result.execution?.execIterationCount).toBe(1);
    expect(result.execution?.followUpIterationCount).toBe(3);
    expect(result.execution?.hasDoneIteration0).toBe(true);
    expect(result.execution?.executeOutputDirectory).toBe('/test/execute');
  });

  it('should preserve config values correctly', () => {
    const config = createTestConfig({
      limits: {
        maxPlanIterations: 15,
        maxExecIterations: 8,
        maxFollowUpIterations: 12,
        maxGapAuditIterations: 5,
      },
      thresholds: {
        planConfidence: 90,
      },
      runMode: {
        resume: false,
        unlimitedIterations: true,
        mockMode: false,
      },
    });
    const runState = {
      context: {
        currentState: 'PLAN_GENERATION' as const,
        planRevisionCount: 0,
        execIterationCount: 0,
        followUpIterationCount: 0,
        hasDoneIteration0: false,
        lastConfidence: 0,
        startedAt: new Date().toISOString(),
        lastTransitionAt: new Date().toISOString(),
      },
      config,
      transitionHistory: [],
    };

    const result = orchestratorRunStateToExecutionState(
      runState,
      '/test/timestamp',
      'Test requirements',
      '/test/plan',
      '/test/plan/plan.md'
    );

    expect(result.config.maxRevisions).toBe(15);
    expect(result.config.execIterations).toBe(8);
    expect(result.config.maxFollowUpIterations).toBe(12);
    expect(result.config.planConfidenceThreshold).toBe(90);
    expect(result.config.isDestinyMode).toBe(true);
  });
});

describe('extractResumeContext', () => {
  it('should extract directories from planGeneration', () => {
    const state = createTestExecutionState({
      phase: 'plan-revision',
      planGeneration: {
        revisionCount: 2,
        planPath: '/test/plan/plan.md',
        outputDirectory: '/test/plan',
      },
    });

    const result = extractResumeContext(state, state.timestampDirectory);

    expect(result.planOutputDirectory).toBe('/test/plan');
    expect(result.currentPlanPath).toBe('/test/plan/plan.md');
  });

  it('should extract directories from execution state', () => {
    const state = createTestExecutionState({
      phase: 'execution',
      execution: {
        execIterationCount: 2,
        currentPlanPath: '/test/gap-plan/gap-plan-1.md',
        executeOutputDirectory: '/test/execute-2',
        followUpIterationCount: 0,
        hasDoneIteration0: false,
      },
    });

    const result = extractResumeContext(state, state.timestampDirectory);

    expect(result.currentPlanPath).toBe('/test/gap-plan/gap-plan-1.md');
    expect(result.currentExecuteOutputDirectory).toBe('/test/execute-2');
  });

  it('should extract gapAudit directory when present', () => {
    const state = createTestExecutionState({
      phase: 'gap-audit',
      gapAudit: {
        execIterationCount: 1,
        gapAuditOutputDirectory: '/test/gap-audit',
      },
    });

    const result = extractResumeContext(state, state.timestampDirectory);

    expect(result.currentGapAuditOutputDirectory).toBe('/test/gap-audit');
  });

  it('should use defaults when optional fields are missing', () => {
    const state = createTestExecutionState({
      phase: 'plan-generation',
      // No planGeneration, execution, or gapAudit
    });

    const result = extractResumeContext(state, state.timestampDirectory);

    expect(result.planOutputDirectory).toBe(`${state.timestampDirectory}/plan`);
    expect(result.currentPlanPath).toBe(`${state.timestampDirectory}/plan/plan.md`);
    expect(result.currentExecuteOutputDirectory).toBeUndefined();
    expect(result.currentGapAuditOutputDirectory).toBeUndefined();
  });
});

describe('FOLLOW_UPS phase mapping', () => {
  it('should convert follow-ups phase to FOLLOW_UPS state', () => {
    const state = createTestExecutionState({
      phase: 'follow-ups',
      execution: {
        execIterationCount: 1,
        currentPlanPath: '/test/plan/plan.md',
        executeOutputDirectory: '/test/execute',
        followUpIterationCount: 3,
        hasDoneIteration0: true,
      },
    });
    const config = createTestConfig();

    const result = executionStateToOrchestratorRunState(state, config);

    expect(result.context.currentState).toBe('FOLLOW_UPS');
    expect(result.context.followUpIterationCount).toBe(3);
    expect(result.context.hasDoneIteration0).toBe(true);
  });

  it('should convert FOLLOW_UPS state to follow-ups phase', () => {
    const config = createTestConfig();
    const runState = {
      context: {
        currentState: 'FOLLOW_UPS' as const,
        planRevisionCount: 2,
        execIterationCount: 1,
        followUpIterationCount: 5,
        hasDoneIteration0: true,
        lastConfidence: 90,
        startedAt: new Date().toISOString(),
        lastTransitionAt: new Date().toISOString(),
      },
      config,
      transitionHistory: [],
    };

    const result = orchestratorRunStateToExecutionState(
      runState,
      '/test/timestamp',
      'Test requirements',
      '/test/plan',
      '/test/plan/plan.md',
      '/test/execute'
    );

    expect(result.phase).toBe('follow-ups');
    expect(result.execution).toBeDefined();
    expect(result.execution?.followUpIterationCount).toBe(5);
    expect(result.execution?.hasDoneIteration0).toBe(true);
  });

  it('should preserve FOLLOW_UPS state through round-trip conversion', () => {
    const originalState = createTestExecutionState({
      phase: 'follow-ups',
      planGeneration: {
        revisionCount: 2,
        planPath: '/test/plan/plan.md',
        outputDirectory: '/test/plan',
      },
      execution: {
        execIterationCount: 1,
        currentPlanPath: '/test/plan/plan.md',
        executeOutputDirectory: '/test/execute',
        followUpIterationCount: 4,
        hasDoneIteration0: true,
      },
    });
    const config = createTestConfig();

    // Convert to OrchestratorRunState
    const runState = executionStateToOrchestratorRunState(originalState, config);

    // Verify orchestrator state is FOLLOW_UPS (not EXECUTION)
    expect(runState.context.currentState).toBe('FOLLOW_UPS');

    // Convert back to ExecutionState
    const resumeContext = extractResumeContext(originalState, originalState.timestampDirectory);
    const roundTripState = orchestratorRunStateToExecutionState(
      runState,
      originalState.timestampDirectory,
      originalState.requirements,
      resumeContext.planOutputDirectory,
      resumeContext.currentPlanPath,
      resumeContext.currentExecuteOutputDirectory
    );

    // Verify phase is 'follow-ups' (not 'execution')
    expect(roundTripState.phase).toBe('follow-ups');
    expect(roundTripState.execution?.followUpIterationCount).toBe(originalState.execution?.followUpIterationCount);
    expect(roundTripState.execution?.hasDoneIteration0).toBe(originalState.execution?.hasDoneIteration0);
  });
});

describe('round-trip conversion', () => {
  it('should preserve essential data through round-trip', () => {
    const originalState = createTestExecutionState({
      phase: 'execution',
      planGeneration: {
        revisionCount: 3,
        planPath: '/test/plan/plan.md',
        outputDirectory: '/test/plan',
      },
      execution: {
        execIterationCount: 2,
        currentPlanPath: '/test/gap-plan/gap-plan-1.md',
        executeOutputDirectory: '/test/execute-2',
        followUpIterationCount: 4,
        hasDoneIteration0: true,
      },
    });
    const config = createTestConfig();

    // Convert to OrchestratorRunState
    const runState = executionStateToOrchestratorRunState(originalState, config);

    // Convert back to ExecutionState
    const resumeContext = extractResumeContext(originalState, originalState.timestampDirectory);
    const roundTripState = orchestratorRunStateToExecutionState(
      runState,
      originalState.timestampDirectory,
      originalState.requirements,
      resumeContext.planOutputDirectory,
      resumeContext.currentPlanPath,
      resumeContext.currentExecuteOutputDirectory
    );

    // Verify essential data is preserved
    expect(roundTripState.phase).toBe(originalState.phase);
    expect(roundTripState.timestampDirectory).toBe(originalState.timestampDirectory);
    expect(roundTripState.requirements).toBe(originalState.requirements);
    expect(roundTripState.execution?.execIterationCount).toBe(originalState.execution?.execIterationCount);
    expect(roundTripState.execution?.followUpIterationCount).toBe(originalState.execution?.followUpIterationCount);
    expect(roundTripState.execution?.hasDoneIteration0).toBe(originalState.execution?.hasDoneIteration0);
  });
});

/**
 * Integration Tests for Orchestrator-based plan execution
 *
 * Tests the resume flow, state persistence, and error handling
 */

import { describe, it, expect } from 'vitest';
import { phaseToState, stateToPhase } from '../core/state-machine';
import {
  executionStateToOrchestratorRunState,
  orchestratorRunStateToExecutionState,
} from '../core/state-conversion';
import { ExecutionState } from '../schemas/execution-state.schema';
import { DEFAULT_CONFIG, EffectiveConfig } from '../types';

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

// Helper to create ExecutionState for testing
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

describe('Resume flow integration tests', () => {
  describe('phase-to-state mapping for resume', () => {
    it('should map follow-ups phase to FOLLOW_UPS state', () => {
      const state = phaseToState('follow-ups');
      expect(state).toBe('FOLLOW_UPS');
    });

    it('should map FOLLOW_UPS state to follow-ups phase', () => {
      const phase = stateToPhase('FOLLOW_UPS');
      expect(phase).toBe('follow-ups');
    });

    it('should correctly distinguish follow-ups phase from execution phase', () => {
      const executionPhase = stateToPhase('EXECUTION');
      const followUpsPhase = stateToPhase('FOLLOW_UPS');

      expect(executionPhase).toBe('execution');
      expect(followUpsPhase).toBe('follow-ups');
      expect(executionPhase).not.toBe(followUpsPhase);
    });
  });

  describe('state persistence for resume', () => {
    it('should preserve FOLLOW_UPS state through persistence cycle', () => {
      const config = createTestConfig();
      const followUpsState = createTestExecutionState({
        phase: 'follow-ups',
        execution: {
          execIterationCount: 1,
          currentPlanPath: '/test/plan/plan.md',
          executeOutputDirectory: '/test/execute',
          followUpIterationCount: 3,
          hasDoneIteration0: true,
        },
      });

      // Convert to OrchestratorRunState (simulating resume load)
      const runState = executionStateToOrchestratorRunState(followUpsState, config);

      // Verify the orchestrator state is FOLLOW_UPS
      expect(runState.context.currentState).toBe('FOLLOW_UPS');
      expect(runState.context.followUpIterationCount).toBe(3);
      expect(runState.context.hasDoneIteration0).toBe(true);

      // Convert back to ExecutionState (simulating save)
      const persistedState = orchestratorRunStateToExecutionState(
        runState,
        followUpsState.timestampDirectory,
        followUpsState.requirements,
        '/test/plan',
        '/test/plan/plan.md',
        '/test/execute'
      );

      // Verify the phase is still follow-ups (not execution)
      expect(persistedState.phase).toBe('follow-ups');
      expect(persistedState.execution?.followUpIterationCount).toBe(3);
      expect(persistedState.execution?.hasDoneIteration0).toBe(true);
    });

    it('should preserve all execution phases through persistence', () => {
      const config = createTestConfig();
      const phases = [
        'plan-generation',
        'plan-revision',
        'execution',
        'follow-ups',
        'gap-audit',
        'gap-plan',
        'complete',
      ] as const;

      for (const phase of phases) {
        const state = createTestExecutionState({
          phase,
          execution:
            phase === 'execution' || phase === 'follow-ups' || phase === 'gap-audit' || phase === 'gap-plan'
              ? {
                  execIterationCount: 1,
                  currentPlanPath: '/test/plan/plan.md',
                  executeOutputDirectory: '/test/execute',
                  followUpIterationCount: phase === 'follow-ups' ? 2 : 0,
                  hasDoneIteration0: phase === 'follow-ups',
                }
              : undefined,
        });

        const runState = executionStateToOrchestratorRunState(state, config);
        const persistedState = orchestratorRunStateToExecutionState(
          runState,
          state.timestampDirectory,
          state.requirements,
          '/test/plan',
          '/test/plan/plan.md',
          '/test/execute',
          phase === 'gap-audit' ? '/test/gap-audit' : undefined
        );

        // Verify phase is preserved through round-trip
        expect(persistedState.phase).toBe(phase);
      }
    });
  });

  describe('resume from FOLLOW_UPS phase', () => {
    it('should correctly restore FOLLOW_UPS context with follow-up iteration count', () => {
      const config = createTestConfig();
      const savedState = createTestExecutionState({
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
          followUpIterationCount: 5,
          hasDoneIteration0: true,
        },
      });

      const runState = executionStateToOrchestratorRunState(savedState, config);

      // Verify orchestrator would be in FOLLOW_UPS state after resume
      expect(runState.context.currentState).toBe('FOLLOW_UPS');

      // Verify context values are correct for continuing follow-ups
      expect(runState.context.execIterationCount).toBe(1);
      expect(runState.context.followUpIterationCount).toBe(5);
      expect(runState.context.hasDoneIteration0).toBe(true);
      expect(runState.context.planRevisionCount).toBe(2);
    });

    it('should resume with hard blocker iteration 0 not done', () => {
      const config = createTestConfig();
      const savedState = createTestExecutionState({
        phase: 'follow-ups',
        execution: {
          execIterationCount: 1,
          currentPlanPath: '/test/plan/plan.md',
          executeOutputDirectory: '/test/execute',
          followUpIterationCount: 0,
          hasDoneIteration0: false,
        },
      });

      const runState = executionStateToOrchestratorRunState(savedState, config);

      expect(runState.context.currentState).toBe('FOLLOW_UPS');
      expect(runState.context.followUpIterationCount).toBe(0);
      expect(runState.context.hasDoneIteration0).toBe(false);
    });
  });

  describe('resume state validation', () => {
    it('should handle ExecutionState with minimal fields', () => {
      const config = createTestConfig();
      const minimalState = createTestExecutionState({
        phase: 'plan-generation',
        // No planGeneration, execution, or gapAudit
      });

      const runState = executionStateToOrchestratorRunState(minimalState, config);

      expect(runState.context.currentState).toBe('PLAN_GENERATION');
      expect(runState.context.planRevisionCount).toBe(0);
      expect(runState.context.execIterationCount).toBe(0);
      expect(runState.context.followUpIterationCount).toBe(0);
      expect(runState.context.hasDoneIteration0).toBe(false);
    });

    it('should correctly convert all valid phases', () => {
      const validPhases: Array<ExecutionState['phase']> = [
        'plan-generation',
        'plan-revision',
        'execution',
        'follow-ups',
        'gap-audit',
        'gap-plan',
        'complete',
      ];

      const expectedStates = [
        'PLAN_GENERATION',
        'PLAN_REVISION',
        'EXECUTION',
        'FOLLOW_UPS',
        'GAP_AUDIT',
        'GAP_PLAN',
        'COMPLETE',
      ];

      for (let i = 0; i < validPhases.length; i++) {
        const state = phaseToState(validPhases[i]);
        expect(state).toBe(expectedStates[i]);
      }
    });
  });

  describe('state conversion edge cases', () => {
    it('should preserve config through conversion', () => {
      const customConfig = createTestConfig({
        limits: {
          maxPlanIterations: 20,
          maxExecIterations: 10,
          maxFollowUpIterations: 15,
          maxGapAuditIterations: 5,
        },
        thresholds: {
          planConfidence: 95,
        },
        runMode: {
          resume: true,
          unlimitedIterations: true,
          mockMode: false,
        },
      });

      const state = createTestExecutionState({ phase: 'follow-ups' });
      const runState = executionStateToOrchestratorRunState(state, customConfig);

      // Verify config is passed through
      expect(runState.config).toBe(customConfig);
      expect(runState.config.limits.maxFollowUpIterations).toBe(15);
      expect(runState.config.runMode.unlimitedIterations).toBe(true);
    });

    it('should initialize transitionHistory as empty array on resume', () => {
      const config = createTestConfig();
      const state = createTestExecutionState({ phase: 'execution' });

      const runState = executionStateToOrchestratorRunState(state, config);

      // Transition history is not persisted, so it should be empty on resume
      expect(runState.transitionHistory).toEqual([]);
    });
  });
});

describe('Error handling for resume', () => {
  it('should handle missing execution context gracefully', () => {
    const config = createTestConfig();
    const stateWithoutExecution = createTestExecutionState({
      phase: 'execution',
      // Intentionally no execution field
    });

    // Should not throw, should use defaults
    const runState = executionStateToOrchestratorRunState(stateWithoutExecution, config);

    expect(runState.context.currentState).toBe('EXECUTION');
    expect(runState.context.execIterationCount).toBe(0);
    expect(runState.context.followUpIterationCount).toBe(0);
  });

  it('should handle missing planGeneration context gracefully', () => {
    const config = createTestConfig();
    const stateWithoutPlan = createTestExecutionState({
      phase: 'plan-revision',
      // Intentionally no planGeneration field
    });

    const runState = executionStateToOrchestratorRunState(stateWithoutPlan, config);

    expect(runState.context.currentState).toBe('PLAN_REVISION');
    expect(runState.context.planRevisionCount).toBe(0);
  });
});

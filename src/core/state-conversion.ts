/**
 * State Conversion Utility
 *
 * Converts between ExecutionState (used for disk persistence) and
 * OrchestratorRunState (used by the orchestrator internally).
 */

import { ExecutionState, CliToolType } from '../schemas/execution-state.schema';
import { OrchestratorRunState } from './orchestrator';
import { OrchestrationContext, phaseToState, stateToPhase } from './state-machine';
import { EffectiveConfig, CliToolName } from '../types';
import { resolve } from 'path';

/**
 * Convert ExecutionState to OrchestratorRunState for resuming
 *
 * @param state - The persisted ExecutionState from disk
 * @param config - The effective configuration for the run
 * @returns OrchestratorRunState suitable for passing to orchestrator.resume()
 */
export function executionStateToOrchestratorRunState(
  state: ExecutionState,
  config: EffectiveConfig
): OrchestratorRunState {
  // Map the legacy phase to orchestration state
  const orchestrationState = phaseToState(state.phase);

  // Build the OrchestrationContext from the ExecutionState
  const context: OrchestrationContext = {
    currentState: orchestrationState,
    planRevisionCount: state.planGeneration?.revisionCount ?? 0,
    execIterationCount: state.execution?.execIterationCount ?? 0,
    followUpIterationCount: state.execution?.followUpIterationCount ?? 0,
    hasDoneIteration0: state.execution?.hasDoneIteration0 ?? false,
    lastConfidence: 0, // Not persisted in ExecutionState
    startedAt: state.lastSaved, // Use last saved as approximate start time
    lastTransitionAt: state.lastSaved,
  };

  return {
    context,
    config,
    transitionHistory: [], // History is not persisted, start fresh
  };
}

/**
 * Convert OrchestratorRunState to ExecutionState for persistence
 *
 * @param runState - The orchestrator's current run state
 * @param timestampDirectory - The directory for this run
 * @param requirements - The original requirements/input
 * @param planOutputDirectory - The plan output directory path
 * @param currentPlanPath - The current plan file path
 * @param executeOutputDirectory - The current execute output directory (optional)
 * @param gapAuditOutputDirectory - The current gap audit output directory (optional)
 * @returns ExecutionState suitable for saving to disk
 */
export function orchestratorRunStateToExecutionState(
  runState: OrchestratorRunState,
  timestampDirectory: string,
  requirements: string,
  planOutputDirectory: string,
  currentPlanPath: string,
  executeOutputDirectory?: string,
  gapAuditOutputDirectory?: string
): ExecutionState {
  const { context, config } = runState;
  const phase = stateToPhase(context.currentState);

  const state: ExecutionState = {
    timestampDirectory,
    requirements,
    phase,
    config: {
      maxRevisions: config.limits.maxPlanIterations,
      planConfidenceThreshold: config.thresholds.planConfidence,
      maxFollowUpIterations: config.limits.maxFollowUpIterations,
      execIterations: config.limits.maxExecIterations,
      isDestinyMode: config.runMode.unlimitedIterations,
      cliTool: cliToolNameToType(config.tools.plan),
      previewPlan: config.interactivity.previewPlan,
      planModel: config.models.plan ?? null,
      executeModel: config.models.execute ?? null,
      auditModel: config.models.audit ?? null,
      planCliTool: cliToolNameToType(config.tools.plan),
      executeCliTool: cliToolNameToType(config.tools.execute),
      auditCliTool: cliToolNameToType(config.tools.audit),
      fallbackCliTools: config.fallback.fallbackTools.map(cliToolNameToType) as CliToolType[],
    },
    lastSaved: new Date().toISOString(),
  };

  // Add plan generation state if we have plan-related info
  if (context.planRevisionCount > 0 || phase === 'plan-generation' || phase === 'plan-revision') {
    state.planGeneration = {
      revisionCount: context.planRevisionCount,
      planPath: currentPlanPath,
      outputDirectory: planOutputDirectory,
    };
  }

  // Add execution state if we're in or past execution phase
  if (
    context.execIterationCount > 0 ||
    phase === 'execution' ||
    phase === 'follow-ups' ||
    phase === 'gap-audit' ||
    phase === 'gap-plan'
  ) {
    state.execution = {
      execIterationCount: context.execIterationCount,
      currentPlanPath,
      executeOutputDirectory: executeOutputDirectory ?? resolve(timestampDirectory, 'execute'),
      followUpIterationCount: context.followUpIterationCount,
      hasDoneIteration0: context.hasDoneIteration0,
    };
  }

  // Add gap audit state if in gap audit phase
  if (phase === 'gap-audit' && gapAuditOutputDirectory) {
    state.gapAudit = {
      execIterationCount: context.execIterationCount,
      gapAuditOutputDirectory,
    };
  }

  // Add gap plan state if in gap plan phase
  if (phase === 'gap-plan') {
    const gapPlanDir =
      context.execIterationCount === 1
        ? resolve(timestampDirectory, 'gap-plan')
        : resolve(timestampDirectory, `gap-plan-${context.execIterationCount}`);
    state.gapPlan = {
      execIterationCount: context.execIterationCount,
      gapPlanOutputDirectory: gapPlanDir,
    };
  }

  return state;
}

/**
 * Convert CliToolName to CliToolType
 * These types are compatible but defined in different modules
 */
function cliToolNameToType(name: CliToolName): CliToolType {
  return name as CliToolType;
}

/**
 * Extract mutable context values from ExecutionState for resume
 *
 * @param state - The ExecutionState to extract from
 * @param timestampDirectory - The base timestamp directory
 * @returns Object containing paths and directories for resuming
 */
export function extractResumeContext(
  state: ExecutionState,
  timestampDirectory: string
): {
  planOutputDirectory: string;
  currentPlanPath: string;
  currentExecuteOutputDirectory?: string;
  currentGapAuditOutputDirectory?: string;
} {
  const planOutputDirectory = state.planGeneration?.outputDirectory ?? resolve(timestampDirectory, 'plan');
  const currentPlanPath = state.execution?.currentPlanPath ?? state.planGeneration?.planPath ?? resolve(planOutputDirectory, 'plan.md');

  let currentExecuteOutputDirectory: string | undefined;
  if (state.execution?.executeOutputDirectory) {
    currentExecuteOutputDirectory = state.execution.executeOutputDirectory;
  } else if (state.execution?.execIterationCount) {
    currentExecuteOutputDirectory =
      state.execution.execIterationCount === 1
        ? resolve(timestampDirectory, 'execute')
        : resolve(timestampDirectory, `execute-${state.execution.execIterationCount}`);
  }

  let currentGapAuditOutputDirectory: string | undefined;
  if (state.gapAudit?.gapAuditOutputDirectory) {
    currentGapAuditOutputDirectory = state.gapAudit.gapAuditOutputDirectory;
  }

  return {
    planOutputDirectory,
    currentPlanPath,
    currentExecuteOutputDirectory,
    currentGapAuditOutputDirectory,
  };
}

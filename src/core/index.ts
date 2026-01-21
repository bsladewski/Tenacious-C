/**
 * Core module - orchestration logic and state machine
 * This module contains the central orchestration logic
 * and must not import from ui/ or spawn processes directly.
 */

// State machine
export {
  OrchestrationState,
  OrchestrationEvent,
  OrchestrationContext,
  TransitionResult,
  createInitialContext,
  isValidTransition,
  transition,
  getStateDescription,
  isTerminalState,
  isResumableState,
  phaseToState,
  stateToPhase,
} from './state-machine';

// Iteration policies
export {
  StopReason,
  StopConditionResult,
  IterationProgress,
  checkPlanRevisionStopCondition,
  checkFollowUpStopCondition,
  checkExecutionIterationStopCondition,
  getPlanRevisionProgress,
  getFollowUpProgress,
  getExecutionIterationProgress,
  formatLimit,
  getRemainingIterations,
} from './iteration-policy';

// Orchestrator
export {
  Orchestrator,
  OrchestratorDependencies,
  OrchestratorStepResult,
  OrchestratorRunState,
  createOrchestrator,
} from './orchestrator';

// Execution state utilities
export { createExecutionState } from './create-execution-state';
export { syncStateWithArtifacts } from './sync-state-with-artifacts';

// State conversion between ExecutionState and OrchestratorRunState
export {
  executionStateToOrchestratorRunState,
  orchestratorRunStateToExecutionState,
  extractResumeContext,
} from './state-conversion';

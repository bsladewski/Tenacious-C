/**
 * Explicit State Machine for Orchestration (F14)
 * Following ENGINEERING_GUIDE.md Section 6.1 specification
 *
 * Models orchestration as typed state transitions with a single
 * centralized location for all transition logic.
 */

/**
 * All possible orchestration states
 */
export type OrchestrationState =
  | 'IDLE'
  | 'PLAN_GENERATION'
  | 'PLAN_REVISION'
  | 'TOOL_CURATION'
  | 'EXECUTION'
  | 'FOLLOW_UPS'
  | 'GAP_AUDIT'
  | 'GAP_PLAN'
  | 'SUMMARY_GENERATION'
  | 'COMPLETE'
  | 'FAILED';

/**
 * Events that trigger state transitions
 */
export type OrchestrationEvent =
  | { type: 'START_PLAN'; requirements: string }
  | { type: 'PLAN_GENERATED' }
  | { type: 'OPEN_QUESTIONS_FOUND'; questionCount: number }
  | { type: 'QUESTIONS_ANSWERED' }
  | { type: 'CONFIDENCE_LOW'; confidence: number; threshold: number }
  | { type: 'PLAN_IMPROVED' }
  | { type: 'PLAN_COMPLETE'; confidence: number }
  | { type: 'START_EXECUTION' }
  | { type: 'EXECUTION_COMPLETE'; hasFollowUps: boolean; hasHardBlockers: boolean }
  | { type: 'HARD_BLOCKERS_RESOLVED' }
  | { type: 'FOLLOW_UPS_COMPLETE'; hasFollowUps: boolean }
  | { type: 'MAX_FOLLOW_UPS_REACHED' }
  | { type: 'START_GAP_AUDIT' }
  | { type: 'GAP_AUDIT_COMPLETE'; gapsIdentified: boolean }
  | { type: 'GAP_PLAN_COMPLETE' }
  | { type: 'MAX_EXEC_ITERATIONS_REACHED' }
  | { type: 'NO_GAPS_FOUND' }
  | { type: 'GENERATE_SUMMARY' }
  | { type: 'SUMMARY_COMPLETE' }
  | { type: 'TOOL_CURATION_COMPLETE' }
  | { type: 'RESUME'; fromState: OrchestrationState }
  | { type: 'ERROR'; error: Error };

/**
 * Context data maintained across state transitions
 */
export interface OrchestrationContext {
  /** Current state of the state machine */
  currentState: OrchestrationState;
  /** Number of plan revisions completed */
  planRevisionCount: number;
  /** Current execution iteration (1-indexed) */
  execIterationCount: number;
  /** Current follow-up iteration within an execution (0-indexed) */
  followUpIterationCount: number;
  /** Whether iteration 0 (hard blocker resolution) was done */
  hasDoneIteration0: boolean;
  /** Last recorded confidence level */
  lastConfidence: number;
  /** Last error that occurred */
  lastError?: Error;
  /** Timestamp when the run started */
  startedAt: string;
  /** Timestamp of last state change */
  lastTransitionAt: string;
}

/**
 * Result of a state transition
 */
export interface TransitionResult {
  /** The new state after transition */
  newState: OrchestrationState;
  /** Updated context */
  context: OrchestrationContext;
  /** Whether the transition was valid */
  valid: boolean;
  /** Human-readable description of what happened */
  description: string;
}

/**
 * Valid state transitions map
 * Key: current state, Value: array of valid next states
 */
const VALID_TRANSITIONS: Record<OrchestrationState, OrchestrationState[]> = {
  IDLE: ['PLAN_GENERATION'],
  PLAN_GENERATION: ['PLAN_REVISION', 'TOOL_CURATION', 'FAILED'],
  PLAN_REVISION: ['PLAN_REVISION', 'TOOL_CURATION', 'SUMMARY_GENERATION', 'FAILED'],
  TOOL_CURATION: ['EXECUTION', 'FAILED'],
  EXECUTION: ['FOLLOW_UPS', 'GAP_AUDIT', 'FAILED'],
  FOLLOW_UPS: ['FOLLOW_UPS', 'GAP_AUDIT', 'FAILED'],
  GAP_AUDIT: ['GAP_PLAN', 'SUMMARY_GENERATION', 'FAILED'],
  GAP_PLAN: ['EXECUTION', 'SUMMARY_GENERATION', 'FAILED'],
  SUMMARY_GENERATION: ['COMPLETE', 'FAILED'],
  COMPLETE: [],
  FAILED: ['IDLE'], // Can restart from failed
};

/**
 * Create initial context for a new orchestration run
 */
export function createInitialContext(): OrchestrationContext {
  const now = new Date().toISOString();
  return {
    currentState: 'IDLE',
    planRevisionCount: 0,
    execIterationCount: 0,
    followUpIterationCount: 0,
    hasDoneIteration0: false,
    lastConfidence: 0,
    startedAt: now,
    lastTransitionAt: now,
  };
}

/**
 * Check if a transition from one state to another is valid
 */
export function isValidTransition(from: OrchestrationState, to: OrchestrationState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Process an event and return the resulting state transition
 */
export function transition(
  context: OrchestrationContext,
  event: OrchestrationEvent
): TransitionResult {
  const { currentState } = context;
  const now = new Date().toISOString();
  let newState: OrchestrationState = currentState;
  let newContext: OrchestrationContext = { ...context, lastTransitionAt: now };
  let description = '';

  switch (event.type) {
    case 'START_PLAN':
      if (currentState === 'IDLE') {
        newState = 'PLAN_GENERATION';
        description = 'Started plan generation';
      }
      break;

    case 'PLAN_GENERATED':
      if (currentState === 'PLAN_GENERATION') {
        newState = 'PLAN_REVISION';
        description = 'Initial plan generated, entering revision phase';
      }
      break;

    case 'OPEN_QUESTIONS_FOUND':
      if (currentState === 'PLAN_REVISION' || currentState === 'PLAN_GENERATION') {
        newState = 'PLAN_REVISION';
        description = `Found ${event.questionCount} open questions to answer`;
      }
      break;

    case 'QUESTIONS_ANSWERED':
      if (currentState === 'PLAN_REVISION') {
        newContext = { ...newContext, planRevisionCount: context.planRevisionCount + 1 };
        description = `Answered questions, revision ${newContext.planRevisionCount}`;
      }
      break;

    case 'CONFIDENCE_LOW':
      if (currentState === 'PLAN_REVISION') {
        newContext = { ...newContext, lastConfidence: event.confidence };
        description = `Confidence ${event.confidence}% below threshold ${event.threshold}%, needs improvement`;
      }
      break;

    case 'PLAN_IMPROVED':
      if (currentState === 'PLAN_REVISION') {
        newContext = { ...newContext, planRevisionCount: context.planRevisionCount + 1 };
        description = `Plan improved, revision ${newContext.planRevisionCount}`;
      }
      break;

    case 'PLAN_COMPLETE':
      if (currentState === 'PLAN_REVISION' || currentState === 'PLAN_GENERATION') {
        newState = 'TOOL_CURATION';
        newContext = {
          ...newContext,
          lastConfidence: event.confidence,
        };
        description = `Plan complete with ${event.confidence}% confidence, starting tool curation`;
      }
      break;

    case 'TOOL_CURATION_COMPLETE':
      if (currentState === 'TOOL_CURATION') {
        newState = 'EXECUTION';
        newContext = {
          ...newContext,
          execIterationCount: 1,
        };
        description = 'Tool curation complete, starting execution';
      }
      break;

    case 'START_EXECUTION':
      if (currentState === 'EXECUTION' || currentState === 'GAP_PLAN') {
        newState = 'EXECUTION';
        description = `Starting execution iteration ${context.execIterationCount}`;
      }
      break;

    case 'EXECUTION_COMPLETE':
      if (currentState === 'EXECUTION') {
        if (event.hasHardBlockers) {
          newState = 'FOLLOW_UPS';
          newContext = { ...newContext, followUpIterationCount: 0, hasDoneIteration0: false };
          description = 'Execution complete with hard blockers, entering follow-ups';
        } else if (event.hasFollowUps) {
          newState = 'FOLLOW_UPS';
          newContext = { ...newContext, followUpIterationCount: 0, hasDoneIteration0: true };
          description = 'Execution complete with follow-ups';
        } else {
          newState = 'GAP_AUDIT';
          description = 'Execution complete, no follow-ups, starting gap audit';
        }
      }
      break;

    case 'HARD_BLOCKERS_RESOLVED':
      if (currentState === 'FOLLOW_UPS') {
        newContext = {
          ...newContext,
          hasDoneIteration0: true,
          followUpIterationCount: context.followUpIterationCount + 1,
        };
        description = `Hard blockers resolved, follow-up iteration ${newContext.followUpIterationCount}`;
      }
      break;

    case 'FOLLOW_UPS_COMPLETE':
      if (currentState === 'FOLLOW_UPS') {
        if (event.hasFollowUps) {
          newContext = {
            ...newContext,
            followUpIterationCount: context.followUpIterationCount + 1,
          };
          description = `Follow-up iteration ${newContext.followUpIterationCount} complete, more follow-ups`;
        } else {
          newState = 'GAP_AUDIT';
          description = 'All follow-ups complete, starting gap audit';
        }
      }
      break;

    case 'MAX_FOLLOW_UPS_REACHED':
      if (currentState === 'FOLLOW_UPS') {
        newState = 'GAP_AUDIT';
        description = `Max follow-ups reached (${context.followUpIterationCount}), starting gap audit`;
      }
      break;

    case 'START_GAP_AUDIT':
      if (currentState === 'EXECUTION' || currentState === 'FOLLOW_UPS') {
        newState = 'GAP_AUDIT';
        description = `Starting gap audit for execution iteration ${context.execIterationCount}`;
      }
      break;

    case 'GAP_AUDIT_COMPLETE':
      if (currentState === 'GAP_AUDIT') {
        if (event.gapsIdentified) {
          newState = 'GAP_PLAN';
          description = 'Gaps identified, creating gap closure plan';
        } else {
          newState = 'SUMMARY_GENERATION';
          description = 'No gaps identified, implementation complete';
        }
      }
      break;

    case 'GAP_PLAN_COMPLETE':
      if (currentState === 'GAP_PLAN') {
        newState = 'EXECUTION';
        newContext = {
          ...newContext,
          execIterationCount: context.execIterationCount + 1,
          followUpIterationCount: 0,
          hasDoneIteration0: false,
        };
        description = `Gap plan complete, starting execution iteration ${newContext.execIterationCount}`;
      }
      break;

    case 'MAX_EXEC_ITERATIONS_REACHED':
      if (currentState === 'GAP_PLAN' || currentState === 'EXECUTION') {
        newState = 'SUMMARY_GENERATION';
        description = `Max execution iterations reached (${context.execIterationCount})`;
      }
      break;

    case 'NO_GAPS_FOUND':
      if (currentState === 'GAP_AUDIT') {
        newState = 'SUMMARY_GENERATION';
        description = 'No gaps found, implementation complete';
      }
      break;

    case 'GENERATE_SUMMARY':
      if (
        currentState === 'PLAN_REVISION' ||
        currentState === 'GAP_AUDIT' ||
        currentState === 'GAP_PLAN' ||
        currentState === 'EXECUTION'
      ) {
        newState = 'SUMMARY_GENERATION';
        description = 'Generating final summary';
      }
      break;

    case 'SUMMARY_COMPLETE':
      if (currentState === 'SUMMARY_GENERATION') {
        newState = 'COMPLETE';
        description = 'Summary generated, orchestration complete';
      }
      break;

    case 'RESUME':
      newState = event.fromState;
      description = `Resumed from ${event.fromState}`;
      break;

    case 'ERROR':
      newState = 'FAILED';
      newContext = { ...newContext, lastError: event.error };
      description = `Error: ${event.error.message}`;
      break;
  }

  const valid = newState === currentState || isValidTransition(currentState, newState);

  return {
    newState: valid ? newState : currentState,
    context: valid ? { ...newContext, currentState: newState } : context,
    valid,
    description: valid ? description : `Invalid transition from ${currentState} via ${event.type}`,
  };
}

/**
 * Get human-readable description of a state
 */
export function getStateDescription(state: OrchestrationState): string {
  const descriptions: Record<OrchestrationState, string> = {
    IDLE: 'Waiting to start',
    PLAN_GENERATION: 'Generating initial plan',
    PLAN_REVISION: 'Revising plan (answering questions or improving confidence)',
    TOOL_CURATION: 'Curating verification tools',
    EXECUTION: 'Executing plan',
    FOLLOW_UPS: 'Processing follow-up tasks',
    GAP_AUDIT: 'Auditing for implementation gaps',
    GAP_PLAN: 'Creating gap closure plan',
    SUMMARY_GENERATION: 'Generating final summary',
    COMPLETE: 'Orchestration complete',
    FAILED: 'Orchestration failed',
  };
  return descriptions[state];
}

/**
 * Check if the orchestration is in a terminal state
 */
export function isTerminalState(state: OrchestrationState): boolean {
  return state === 'COMPLETE' || state === 'FAILED';
}

/**
 * Check if the orchestration is in a resumable state
 */
export function isResumableState(state: OrchestrationState): boolean {
  return !isTerminalState(state) && state !== 'IDLE';
}

/**
 * Map legacy phase names to orchestration states
 */
export function phaseToState(
  phase:
    | 'plan-generation'
    | 'plan-revision'
    | 'tool-curation'
    | 'execution'
    | 'follow-ups'
    | 'gap-audit'
    | 'gap-plan'
    | 'complete'
): OrchestrationState {
  const mapping: Record<string, OrchestrationState> = {
    'plan-generation': 'PLAN_GENERATION',
    'plan-revision': 'PLAN_REVISION',
    'tool-curation': 'TOOL_CURATION',
    execution: 'EXECUTION',
    'follow-ups': 'FOLLOW_UPS',
    'gap-audit': 'GAP_AUDIT',
    'gap-plan': 'GAP_PLAN',
    complete: 'COMPLETE',
  };
  return mapping[phase] ?? 'IDLE';
}

/**
 * Map orchestration states to legacy phase names
 */
export function stateToPhase(
  state: OrchestrationState
): 'plan-generation' | 'plan-revision' | 'tool-curation' | 'execution' | 'follow-ups' | 'gap-audit' | 'gap-plan' | 'complete' {
  const mapping: Record<OrchestrationState, string> = {
    IDLE: 'plan-generation',
    PLAN_GENERATION: 'plan-generation',
    PLAN_REVISION: 'plan-revision',
    TOOL_CURATION: 'tool-curation',
    EXECUTION: 'execution',
    FOLLOW_UPS: 'follow-ups',
    GAP_AUDIT: 'gap-audit',
    GAP_PLAN: 'gap-plan',
    SUMMARY_GENERATION: 'complete',
    COMPLETE: 'complete',
    FAILED: 'complete',
  };
  return mapping[state] as
    | 'plan-generation'
    | 'plan-revision'
    | 'tool-curation'
    | 'execution'
    | 'follow-ups'
    | 'gap-audit'
    | 'gap-plan'
    | 'complete';
}

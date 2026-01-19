/**
 * Orchestrator class (F14 Phase 2.4-2.8)
 * Wraps the state machine and provides high-level orchestration API
 * Uses dependency injection for all external interactions
 */

import {
  OrchestrationState,
  OrchestrationEvent,
  OrchestrationContext,
  TransitionResult,
  createInitialContext,
  transition,
  isTerminalState,
  getStateDescription,
  stateToPhase,
} from './state-machine';

import {
  checkPlanRevisionStopCondition,
  checkFollowUpStopCondition,
  checkExecutionIterationStopCondition,
  StopConditionResult,
} from './iteration-policy';

import {
  EffectiveConfig,
  Logger,
  FileSystem,
  Prompter,
  Clock,
  ProcessRunner,
} from '../types';

/**
 * Dependencies required by the Orchestrator
 */
export interface OrchestratorDependencies {
  /** Logger for structured logging */
  logger: Logger;
  /** File system for artifact I/O */
  fileSystem: FileSystem;
  /** Prompter for user interaction */
  prompter: Prompter;
  /** Clock for time operations */
  clock: Clock;
  /** Process runner for engine execution */
  processRunner: ProcessRunner;
}

/**
 * Result of an orchestration step
 */
export interface OrchestratorStepResult {
  /** Whether the step was successful */
  success: boolean;
  /** The resulting state after the step */
  state: OrchestrationState;
  /** Human-readable description of what happened */
  description: string;
  /** Whether orchestration is complete (terminal state reached) */
  isComplete: boolean;
  /** Stop condition result if iteration limit was checked */
  stopCondition?: StopConditionResult;
  /** Error if the step failed */
  error?: Error;
}

/**
 * Orchestration run state (serializable for persistence)
 */
export interface OrchestratorRunState {
  /** Current orchestration context */
  context: OrchestrationContext;
  /** Effective configuration for the run */
  config: EffectiveConfig;
  /** History of state transitions */
  transitionHistory: TransitionResult[];
}

/**
 * Orchestrator class - main entry point for running the orchestration loop
 */
export class Orchestrator {
  private context: OrchestrationContext;
  private transitionHistory: TransitionResult[] = [];
  private readonly deps: OrchestratorDependencies;
  private readonly config: EffectiveConfig;

  constructor(config: EffectiveConfig, deps: OrchestratorDependencies) {
    this.config = config;
    this.deps = deps;
    this.context = createInitialContext();
  }

  /**
   * Get the current state
   */
  getCurrentState(): OrchestrationState {
    return this.context.currentState;
  }

  /**
   * Get the current context
   */
  getContext(): OrchestrationContext {
    return { ...this.context };
  }

  /**
   * Get the configuration
   */
  getConfig(): EffectiveConfig {
    return this.config;
  }

  /**
   * Get transition history
   */
  getTransitionHistory(): readonly TransitionResult[] {
    return this.transitionHistory;
  }

  /**
   * Get human-readable description of current state
   */
  getStateDescription(): string {
    return getStateDescription(this.context.currentState);
  }

  /**
   * Get legacy phase name for current state
   */
  getCurrentPhase(): string {
    return stateToPhase(this.context.currentState);
  }

  /**
   * Check if orchestration is complete
   */
  isComplete(): boolean {
    return isTerminalState(this.context.currentState);
  }

  /**
   * Process an event and transition to a new state
   */
  processEvent(event: OrchestrationEvent): TransitionResult {
    const result = transition(this.context, event);

    // Update context if transition was valid
    if (result.valid) {
      this.context = result.context;
      this.transitionHistory.push(result);

      const fromState = this.transitionHistory.length > 1
        ? this.transitionHistory[this.transitionHistory.length - 2].newState
        : 'IDLE';
      this.deps.logger.event('phase_started', result.description, {
        fromState,
        toState: result.newState,
        eventType: event.type,
      });
    } else {
      this.deps.logger.warn(`Invalid transition: ${result.description}`, {
        currentState: this.context.currentState,
        eventType: event.type,
      });
    }

    return result;
  }

  /**
   * Start a new orchestration run
   */
  start(requirements: string): OrchestratorStepResult {
    const result = this.processEvent({ type: 'START_PLAN', requirements });

    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Resume from a saved state
   */
  resume(savedState: OrchestratorRunState): OrchestratorStepResult {
    // Restore context and history
    this.context = { ...savedState.context };
    this.transitionHistory = [...savedState.transitionHistory];

    // Process resume event to log the resumption
    const result = this.processEvent({
      type: 'RESUME',
      fromState: savedState.context.currentState,
    });

    return {
      success: result.valid,
      state: this.context.currentState,
      description: `Resumed from ${savedState.context.currentState}`,
      isComplete: isTerminalState(this.context.currentState),
    };
  }

  /**
   * Get the serializable run state for persistence
   */
  getRunState(): OrchestratorRunState {
    return {
      context: { ...this.context },
      config: this.config,
      transitionHistory: [...this.transitionHistory],
    };
  }

  /**
   * Check if plan revision should stop
   */
  checkPlanRevisionStop(hasOpenQuestions: boolean, confidence: number): StopConditionResult {
    return checkPlanRevisionStopCondition(
      this.config,
      this.context.planRevisionCount,
      hasOpenQuestions,
      confidence
    );
  }

  /**
   * Check if follow-up execution should stop
   */
  checkFollowUpStop(hasFollowUps: boolean, hasHardBlockers: boolean): StopConditionResult {
    return checkFollowUpStopCondition(
      this.config,
      this.context.followUpIterationCount,
      hasFollowUps,
      hasHardBlockers
    );
  }

  /**
   * Check if execution iteration should stop
   */
  checkExecutionIterationStop(gapsIdentified: boolean): StopConditionResult {
    return checkExecutionIterationStopCondition(
      this.config,
      this.context.execIterationCount,
      gapsIdentified
    );
  }

  /**
   * Signal that a plan was generated
   */
  onPlanGenerated(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'PLAN_GENERATED' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that open questions were found
   */
  onOpenQuestionsFound(questionCount: number): OrchestratorStepResult {
    const result = this.processEvent({ type: 'OPEN_QUESTIONS_FOUND', questionCount });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that questions were answered
   */
  onQuestionsAnswered(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'QUESTIONS_ANSWERED' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that confidence is below threshold
   */
  onConfidenceLow(confidence: number, threshold: number): OrchestratorStepResult {
    const result = this.processEvent({ type: 'CONFIDENCE_LOW', confidence, threshold });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that plan was improved
   */
  onPlanImproved(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'PLAN_IMPROVED' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that plan is complete and ready for execution
   */
  onPlanComplete(confidence: number): OrchestratorStepResult {
    const result = this.processEvent({ type: 'PLAN_COMPLETE', confidence });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal start of execution
   */
  onStartExecution(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'START_EXECUTION' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that execution is complete
   */
  onExecutionComplete(hasFollowUps: boolean, hasHardBlockers: boolean): OrchestratorStepResult {
    const result = this.processEvent({
      type: 'EXECUTION_COMPLETE',
      hasFollowUps,
      hasHardBlockers,
    });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that hard blockers were resolved
   */
  onHardBlockersResolved(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'HARD_BLOCKERS_RESOLVED' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that follow-ups are complete (for current iteration)
   */
  onFollowUpsComplete(hasMoreFollowUps: boolean): OrchestratorStepResult {
    const result = this.processEvent({
      type: 'FOLLOW_UPS_COMPLETE',
      hasFollowUps: hasMoreFollowUps,
    });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that maximum follow-ups were reached
   */
  onMaxFollowUpsReached(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'MAX_FOLLOW_UPS_REACHED' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal start of gap audit
   */
  onStartGapAudit(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'START_GAP_AUDIT' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that gap audit is complete
   */
  onGapAuditComplete(gapsIdentified: boolean): OrchestratorStepResult {
    const result = this.processEvent({ type: 'GAP_AUDIT_COMPLETE', gapsIdentified });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that gap plan is complete
   */
  onGapPlanComplete(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'GAP_PLAN_COMPLETE' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that maximum execution iterations were reached
   */
  onMaxExecIterationsReached(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'MAX_EXEC_ITERATIONS_REACHED' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that no gaps were found
   */
  onNoGapsFound(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'NO_GAPS_FOUND' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal to generate final summary
   */
  onGenerateSummary(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'GENERATE_SUMMARY' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: false,
    };
  }

  /**
   * Signal that summary is complete
   */
  onSummaryComplete(): OrchestratorStepResult {
    const result = this.processEvent({ type: 'SUMMARY_COMPLETE' });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: isTerminalState(this.context.currentState),
    };
  }

  /**
   * Signal an error
   */
  onError(error: Error): OrchestratorStepResult {
    const result = this.processEvent({ type: 'ERROR', error });
    return {
      success: result.valid,
      state: this.context.currentState,
      description: result.description,
      isComplete: true,
      error,
    };
  }

  /**
   * Get a summary of the current run
   */
  getRunSummary(): {
    state: OrchestrationState;
    phase: string;
    planRevisions: number;
    execIterations: number;
    followUpIterations: number;
    transitionCount: number;
    startedAt: string;
    lastTransitionAt: string;
  } {
    return {
      state: this.context.currentState,
      phase: this.getCurrentPhase(),
      planRevisions: this.context.planRevisionCount,
      execIterations: this.context.execIterationCount,
      followUpIterations: this.context.followUpIterationCount,
      transitionCount: this.transitionHistory.length,
      startedAt: this.context.startedAt,
      lastTransitionAt: this.context.lastTransitionAt,
    };
  }
}

/**
 * Create an Orchestrator with the given config and dependencies
 */
export function createOrchestrator(
  config: EffectiveConfig,
  deps: OrchestratorDependencies
): Orchestrator {
  return new Orchestrator(config, deps);
}

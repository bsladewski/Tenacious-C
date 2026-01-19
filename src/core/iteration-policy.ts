/**
 * Iteration Policies (F15)
 * Following ENGINEERING_GUIDE.md Section 6.2 specification
 *
 * Centralizes stop conditions and iteration limits.
 * Always produces clear outcomes when limits are reached.
 */

import { EffectiveConfig, isUnlimitedIterations } from '../types/effective-config';

/**
 * Stop condition outcomes
 */
export type StopReason =
  | 'LIMIT_REACHED'
  | 'CONDITION_MET'
  | 'NO_MORE_WORK'
  | 'CONFIDENCE_MET'
  | 'ERROR'
  | 'USER_CANCELLED';

/**
 * Result of checking a stop condition
 */
export interface StopConditionResult {
  /** Whether to stop */
  shouldStop: boolean;
  /** Reason for stopping (if shouldStop is true) */
  reason?: StopReason;
  /** Human-readable message explaining the decision */
  message: string;
  /** Suggested next steps for the user */
  nextSteps?: string[];
}

/**
 * Check if plan revision loop should stop
 */
export function checkPlanRevisionStopCondition(
  config: EffectiveConfig,
  revisionCount: number,
  hasOpenQuestions: boolean,
  confidence: number
): StopConditionResult {
  const { maxPlanIterations } = config.limits;
  const { planConfidence: confidenceThreshold } = config.thresholds;
  const unlimited = isUnlimitedIterations(config);

  // Check if confidence threshold is met and no open questions
  if (!hasOpenQuestions && confidence >= confidenceThreshold) {
    return {
      shouldStop: true,
      reason: 'CONDITION_MET',
      message: `Plan complete with ${confidence}% confidence (threshold: ${confidenceThreshold}%)`,
    };
  }

  // Check iteration limit (unless unlimited mode)
  if (!unlimited && revisionCount >= maxPlanIterations) {
    const nextSteps: string[] = [];
    if (hasOpenQuestions) {
      nextSteps.push('Answer the remaining open questions manually or resume with --resume');
    }
    if (confidence < confidenceThreshold) {
      nextSteps.push(`Improve plan confidence from ${confidence}% to ${confidenceThreshold}%`);
      nextSteps.push('Consider lowering --plan-confidence threshold');
    }
    nextSteps.push('Increase --max-plan-iterations to allow more revisions');
    nextSteps.push('Use --the-prompt-of-destiny to remove all limits');

    return {
      shouldStop: true,
      reason: 'LIMIT_REACHED',
      message: `Reached maximum plan revisions (${maxPlanIterations})`,
      nextSteps,
    };
  }

  // Continue revising
  if (hasOpenQuestions) {
    return {
      shouldStop: false,
      message: `Open questions remain, continuing revision (${revisionCount}/${unlimited ? '∞' : maxPlanIterations})`,
    };
  }

  if (confidence < confidenceThreshold) {
    return {
      shouldStop: false,
      message: `Confidence ${confidence}% below threshold ${confidenceThreshold}%, continuing improvement (${revisionCount}/${unlimited ? '∞' : maxPlanIterations})`,
    };
  }

  return {
    shouldStop: false,
    message: `Continuing plan revision (${revisionCount}/${unlimited ? '∞' : maxPlanIterations})`,
  };
}

/**
 * Check if follow-up execution loop should stop
 */
export function checkFollowUpStopCondition(
  config: EffectiveConfig,
  followUpIterationCount: number,
  hasFollowUps: boolean,
  hasHardBlockers: boolean
): StopConditionResult {
  const { maxFollowUpIterations } = config.limits;
  const unlimited = isUnlimitedIterations(config);

  // Check if no more follow-ups and no hard blockers
  if (!hasFollowUps && !hasHardBlockers) {
    return {
      shouldStop: true,
      reason: 'NO_MORE_WORK',
      message: 'All follow-ups complete',
    };
  }

  // Check iteration limit (unless unlimited mode)
  if (!unlimited && followUpIterationCount >= maxFollowUpIterations) {
    const nextSteps: string[] = [];
    if (hasFollowUps) {
      nextSteps.push('Some follow-ups remain - review execution summary for details');
    }
    if (hasHardBlockers) {
      nextSteps.push('Hard blockers need resolution - resume with --resume');
    }
    nextSteps.push('Increase --max-follow-up-iterations to allow more iterations');
    nextSteps.push('Use --the-prompt-of-destiny to remove all limits');

    return {
      shouldStop: true,
      reason: 'LIMIT_REACHED',
      message: `Reached maximum follow-up iterations (${maxFollowUpIterations})`,
      nextSteps,
    };
  }

  // Continue processing
  if (hasHardBlockers) {
    return {
      shouldStop: false,
      message: `Hard blockers detected, resolving (${followUpIterationCount}/${unlimited ? '∞' : maxFollowUpIterations})`,
    };
  }

  return {
    shouldStop: false,
    message: `Follow-ups remain, continuing (${followUpIterationCount}/${unlimited ? '∞' : maxFollowUpIterations})`,
  };
}

/**
 * Check if main execution loop should stop
 */
export function checkExecutionIterationStopCondition(
  config: EffectiveConfig,
  execIterationCount: number,
  gapsIdentified: boolean
): StopConditionResult {
  const { maxExecIterations } = config.limits;
  const unlimited = isUnlimitedIterations(config);

  // Check if no gaps found
  if (!gapsIdentified) {
    return {
      shouldStop: true,
      reason: 'CONDITION_MET',
      message: 'No gaps identified - implementation complete',
    };
  }

  // Check iteration limit (unless unlimited mode)
  if (!unlimited && execIterationCount >= maxExecIterations) {
    return {
      shouldStop: true,
      reason: 'LIMIT_REACHED',
      message: `Reached maximum execution iterations (${maxExecIterations})`,
      nextSteps: [
        'Gaps remain - review gap audit summary for details',
        'Increase --exec-iterations to allow more iterations',
        'Use --the-prompt-of-destiny to remove all limits',
        'Resume with --resume to continue where you left off',
      ],
    };
  }

  // Continue with gap plan
  return {
    shouldStop: false,
    message: `Gaps identified, creating gap plan (${execIterationCount}/${unlimited ? '∞' : maxExecIterations})`,
  };
}

/**
 * Iteration progress information
 */
export interface IterationProgress {
  /** Current iteration number */
  current: number;
  /** Maximum iterations (Infinity if unlimited) */
  max: number;
  /** Whether unlimited mode is active */
  unlimited: boolean;
  /** Formatted display string (e.g., "3/10" or "3/∞") */
  display: string;
}

/**
 * Get formatted iteration progress for plan revisions
 */
export function getPlanRevisionProgress(
  config: EffectiveConfig,
  revisionCount: number
): IterationProgress {
  const unlimited = isUnlimitedIterations(config);
  const max = unlimited ? Infinity : config.limits.maxPlanIterations;
  return {
    current: revisionCount,
    max,
    unlimited,
    display: unlimited ? `${revisionCount}/∞` : `${revisionCount}/${max}`,
  };
}

/**
 * Get formatted iteration progress for follow-ups
 */
export function getFollowUpProgress(
  config: EffectiveConfig,
  followUpIterationCount: number
): IterationProgress {
  const unlimited = isUnlimitedIterations(config);
  const max = unlimited ? Infinity : config.limits.maxFollowUpIterations;
  return {
    current: followUpIterationCount,
    max,
    unlimited,
    display: unlimited ? `${followUpIterationCount}/∞` : `${followUpIterationCount}/${max}`,
  };
}

/**
 * Get formatted iteration progress for execution iterations
 */
export function getExecutionIterationProgress(
  config: EffectiveConfig,
  execIterationCount: number
): IterationProgress {
  const unlimited = isUnlimitedIterations(config);
  const max = unlimited ? Infinity : config.limits.maxExecIterations;
  return {
    current: execIterationCount,
    max,
    unlimited,
    display: unlimited ? `${execIterationCount}/∞` : `${execIterationCount}/${max}`,
  };
}

/**
 * Format a limit for display (handles both limited and unlimited cases)
 */
export function formatLimit(value: number, unlimited: boolean): string {
  if (unlimited) {
    return '∞';
  }
  return value.toString();
}

/**
 * Calculate remaining iterations
 */
export function getRemainingIterations(
  current: number,
  max: number,
  unlimited: boolean
): number | typeof Infinity {
  if (unlimited) {
    return Infinity;
  }
  return Math.max(0, max - current);
}

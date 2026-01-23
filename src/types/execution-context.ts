/**
 * Execution context passed to CLI tools to provide phase and iteration information
 */
export interface ExecutionContext {
  /**
   * Current phase of execution
   */
  phase: 'plan-generation' | 'answer-questions' | 'improve-plan' |
         'execute-plan' | 'execute-follow-ups' | 'gap-audit' | 'gap-plan' | 'generate-summary' | 'tool-curation';

  /**
   * Output directory for this operation
   */
  outputDirectory: string;

  /**
   * For plan phases: which revision iteration (0 = initial, 1 = first revision, etc.)
   */
  revisionIteration?: number;

  /**
   * For execution phases: which execution iteration (1 = first, 2 = after gap plan, etc.)
   */
  executionIteration?: number;

  /**
   * For follow-up phases: which follow-up iteration (0, 1, 2, etc.)
   */
  followUpIteration?: number;

  /**
   * For answer-questions: how many times questions have been answered so far
   */
  questionAnswerIteration?: number;

  /**
   * For improve-plan: how many times the plan has been improved so far
   */
  improvePlanIteration?: number;

  /**
   * For gap-audit: which gap audit iteration
   */
  gapAuditIteration?: number;
}

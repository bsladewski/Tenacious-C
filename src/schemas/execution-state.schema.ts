/**
 * Execution state schema for resuming interrupted runs
 */

export interface ExecutionState {
  /**
   * Timestamp directory for this run
   */
  timestampDirectory: string;
  
  /**
   * Original requirements (input)
   */
  requirements: string;
  
  /**
   * Current phase of execution
   */
  phase: 'plan-generation' | 'plan-revision' | 'execution' | 'gap-audit' | 'gap-plan' | 'complete';
  
  /**
   * Plan generation state
   */
  planGeneration?: {
    revisionCount: number;
    planPath: string;
    outputDirectory: string;
  };
  
  /**
   * Execution state
   */
  execution?: {
    execIterationCount: number;
    currentPlanPath: string;
    executeOutputDirectory: string;
    followUpIterationCount: number;
    hasDoneIteration0: boolean;
  };
  
  /**
   * Gap audit state
   */
  gapAudit?: {
    execIterationCount: number;
    gapAuditOutputDirectory: string;
  };
  
  /**
   * Gap plan state
   */
  gapPlan?: {
    execIterationCount: number;
    gapPlanOutputDirectory: string;
  };
  
  /**
   * Configuration used for this run
   */
  config: {
    maxRevisions: number;
    planConfidenceThreshold: number;
    maxFollowUpIterations: number;
    execIterations: number;
    isDestinyMode: boolean;
    cliTool: CliToolType | null;
    previewPlan: boolean;
    planModel: string | null;
    executeModel: string | null;
    auditModel: string | null;
    planCliTool: CliToolType | null;
    executeCliTool: CliToolType | null;
    auditCliTool: CliToolType | null;
  };
  
  /**
   * Timestamp when state was last saved
   */
  lastSaved: string;
}

export type CliToolType = 'codex' | 'copilot' | 'cursor' | 'claude';

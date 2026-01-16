import { ExecutionState, CliToolType } from '../schemas/execution-state.schema';

/**
 * Create a new execution state object
 */
export function createExecutionState(
  timestampDirectory: string,
  requirements: string,
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
  },
  phase: ExecutionState['phase'] = 'plan-generation'
): ExecutionState {
  return {
    timestampDirectory,
    requirements,
    phase,
    config,
    lastSaved: new Date().toISOString(),
  };
}

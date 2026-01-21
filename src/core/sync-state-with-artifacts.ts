import { ExecutionState } from '../schemas/execution-state.schema';
import { getExecutionArtifacts } from '../io/scan-execution-artifacts';

/**
 * Sync execution state with artifacts to ensure state reflects reality
 * @param state - Current execution state
 * @param executeOutputDirectory - Directory containing execution artifacts
 * @param executionIteration - The execution iteration number
 * @returns Updated state synced with artifacts, or original state if no changes needed
 */
export function syncStateWithArtifacts(
  state: ExecutionState,
  executeOutputDirectory: string,
  executionIteration: number
): ExecutionState {
  if (!state.execution) {
    return state;
  }

  // Scan artifacts to get actual progress
  const artifacts = getExecutionArtifacts(executeOutputDirectory, executionIteration);

  // Determine artifact-based values
  // followUpIterationCount represents the NEXT iteration to execute, so we add 1 to the last completed iteration
  // This matches how the state is initialized in orchestrator-plan.ts
  const artifactFollowUpIteration = artifacts.lastFollowUpIteration !== null
    ? artifacts.lastFollowUpIteration + 1
    : 0;
  const artifactHasDoneIteration0 = artifacts.hasDoneIteration0;

  // Get current state values
  const stateFollowUpIteration = state.execution.followUpIterationCount || 0;
  const stateHasDoneIteration0 = state.execution.hasDoneIteration0 || false;

  // Check for mismatches and log warnings
  // Only warn on genuine mismatches, not when state has default values (0/false) and artifacts have values
  // This is expected right after execution completes for the first time
  const hasMismatch = artifactFollowUpIteration !== stateFollowUpIteration ||
                      artifactHasDoneIteration0 !== stateHasDoneIteration0;

  // Only warn if state has non-default values that don't match artifacts
  // Don't warn if state has default values (0/false) - that's expected after first execution
  const stateHasNonDefaultValues = stateFollowUpIteration > 0 || stateHasDoneIteration0 === true;
  const isGenuineMismatch = hasMismatch && stateHasNonDefaultValues;

  if (isGenuineMismatch) {
    if (artifactFollowUpIteration !== stateFollowUpIteration) {
      console.log(`\n⚠️  State/artifact mismatch: followUpIterationCount is ${stateFollowUpIteration} in state but ${artifactFollowUpIteration} in artifacts. Using artifact value.`);
    }

    if (artifactHasDoneIteration0 !== stateHasDoneIteration0) {
      console.log(`\n⚠️  State/artifact mismatch: hasDoneIteration0 is ${stateHasDoneIteration0} in state but ${artifactHasDoneIteration0} in artifacts. Using artifact value.`);
    }
  }

  // Only create new state if values actually changed
  if (artifactFollowUpIteration === stateFollowUpIteration &&
      artifactHasDoneIteration0 === stateHasDoneIteration0) {
    return state; // No changes needed
  }

  // Update state with artifact-based values (artifacts are source of truth)
  return {
    ...state,
    execution: {
      ...state.execution,
      followUpIterationCount: artifactFollowUpIteration,
      hasDoneIteration0: artifactHasDoneIteration0,
    },
  };
}

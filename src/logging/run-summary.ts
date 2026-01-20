/**
 * Run Summary Generator (Phase 9.5)
 * Generates structured summary artifacts for completed runs
 */

import { OrchestrationContext, OrchestrationState, TransitionResult } from '../core/state-machine';
import { EffectiveConfig } from '../types/effective-config';
import { EngineResult } from '../types/engine-result';

/**
 * Engine invocation record for the summary
 */
export interface EngineInvocationRecord {
  /** Phase during which the engine was invoked */
  phase: string;
  /** Engine name */
  engine: string;
  /** Model used (if any) */
  model?: string;
  /** Exit code */
  exitCode: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the invocation was interrupted */
  interrupted: boolean;
  /** Start time (ISO 8601) */
  startedAt: string;
  /** End time (ISO 8601) */
  endedAt: string;
}

/**
 * Iteration summary for the run
 */
export interface IterationSummary {
  /** Plan revision count */
  planRevisions: number;
  /** Execution iteration count */
  execIterations: number;
  /** Follow-up iterations per execution iteration */
  followUpIterations: number[];
  /** Gap audit count */
  gapAudits: number;
}

/**
 * Run summary data structure
 */
export interface RunSummary {
  /** Schema version */
  schemaVersion: '1.0.0';
  /** Run ID */
  runId: string;
  /** Final state of the orchestration */
  finalState: OrchestrationState;
  /** Whether the run was successful */
  success: boolean;
  /** Start time (ISO 8601) */
  startedAt: string;
  /** End time (ISO 8601) */
  endedAt: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Iteration summary */
  iterations: IterationSummary;
  /** Engine invocation history */
  engineInvocations: EngineInvocationRecord[];
  /** Transition history (condensed) */
  transitionCount: number;
  /** Final error if failed */
  error?: string;
  /** Configuration summary */
  config: {
    tools: EffectiveConfig['tools'];
    limits: EffectiveConfig['limits'];
    thresholds: EffectiveConfig['thresholds'];
    unlimitedMode: boolean;
  };
}

/**
 * Builder for collecting run summary data
 */
export class RunSummaryBuilder {
  private runId: string;
  private startedAt: string;
  private config: EffectiveConfig;
  private engineInvocations: EngineInvocationRecord[] = [];
  private followUpIterationsPerExec: Map<number, number> = new Map();

  constructor(runId: string, config: EffectiveConfig) {
    this.runId = runId;
    this.startedAt = new Date().toISOString();
    this.config = config;
  }

  /**
   * Record an engine invocation
   */
  recordEngineInvocation(phase: string, result: EngineResult): void {
    this.engineInvocations.push({
      phase,
      engine: result.modelUsed ? `${result.invocation?.command ?? 'unknown'}:${result.modelUsed}` : result.invocation?.command ?? 'unknown',
      model: result.modelUsed,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      interrupted: result.interrupted ?? false,
      startedAt: result.invocation?.startedAt ?? this.startedAt,
      endedAt: result.invocation?.endedAt ?? new Date().toISOString(),
    });
  }

  /**
   * Record follow-up iteration count for an execution iteration
   */
  recordFollowUpIterations(execIteration: number, followUpCount: number): void {
    this.followUpIterationsPerExec.set(execIteration, followUpCount);
  }

  /**
   * Build the final summary
   */
  build(
    context: OrchestrationContext,
    transitionHistory: readonly TransitionResult[]
  ): RunSummary {
    const endedAt = new Date().toISOString();
    const startMs = new Date(this.startedAt).getTime();
    const endMs = new Date(endedAt).getTime();

    // Convert follow-up map to array
    const followUpIterations: number[] = [];
    for (let i = 1; i <= context.execIterationCount; i++) {
      followUpIterations.push(this.followUpIterationsPerExec.get(i) ?? 0);
    }

    return {
      schemaVersion: '1.0.0',
      runId: this.runId,
      finalState: context.currentState,
      success: context.currentState === 'COMPLETE',
      startedAt: this.startedAt,
      endedAt,
      durationMs: endMs - startMs,
      iterations: {
        planRevisions: context.planRevisionCount,
        execIterations: context.execIterationCount,
        followUpIterations,
        gapAudits: context.execIterationCount > 0 ? context.execIterationCount - 1 : 0,
      },
      engineInvocations: this.engineInvocations,
      transitionCount: transitionHistory.length,
      error: context.lastError?.message,
      config: {
        tools: this.config.tools,
        limits: this.config.limits,
        thresholds: this.config.thresholds,
        unlimitedMode: this.config.runMode.unlimitedIterations,
      },
    };
  }
}

/**
 * Format run summary as markdown
 */
export function formatRunSummaryMarkdown(summary: RunSummary): string {
  const lines: string[] = [
    '# Run Summary',
    '',
    `**Run ID:** ${summary.runId}`,
    `**Status:** ${summary.success ? '✅ Success' : '❌ Failed'}`,
    `**Final State:** ${summary.finalState}`,
    `**Duration:** ${formatDuration(summary.durationMs)}`,
    '',
    '## Timeline',
    '',
    `- Started: ${summary.startedAt}`,
    `- Ended: ${summary.endedAt}`,
    '',
    '## Iterations',
    '',
    `- Plan Revisions: ${summary.iterations.planRevisions}`,
    `- Execution Iterations: ${summary.iterations.execIterations}`,
  ];

  if (summary.iterations.followUpIterations.length > 0) {
    lines.push(`- Follow-up Iterations: ${summary.iterations.followUpIterations.join(', ')}`);
  }

  lines.push(`- Gap Audits: ${summary.iterations.gapAudits}`);
  lines.push('');
  lines.push('## Configuration');
  lines.push('');
  lines.push(`- Plan Tool: ${summary.config.tools.plan}`);
  lines.push(`- Execute Tool: ${summary.config.tools.execute}`);
  lines.push(`- Audit Tool: ${summary.config.tools.audit}`);
  lines.push(`- Max Plan Iterations: ${formatLimit(summary.config.limits.maxPlanIterations)}`);
  lines.push(`- Max Exec Iterations: ${formatLimit(summary.config.limits.maxExecIterations)}`);
  lines.push(`- Max Follow-up Iterations: ${formatLimit(summary.config.limits.maxFollowUpIterations)}`);
  lines.push(`- Plan Confidence Threshold: ${summary.config.thresholds.planConfidence}%`);
  lines.push(`- Unlimited Mode: ${summary.config.unlimitedMode ? 'Yes' : 'No'}`);

  if (summary.engineInvocations.length > 0) {
    lines.push('');
    lines.push('## Engine Invocations');
    lines.push('');
    lines.push('| Phase | Engine | Duration | Exit Code | Status |');
    lines.push('|-------|--------|----------|-----------|--------|');

    for (const inv of summary.engineInvocations) {
      const status = inv.interrupted ? 'Interrupted' : inv.exitCode === 0 ? 'Success' : 'Failed';
      lines.push(`| ${inv.phase} | ${inv.engine} | ${formatDuration(inv.durationMs)} | ${inv.exitCode} | ${status} |`);
    }
  }

  if (summary.error) {
    lines.push('');
    lines.push('## Error');
    lines.push('');
    lines.push('```');
    lines.push(summary.error);
    lines.push('```');
  }

  lines.push('');
  lines.push('---');
  lines.push(`*Generated at ${new Date().toISOString()}*`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format a limit value, handling MAX_SAFE_INTEGER
 */
function formatLimit(value: number): string {
  if (value === Number.MAX_SAFE_INTEGER) {
    return '∞ (unlimited)';
  }
  return String(value);
}

/**
 * Create a run summary builder
 */
export function createRunSummaryBuilder(runId: string, config: EffectiveConfig): RunSummaryBuilder {
  return new RunSummaryBuilder(runId, config);
}

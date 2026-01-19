/**
 * Write Effective Config Artifact (F13, F25)
 * Writes the resolved configuration as an artifact for reproducibility
 * Redacts any sensitive values
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { EffectiveConfig, redactConfigForLogging } from '../types/effective-config';

/**
 * Write the effective config artifact to the run directory
 */
export function writeEffectiveConfigArtifact(
  config: EffectiveConfig,
  runDirectory: string
): string {
  // Redact any sensitive values
  const redactedConfig = redactConfigForLogging(config);

  // Prepare the artifact content
  const artifact = {
    schemaVersion: '1.0.0',
    artifactType: 'effective-config',
    generatedAt: new Date().toISOString(),
    runId: config.runId,
    config: redactedConfig,
  };

  // Ensure directory exists
  mkdirSync(runDirectory, { recursive: true });

  // Write the artifact
  const artifactPath = join(runDirectory, 'effective-config.json');
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf-8');

  return artifactPath;
}

/**
 * Format effective config for human-readable display
 */
export function formatEffectiveConfigForDisplay(config: EffectiveConfig): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    EFFECTIVE CONFIGURATION');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Run info
  lines.push(`Run ID:              ${config.runId}`);
  lines.push(`Working Directory:   ${config.paths.workingDirectory}`);
  lines.push(`Resolved At:         ${config.resolvedAt}`);
  lines.push('');

  // Limits
  lines.push('┌─ Iteration Limits ──────────────────────────────────────────┐');
  const unlimited = config.runMode.unlimitedIterations;
  lines.push(`│ Max Plan Iterations:      ${unlimited ? '∞ (unlimited)' : config.limits.maxPlanIterations}`);
  lines.push(`│ Max Exec Iterations:      ${unlimited ? '∞ (unlimited)' : config.limits.maxExecIterations}`);
  lines.push(`│ Max Follow-up Iterations: ${unlimited ? '∞ (unlimited)' : config.limits.maxFollowUpIterations}`);
  lines.push(`│ Plan Confidence Threshold: ${config.thresholds.planConfidence}%`);
  lines.push('└──────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Tools
  lines.push('┌─ CLI Tools ─────────────────────────────────────────────────┐');
  lines.push(`│ Plan:    ${config.tools.plan}${config.models.plan ? ` (model: ${config.models.plan})` : ''}`);
  lines.push(`│ Execute: ${config.tools.execute}${config.models.execute ? ` (model: ${config.models.execute})` : ''}`);
  lines.push(`│ Audit:   ${config.tools.audit}${config.models.audit ? ` (model: ${config.models.audit})` : ''}`);
  if (config.fallback.fallbackTools.length > 0) {
    lines.push(`│ Fallbacks: ${config.fallback.fallbackTools.join(', ')}`);
  }
  lines.push('└──────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Modes
  lines.push('┌─ Run Mode ──────────────────────────────────────────────────┐');
  lines.push(`│ Interactive:     ${config.interactivity.interactive ? 'yes' : 'no'}`);
  lines.push(`│ Preview Plan:    ${config.interactivity.previewPlan ? 'yes' : 'no'}`);
  lines.push(`│ Unlimited Mode:  ${config.runMode.unlimitedIterations ? 'yes (prompt of destiny)' : 'no'}`);
  lines.push(`│ Mock Mode:       ${config.runMode.mockMode ? 'yes' : 'no'}`);
  lines.push(`│ Resume:          ${config.runMode.resume ? 'yes' : 'no'}`);
  lines.push('└──────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Verbosity
  if (config.verbosity.verbose || config.verbosity.debug) {
    lines.push('┌─ Verbosity ─────────────────────────────────────────────────┐');
    lines.push(`│ Verbose: ${config.verbosity.verbose ? 'yes' : 'no'}`);
    lines.push(`│ Debug:   ${config.verbosity.debug ? 'yes' : 'no'}`);
    lines.push(`│ JSON:    ${config.verbosity.jsonOutput ? 'yes' : 'no'}`);
    lines.push('└──────────────────────────────────────────────────────────────┘');
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

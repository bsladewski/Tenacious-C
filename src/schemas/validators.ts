/**
 * Schema Validation with Zod (Phase 7)
 * Provides runtime validation for all artifact schemas
 */

import { z } from 'zod';
import type { PlanMetadata } from './plan-metadata.schema';
import type { ExecuteMetadata } from './execute-metadata.schema';
import type { GapAuditMetadata } from './gap-audit-metadata.schema';
import type { ToolCurationMetadata } from './tool-curation-metadata.schema';

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

// =============================================================================
// Plan Metadata Schema
// =============================================================================

const openQuestionSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  suggestedAnswers: z.array(z.string().min(1)).optional(),
});

const planMetadataSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  confidence: z.number().min(0).max(100),
  openQuestions: z.array(openQuestionSchema).default([]),
  summary: z.string().min(1).max(3000),
});

/**
 * Validate plan metadata
 */
export function validatePlanMetadata(data: unknown): ValidationResult<PlanMetadata> {
  const result = planMetadataSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as PlanMetadata };
  }
  return {
    success: false,
    errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Parse plan metadata from JSON string
 */
export function parsePlanMetadata(json: string): ValidationResult<PlanMetadata> {
  try {
    const data = JSON.parse(json);
    return validatePlanMetadata(data);
  } catch (e) {
    return {
      success: false,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

// =============================================================================
// Execute Metadata Schema
// =============================================================================

const hardBlockerSchema = z.object({
  description: z.string().min(1, 'Description cannot be empty'),
  reason: z.string().min(1, 'Reason cannot be empty'),
});

const executeMetadataSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  hasFollowUps: z.boolean(),
  hardBlockers: z.array(hardBlockerSchema).default([]),
  summary: z.string().min(1).max(3000),
});

/**
 * Validate execute metadata
 */
export function validateExecuteMetadata(data: unknown): ValidationResult<ExecuteMetadata> {
  const result = executeMetadataSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as ExecuteMetadata };
  }
  return {
    success: false,
    errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Parse execute metadata from JSON string
 */
export function parseExecuteMetadata(json: string): ValidationResult<ExecuteMetadata> {
  try {
    const data = JSON.parse(json);
    return validateExecuteMetadata(data);
  } catch (e) {
    return {
      success: false,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

// =============================================================================
// Gap Audit Metadata Schema
// =============================================================================

const gapAuditMetadataSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  gapsIdentified: z.boolean(),
  summary: z.string().min(1).max(3000),
});

/**
 * Validate gap audit metadata
 */
export function validateGapAuditMetadata(data: unknown): ValidationResult<GapAuditMetadata> {
  const result = gapAuditMetadataSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as GapAuditMetadata };
  }
  return {
    success: false,
    errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Parse gap audit metadata from JSON string
 */
export function parseGapAuditMetadata(json: string): ValidationResult<GapAuditMetadata> {
  try {
    const data = JSON.parse(json);
    return validateGapAuditMetadata(data);
  } catch (e) {
    return {
      success: false,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

// =============================================================================
// Tool Curation Metadata Schema
// =============================================================================

const toolCurationMetadataSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  summary: z.string().min(1).max(1000),
});

/**
 * Validate tool curation metadata
 */
export function validateToolCurationMetadata(data: unknown): ValidationResult<ToolCurationMetadata> {
  const result = toolCurationMetadataSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as ToolCurationMetadata };
  }
  return {
    success: false,
    errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Parse tool curation metadata from JSON string
 */
export function parseToolCurationMetadata(json: string): ValidationResult<ToolCurationMetadata> {
  try {
    const data = JSON.parse(json);
    return validateToolCurationMetadata(data);
  } catch (e) {
    return {
      success: false,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

// =============================================================================
// Effective Config Schema (subset for validation)
// =============================================================================

const cliToolNameSchema = z.enum(['codex', 'copilot', 'cursor', 'claude', 'mock']);

const effectiveConfigSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  input: z.string(),
  runId: z.string(),
  resolvedAt: z.string(),
  limits: z.object({
    maxPlanIterations: z.number().positive(),
    maxExecIterations: z.number().positive(),
    maxFollowUpIterations: z.number().positive(),
    maxGapAuditIterations: z.number().positive(),
  }),
  thresholds: z.object({
    planConfidence: z.number().min(0).max(100),
  }),
  tools: z.object({
    plan: cliToolNameSchema,
    execute: cliToolNameSchema,
    audit: cliToolNameSchema,
  }),
  models: z.object({
    plan: z.string().optional(),
    execute: z.string().optional(),
    audit: z.string().optional(),
  }),
  verbosity: z.object({
    verbose: z.boolean(),
    debug: z.boolean(),
    jsonOutput: z.boolean(),
  }),
  interactivity: z.object({
    interactive: z.boolean(),
    previewPlan: z.boolean(),
  }),
  runMode: z.object({
    resume: z.boolean(),
    unlimitedIterations: z.boolean(),
    mockMode: z.boolean(),
  }),
  fallback: z.object({
    fallbackTools: z.array(cliToolNameSchema),
    maxRetries: z.number().nonnegative(),
    retryDelayMs: z.number().nonnegative(),
  }),
  paths: z.object({
    workingDirectory: z.string(),
    artifactBaseDir: z.string(),
    runDirectory: z.string().optional(),
  }),
  sources: z.record(z.string(), z.enum(['cli', 'per-run', 'repo', 'user', 'default'])).optional(),
});

/**
 * Validate effective config
 */
export function validateEffectiveConfig(
  data: unknown
): ValidationResult<z.infer<typeof effectiveConfigSchema>> {
  const result = effectiveConfigSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

// =============================================================================
// Execution State Schema
// =============================================================================

const executionStateSchema = z.object({
  version: z.literal('1.0.0'),
  timestampDirectory: z.string(),
  requirements: z.string(),
  config: z.object({
    maxRevisions: z.number(),
    planConfidenceThreshold: z.number(),
    maxFollowUpIterations: z.number(),
    execIterations: z.number(),
    isDestinyMode: z.boolean(),
    cliTool: cliToolNameSchema.nullable(),
    previewPlan: z.boolean(),
    planModel: z.string().nullable().optional(),
    executeModel: z.string().nullable().optional(),
    auditModel: z.string().nullable().optional(),
    planCliTool: cliToolNameSchema.nullable().optional(),
    executeCliTool: cliToolNameSchema.nullable().optional(),
    auditCliTool: cliToolNameSchema.nullable().optional(),
    fallbackCliTools: z.array(cliToolNameSchema).optional(),
  }),
  phase: z.enum([
    'plan-generation',
    'plan-revision',
    'execution',
    'gap-audit',
    'gap-plan',
    'complete',
  ]),
  planGeneration: z
    .object({
      revisionCount: z.number(),
      planPath: z.string(),
      outputDirectory: z.string(),
    })
    .optional(),
  execution: z
    .object({
      execIterationCount: z.number(),
      currentPlanPath: z.string(),
      executeOutputDirectory: z.string(),
      followUpIterationCount: z.number(),
      hasDoneIteration0: z.boolean(),
    })
    .optional(),
  gapAudit: z
    .object({
      execIterationCount: z.number(),
      gapAuditOutputDirectory: z.string(),
    })
    .optional(),
  gapPlan: z
    .object({
      execIterationCount: z.number(),
      gapPlanOutputDirectory: z.string(),
    })
    .optional(),
  lastSaved: z.string(),
});

/**
 * Validate execution state
 */
export function validateExecutionState(
  data: unknown
): ValidationResult<z.infer<typeof executionStateSchema>> {
  const result = executionStateSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Parse execution state from JSON string
 */
export function parseExecutionState(
  json: string
): ValidationResult<z.infer<typeof executionStateSchema>> {
  try {
    const data = JSON.parse(json);
    return validateExecutionState(data);
  } catch (e) {
    return {
      success: false,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

// =============================================================================
// Generic validation utilities
// =============================================================================

/**
 * Artifact types that can be validated
 */
export type ValidatableArtifactType =
  | 'plan-metadata'
  | 'execute-metadata'
  | 'gap-audit-metadata'
  | 'tool-curation-metadata'
  | 'effective-config'
  | 'execution-state';

/**
 * Validate an artifact by type
 */
export function validateArtifact(
  type: ValidatableArtifactType,
  data: unknown
): ValidationResult<unknown> {
  switch (type) {
    case 'plan-metadata':
      return validatePlanMetadata(data);
    case 'execute-metadata':
      return validateExecuteMetadata(data);
    case 'gap-audit-metadata':
      return validateGapAuditMetadata(data);
    case 'tool-curation-metadata':
      return validateToolCurationMetadata(data);
    case 'effective-config':
      return validateEffectiveConfig(data);
    case 'execution-state':
      return validateExecutionState(data);
  }
}

/**
 * Parse and validate a JSON artifact by type
 */
export function parseArtifact(
  type: ValidatableArtifactType,
  json: string
): ValidationResult<unknown> {
  try {
    const data = JSON.parse(json);
    return validateArtifact(type, data);
  } catch (e) {
    return {
      success: false,
      errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

// Export schemas for use in tests
export {
  planMetadataSchema,
  executeMetadataSchema,
  gapAuditMetadataSchema,
  toolCurationMetadataSchema,
  effectiveConfigSchema,
  executionStateSchema,
  openQuestionSchema,
  hardBlockerSchema,
  cliToolNameSchema,
};

/**
 * Tests for Schema Validators
 */

import { describe, it, expect } from 'vitest';
import {
  validatePlanMetadata,
  parsePlanMetadata,
  validateExecuteMetadata,
  parseExecuteMetadata,
  validateGapAuditMetadata,
  parseGapAuditMetadata,
  validateEffectiveConfig,
  validateExecutionState,
  parseExecutionState,
  validateArtifact,
  parseArtifact,
} from './validators';

describe('validatePlanMetadata', () => {
  it('should validate correct plan metadata', () => {
    const data = {
      schemaVersion: '1.0.0' as const,
      confidence: 90,
      openQuestions: [],
      summary: 'This is a test summary',
    };
    const result = validatePlanMetadata(data);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(data);
  });

  it('should validate plan metadata with open questions', () => {
    const data = {
      schemaVersion: '1.0.0' as const,
      confidence: 80,
      openQuestions: [
        { question: 'What framework?', suggestedAnswers: ['React', 'Vue'] },
        { question: 'Database type?' },
      ],
      summary: 'Test summary',
    };
    const result = validatePlanMetadata(data);
    expect(result.success).toBe(true);
  });

  it('should reject confidence below 0', () => {
    const data = { schemaVersion: '1.0.0' as const, confidence: -10, openQuestions: [], summary: 'Test' };
    const result = validatePlanMetadata(data);
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('should reject confidence above 100', () => {
    const data = { schemaVersion: '1.0.0' as const, confidence: 150, openQuestions: [], summary: 'Test' };
    const result = validatePlanMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject empty summary', () => {
    const data = { schemaVersion: '1.0.0' as const, confidence: 90, openQuestions: [], summary: '' };
    const result = validatePlanMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject summary longer than 3000 chars', () => {
    const data = { schemaVersion: '1.0.0' as const, confidence: 90, openQuestions: [], summary: 'x'.repeat(3001) };
    const result = validatePlanMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const result = validatePlanMetadata({});
    expect(result.success).toBe(false);
  });

  it('should reject missing schemaVersion', () => {
    const data = { confidence: 90, openQuestions: [], summary: 'Test' };
    const result = validatePlanMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid schemaVersion', () => {
    const data = { schemaVersion: '2.0.0', confidence: 90, openQuestions: [], summary: 'Test' };
    const result = validatePlanMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should default openQuestions to empty array', () => {
    const data = { schemaVersion: '1.0.0' as const, confidence: 90, summary: 'Test summary' };
    const result = validatePlanMetadata(data);
    expect(result.success).toBe(true);
    expect(result.data?.openQuestions).toEqual([]);
  });
});

describe('parsePlanMetadata', () => {
  it('should parse valid JSON', () => {
    const json = JSON.stringify({
      schemaVersion: '1.0.0',
      confidence: 90,
      openQuestions: [],
      summary: 'Test',
    });
    const result = parsePlanMetadata(json);
    expect(result.success).toBe(true);
  });

  it('should reject invalid JSON', () => {
    const result = parsePlanMetadata('not valid json');
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Invalid JSON');
  });
});

describe('validateExecuteMetadata', () => {
  it('should validate correct execute metadata', () => {
    const data = {
      schemaVersion: '1.0.0' as const,
      hasFollowUps: false,
      hardBlockers: [],
      summary: 'Execution completed successfully',
    };
    const result = validateExecuteMetadata(data);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(data);
  });

  it('should validate execute metadata with hard blockers', () => {
    const data = {
      schemaVersion: '1.0.0' as const,
      hasFollowUps: true,
      hardBlockers: [
        { description: 'Missing dependency', reason: 'npm install failed' },
      ],
      summary: 'Execution blocked',
    };
    const result = validateExecuteMetadata(data);
    expect(result.success).toBe(true);
  });

  it('should reject hard blocker with empty description', () => {
    const data = {
      schemaVersion: '1.0.0' as const,
      hasFollowUps: true,
      hardBlockers: [{ description: '', reason: 'test' }],
      summary: 'Test',
    };
    const result = validateExecuteMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject hard blocker with empty reason', () => {
    const data = {
      schemaVersion: '1.0.0' as const,
      hasFollowUps: true,
      hardBlockers: [{ description: 'test', reason: '' }],
      summary: 'Test',
    };
    const result = validateExecuteMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing hasFollowUps', () => {
    const data = { schemaVersion: '1.0.0' as const, hardBlockers: [], summary: 'Test' };
    const result = validateExecuteMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing schemaVersion', () => {
    const data = { hasFollowUps: false, hardBlockers: [], summary: 'Test' };
    const result = validateExecuteMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid schemaVersion', () => {
    const data = { schemaVersion: '2.0.0', hasFollowUps: false, hardBlockers: [], summary: 'Test' };
    const result = validateExecuteMetadata(data);
    expect(result.success).toBe(false);
  });
});

describe('parseExecuteMetadata', () => {
  it('should parse valid JSON', () => {
    const json = JSON.stringify({
      schemaVersion: '1.0.0',
      hasFollowUps: false,
      hardBlockers: [],
      summary: 'Test',
    });
    const result = parseExecuteMetadata(json);
    expect(result.success).toBe(true);
  });

  it('should reject invalid JSON', () => {
    const result = parseExecuteMetadata('{invalid');
    expect(result.success).toBe(false);
  });
});

describe('validateGapAuditMetadata', () => {
  it('should validate correct gap audit metadata', () => {
    const data = {
      schemaVersion: '1.0.0' as const,
      gapsIdentified: true,
      summary: 'Found 3 gaps in authentication module',
    };
    const result = validateGapAuditMetadata(data);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(data);
  });

  it('should validate gap audit metadata with no gaps', () => {
    const data = {
      schemaVersion: '1.0.0' as const,
      gapsIdentified: false,
      summary: 'No gaps found',
    };
    const result = validateGapAuditMetadata(data);
    expect(result.success).toBe(true);
  });

  it('should reject missing gapsIdentified', () => {
    const data = { schemaVersion: '1.0.0' as const, summary: 'Test' };
    const result = validateGapAuditMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject empty summary', () => {
    const data = { schemaVersion: '1.0.0' as const, gapsIdentified: false, summary: '' };
    const result = validateGapAuditMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing schemaVersion', () => {
    const data = { gapsIdentified: false, summary: 'Test' };
    const result = validateGapAuditMetadata(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid schemaVersion', () => {
    const data = { schemaVersion: '2.0.0', gapsIdentified: false, summary: 'Test' };
    const result = validateGapAuditMetadata(data);
    expect(result.success).toBe(false);
  });
});

describe('parseGapAuditMetadata', () => {
  it('should parse valid JSON', () => {
    const json = JSON.stringify({ schemaVersion: '1.0.0', gapsIdentified: false, summary: 'Test' });
    const result = parseGapAuditMetadata(json);
    expect(result.success).toBe(true);
  });
});

describe('validateEffectiveConfig', () => {
  const validConfig = {
    schemaVersion: '1.0.0' as const,
    input: 'test input',
    runId: 'test-run-123',
    resolvedAt: '2025-01-01T00:00:00Z',
    limits: {
      maxPlanIterations: 10,
      maxExecIterations: 5,
      maxFollowUpIterations: 10,
      maxGapAuditIterations: 5,
    },
    thresholds: {
      planConfidence: 85,
    },
    tools: {
      plan: 'cursor' as const,
      execute: 'cursor' as const,
      audit: 'cursor' as const,
    },
    models: {},
    verbosity: {
      verbose: false,
      debug: false,
      jsonOutput: false,
    },
    interactivity: {
      interactive: true,
      previewPlan: false,
    },
    runMode: {
      resume: false,
      unlimitedIterations: false,
      mockMode: false,
    },
    fallback: {
      fallbackTools: [],
      maxRetries: 3,
      retryDelayMs: 1000,
    },
    paths: {
      workingDirectory: '/test',
      artifactBaseDir: '/test/.tenacious-c',
    },
  };

  it('should validate correct effective config', () => {
    const result = validateEffectiveConfig(validConfig);
    expect(result.success).toBe(true);
  });

  it('should reject invalid schema version', () => {
    const config = { ...validConfig, schemaVersion: '2.0.0' };
    const result = validateEffectiveConfig(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid CLI tool name', () => {
    const config = {
      ...validConfig,
      tools: { ...validConfig.tools, plan: 'invalid' },
    };
    const result = validateEffectiveConfig(config);
    expect(result.success).toBe(false);
  });

  it('should reject negative iteration limits', () => {
    const config = {
      ...validConfig,
      limits: { ...validConfig.limits, maxPlanIterations: -1 },
    };
    const result = validateEffectiveConfig(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid confidence threshold', () => {
    const config = {
      ...validConfig,
      thresholds: { planConfidence: 150 },
    };
    const result = validateEffectiveConfig(config);
    expect(result.success).toBe(false);
  });
});

describe('validateExecutionState', () => {
  const validState = {
    version: '1.0.0' as const,
    timestampDirectory: '2025-01-01_12-00-00-000Z',
    requirements: 'Test requirements',
    config: {
      maxRevisions: 10,
      planConfidenceThreshold: 85,
      maxFollowUpIterations: 10,
      execIterations: 5,
      isDestinyMode: false,
      cliTool: null,
      previewPlan: false,
    },
    phase: 'plan-generation' as const,
    lastSaved: '2025-01-01T00:00:00Z',
  };

  it('should validate correct execution state', () => {
    const result = validateExecutionState(validState);
    expect(result.success).toBe(true);
  });

  it('should validate state with plan generation phase', () => {
    const state = {
      ...validState,
      phase: 'plan-generation' as const,
      planGeneration: {
        revisionCount: 2,
        planPath: '/path/to/plan.md',
        outputDirectory: '/path/to/output',
      },
    };
    const result = validateExecutionState(state);
    expect(result.success).toBe(true);
  });

  it('should validate state with execution phase', () => {
    const state = {
      ...validState,
      phase: 'execution' as const,
      execution: {
        execIterationCount: 1,
        currentPlanPath: '/path/to/plan.md',
        executeOutputDirectory: '/path/to/exec',
        followUpIterationCount: 0,
        hasDoneIteration0: false,
      },
    };
    const result = validateExecutionState(state);
    expect(result.success).toBe(true);
  });

  it('should reject invalid version', () => {
    const state = { ...validState, version: '2.0.0' };
    const result = validateExecutionState(state);
    expect(result.success).toBe(false);
  });

  it('should reject invalid phase', () => {
    const state = { ...validState, phase: 'invalid-phase' };
    const result = validateExecutionState(state);
    expect(result.success).toBe(false);
  });
});

describe('parseExecutionState', () => {
  it('should parse valid JSON', () => {
    const state = {
      version: '1.0.0',
      timestampDirectory: '2025-01-01_12-00-00-000Z',
      requirements: 'Test',
      config: {
        maxRevisions: 10,
        planConfidenceThreshold: 85,
        maxFollowUpIterations: 10,
        execIterations: 5,
        isDestinyMode: false,
        cliTool: null,
        previewPlan: false,
      },
      phase: 'plan-generation',
      lastSaved: '2025-01-01T00:00:00Z',
    };
    const result = parseExecutionState(JSON.stringify(state));
    expect(result.success).toBe(true);
  });

  it('should reject invalid JSON', () => {
    const result = parseExecutionState('not json');
    expect(result.success).toBe(false);
  });
});

describe('validateArtifact', () => {
  it('should validate plan-metadata type', () => {
    const data = { schemaVersion: '1.0.0', confidence: 90, openQuestions: [], summary: 'Test' };
    const result = validateArtifact('plan-metadata', data);
    expect(result.success).toBe(true);
  });

  it('should validate execute-metadata type', () => {
    const data = { schemaVersion: '1.0.0', hasFollowUps: false, hardBlockers: [], summary: 'Test' };
    const result = validateArtifact('execute-metadata', data);
    expect(result.success).toBe(true);
  });

  it('should validate gap-audit-metadata type', () => {
    const data = { schemaVersion: '1.0.0', gapsIdentified: false, summary: 'Test' };
    const result = validateArtifact('gap-audit-metadata', data);
    expect(result.success).toBe(true);
  });
});

describe('parseArtifact', () => {
  it('should parse and validate plan-metadata', () => {
    const json = JSON.stringify({ schemaVersion: '1.0.0', confidence: 90, openQuestions: [], summary: 'Test' });
    const result = parseArtifact('plan-metadata', json);
    expect(result.success).toBe(true);
  });

  it('should handle invalid JSON', () => {
    const result = parseArtifact('plan-metadata', 'invalid');
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Invalid JSON');
  });

  it('should handle valid JSON that fails validation', () => {
    const json = JSON.stringify({ schemaVersion: '1.0.0', confidence: 150 }); // Invalid confidence
    const result = parseArtifact('plan-metadata', json);
    expect(result.success).toBe(false);
  });
});

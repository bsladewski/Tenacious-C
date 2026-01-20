/**
 * Tests for artifact validation functions in scan-execution-artifacts.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';
import {
  validateExecutionArtifacts,
  validatePlanArtifacts,
  validateGapAuditArtifacts,
  verifyGapAuditArtifacts,
  getExecutionArtifacts,
} from './scan-execution-artifacts';

describe('validateExecutionArtifacts', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(tmpdir(), `test-artifacts-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return valid when all artifacts are present and valid', () => {
    const executionIteration = 1;
    
    // Create valid artifacts
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}.md`),
      '# Execution Summary\n- Mode: plan-driven\n- Scope: backend'
    );
    writeFileSync(
      resolve(testDir, 'execute-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        hasFollowUps: false,
        hardBlockers: [],
        summary: 'Test execution completed successfully',
      })
    );

    const result = validateExecutionArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('should detect missing summary file', () => {
    const executionIteration = 1;
    
    // Only create metadata, not summary
    writeFileSync(
      resolve(testDir, 'execute-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        hasFollowUps: false,
        hardBlockers: [],
        summary: 'Test',
      })
    );

    const result = validateExecutionArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain(`execution-summary-${executionIteration}.md`);
    expect(result.errors).toEqual([]);
  });

  it('should detect missing metadata file', () => {
    const executionIteration = 1;
    
    // Only create summary, not metadata
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}.md`),
      '# Execution Summary'
    );

    const result = validateExecutionArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('execute-metadata.json');
    expect(result.errors).toEqual([]);
  });

  it('should detect both files missing', () => {
    const executionIteration = 1;
    
    const result = validateExecutionArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain(`execution-summary-${executionIteration}.md`);
    expect(result.missing).toContain('execute-metadata.json');
  });

  it('should detect invalid JSON in metadata file', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}.md`),
      '# Execution Summary'
    );
    writeFileSync(
      resolve(testDir, 'execute-metadata.json'),
      'not valid json'
    );

    const result = validateExecutionArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Invalid execute-metadata.json');
  });

  it('should detect valid JSON but wrong schema (missing required fields)', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}.md`),
      '# Execution Summary'
    );
    // Missing schemaVersion, hasFollowUps, hardBlockers, summary
    writeFileSync(
      resolve(testDir, 'execute-metadata.json'),
      JSON.stringify({ foo: 'bar' })
    );

    const result = validateExecutionArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should detect valid JSON but missing schemaVersion', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}.md`),
      '# Execution Summary'
    );
    writeFileSync(
      resolve(testDir, 'execute-metadata.json'),
      JSON.stringify({
        hasFollowUps: false,
        hardBlockers: [],
        summary: 'Test',
      })
    );

    const result = validateExecutionArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should work with different execution iterations', () => {
    const executionIteration = 3;
    
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}.md`),
      '# Execution Summary'
    );
    writeFileSync(
      resolve(testDir, 'execute-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        hasFollowUps: true,
        hardBlockers: [],
        summary: 'Test',
      })
    );

    const result = validateExecutionArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(true);
  });
});

describe('validatePlanArtifacts', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(tmpdir(), `test-plan-artifacts-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return valid when all artifacts are present and valid', () => {
    writeFileSync(
      resolve(testDir, 'plan.md'),
      '# Requirements Snapshot\n- Test requirement'
    );
    writeFileSync(
      resolve(testDir, 'plan-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        confidence: 90,
        openQuestions: [],
        summary: 'Test plan summary',
      })
    );

    const result = validatePlanArtifacts(testDir);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('should detect missing plan.md file', () => {
    writeFileSync(
      resolve(testDir, 'plan-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        confidence: 90,
        openQuestions: [],
        summary: 'Test',
      })
    );

    const result = validatePlanArtifacts(testDir);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('plan.md');
  });

  it('should detect missing plan-metadata.json file', () => {
    writeFileSync(resolve(testDir, 'plan.md'), '# Plan');

    const result = validatePlanArtifacts(testDir);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('plan-metadata.json');
  });

  it('should detect both files missing', () => {
    const result = validatePlanArtifacts(testDir);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('plan.md');
    expect(result.missing).toContain('plan-metadata.json');
  });

  it('should detect invalid JSON in metadata file', () => {
    writeFileSync(resolve(testDir, 'plan.md'), '# Plan');
    writeFileSync(resolve(testDir, 'plan-metadata.json'), '{ invalid json }');

    const result = validatePlanArtifacts(testDir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Invalid plan-metadata.json');
  });

  it('should detect valid JSON but wrong schema', () => {
    writeFileSync(resolve(testDir, 'plan.md'), '# Plan');
    writeFileSync(
      resolve(testDir, 'plan-metadata.json'),
      JSON.stringify({ confidence: 150 }) // Invalid confidence and missing fields
    );

    const result = validatePlanArtifacts(testDir);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should validate plan with open questions', () => {
    writeFileSync(resolve(testDir, 'plan.md'), '# Plan');
    writeFileSync(
      resolve(testDir, 'plan-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        confidence: 70,
        openQuestions: [
          { question: 'What framework?', suggestedAnswers: ['React', 'Vue'] },
        ],
        summary: 'Plan with questions',
      })
    );

    const result = validatePlanArtifacts(testDir);
    expect(result.valid).toBe(true);
  });
});

describe('validateGapAuditArtifacts', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(tmpdir(), `test-gap-audit-artifacts-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return valid when all artifacts are present and valid', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `gap-audit-summary-${executionIteration}.md`),
      '# Gap Audit Summary'
    );
    writeFileSync(
      resolve(testDir, 'gap-audit-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        gapsIdentified: false,
        summary: 'No gaps found',
      })
    );

    const result = validateGapAuditArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('should detect missing summary file', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, 'gap-audit-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        gapsIdentified: false,
        summary: 'Test',
      })
    );

    const result = validateGapAuditArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain(`gap-audit-summary-${executionIteration}.md`);
  });

  it('should detect missing metadata file', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `gap-audit-summary-${executionIteration}.md`),
      '# Gap Audit Summary'
    );

    const result = validateGapAuditArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('gap-audit-metadata.json');
  });

  it('should detect invalid JSON in metadata file', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `gap-audit-summary-${executionIteration}.md`),
      '# Gap Audit Summary'
    );
    writeFileSync(resolve(testDir, 'gap-audit-metadata.json'), 'not json');

    const result = validateGapAuditArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should work with different execution iterations', () => {
    const executionIteration = 2;
    
    writeFileSync(
      resolve(testDir, `gap-audit-summary-${executionIteration}.md`),
      '# Gap Audit Summary'
    );
    writeFileSync(
      resolve(testDir, 'gap-audit-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        gapsIdentified: true,
        summary: 'Found gaps',
      })
    );

    const result = validateGapAuditArtifacts(testDir, executionIteration);
    expect(result.valid).toBe(true);
  });
});

describe('verifyGapAuditArtifacts (enhanced)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(tmpdir(), `test-verify-gap-audit-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return isComplete true when files are valid', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `gap-audit-summary-${executionIteration}.md`),
      '# Gap Audit Summary'
    );
    writeFileSync(
      resolve(testDir, 'gap-audit-metadata.json'),
      JSON.stringify({
        schemaVersion: '1.0.0',
        gapsIdentified: false,
        summary: 'Test',
      })
    );

    const result = verifyGapAuditArtifacts(testDir, executionIteration);
    expect(result.isComplete).toBe(true);
    expect(result.metadataExists).toBe(true);
    expect(result.summaryExists).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should return isComplete false when metadata is invalid JSON', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `gap-audit-summary-${executionIteration}.md`),
      '# Gap Audit Summary'
    );
    writeFileSync(resolve(testDir, 'gap-audit-metadata.json'), 'invalid');

    const result = verifyGapAuditArtifacts(testDir, executionIteration);
    expect(result.isComplete).toBe(false);
    expect(result.metadataExists).toBe(true);
    expect(result.summaryExists).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should include errors array', () => {
    const executionIteration = 1;

    const result = verifyGapAuditArtifacts(testDir, executionIteration);
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

describe('getExecutionArtifacts', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(tmpdir(), `test-get-artifacts-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should detect initial execution summary', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}.md`),
      '# Summary'
    );

    const result = getExecutionArtifacts(testDir, executionIteration);
    expect(result.initialExecutionDone).toBe(true);
  });

  it('should detect follow-up iterations', () => {
    const executionIteration = 1;
    
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}.md`),
      '# Summary'
    );
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}-followup-0.md`),
      '# Follow-up 0'
    );
    writeFileSync(
      resolve(testDir, `execution-summary-${executionIteration}-followup-1.md`),
      '# Follow-up 1'
    );

    const result = getExecutionArtifacts(testDir, executionIteration);
    expect(result.initialExecutionDone).toBe(true);
    expect(result.hasDoneIteration0).toBe(true);
    expect(result.lastFollowUpIteration).toBe(1);
    expect(result.allFollowUpIterations).toEqual([0, 1]);
  });

  it('should handle non-existent directory', () => {
    const result = getExecutionArtifacts('/non/existent/path', 1);
    expect(result.initialExecutionDone).toBe(false);
    expect(result.lastFollowUpIteration).toBe(null);
  });
});

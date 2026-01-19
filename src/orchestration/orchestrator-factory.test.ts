/**
 * Tests for Orchestrator Factory
 */

import { describe, it, expect } from 'vitest';
import {
  cliToolTypeToName,
  cliToolNameToType,
  legacyOptionsToEffectiveConfig,
  createMockDependencies,
  createMockOrchestrator,
  createTestConfig,
} from './orchestrator-factory';

describe('cliToolTypeToName', () => {
  it('converts known tool types', () => {
    expect(cliToolTypeToName('codex')).toBe('codex');
    expect(cliToolTypeToName('copilot')).toBe('copilot');
    expect(cliToolTypeToName('cursor')).toBe('cursor');
    expect(cliToolTypeToName('claude')).toBe('claude');
    expect(cliToolTypeToName('mock')).toBe('mock');
  });

  it('defaults to cursor for null', () => {
    expect(cliToolTypeToName(null)).toBe('cursor');
  });
});

describe('cliToolNameToType', () => {
  it('converts known tool names', () => {
    expect(cliToolNameToType('codex')).toBe('codex');
    expect(cliToolNameToType('copilot')).toBe('copilot');
    expect(cliToolNameToType('cursor')).toBe('cursor');
    expect(cliToolNameToType('claude')).toBe('claude');
    expect(cliToolNameToType('mock')).toBe('mock');
  });
});

describe('legacyOptionsToEffectiveConfig', () => {
  it('converts minimal legacy options', () => {
    const config = legacyOptionsToEffectiveConfig({
      input: 'test requirements',
    });

    expect(config.schemaVersion).toBe('1.0.0');
    expect(config.input).toBe('test requirements');
    expect(config.limits.maxPlanIterations).toBe(10);
    expect(config.limits.maxExecIterations).toBe(5);
    expect(config.limits.maxFollowUpIterations).toBe(10);
    expect(config.thresholds.planConfidence).toBe(85);
    expect(config.tools.plan).toBe('cursor');
    expect(config.tools.execute).toBe('cursor');
    expect(config.tools.audit).toBe('cursor');
  });

  it('converts full legacy options', () => {
    const config = legacyOptionsToEffectiveConfig({
      input: 'build feature X',
      maxRevisions: 5,
      planConfidenceThreshold: 90,
      maxFollowUpIterations: 3,
      execIterations: 2,
      isDestinyMode: false,
      specifiedCliTool: 'claude',
      previewPlanFlag: true,
      resumeFlag: false,
      planModel: 'claude-3-opus',
      executeModel: 'claude-3-sonnet',
      auditModel: 'claude-3-haiku',
      planCliTool: 'claude',
      executeCliTool: 'cursor',
      auditCliTool: 'copilot',
      fallbackCliTools: ['codex', 'mock'],
      workingDirectory: '/project',
      artifactBaseDir: '/project/.tenacious-c',
    });

    expect(config.input).toBe('build feature X');
    expect(config.limits.maxPlanIterations).toBe(5);
    expect(config.limits.maxExecIterations).toBe(2);
    expect(config.limits.maxFollowUpIterations).toBe(3);
    expect(config.thresholds.planConfidence).toBe(90);
    expect(config.tools.plan).toBe('claude');
    expect(config.tools.execute).toBe('cursor');
    expect(config.tools.audit).toBe('copilot');
    expect(config.models.plan).toBe('claude-3-opus');
    expect(config.models.execute).toBe('claude-3-sonnet');
    expect(config.models.audit).toBe('claude-3-haiku');
    expect(config.interactivity.previewPlan).toBe(true);
    expect(config.runMode.resume).toBe(false);
    expect(config.fallback.fallbackTools).toEqual(['codex', 'mock']);
    expect(config.paths.workingDirectory).toBe('/project');
    expect(config.paths.artifactBaseDir).toBe('/project/.tenacious-c');
  });

  it('handles destiny mode with unlimited iterations', () => {
    const config = legacyOptionsToEffectiveConfig({
      input: 'infinite mode',
      isDestinyMode: true,
      maxRevisions: 5, // Should be ignored
      maxFollowUpIterations: 3, // Should be ignored
      execIterations: 2, // Should be ignored
    });

    expect(config.limits.maxPlanIterations).toBe(Number.MAX_SAFE_INTEGER);
    expect(config.limits.maxExecIterations).toBe(Number.MAX_SAFE_INTEGER);
    expect(config.limits.maxFollowUpIterations).toBe(Number.MAX_SAFE_INTEGER);
    expect(config.runMode.unlimitedIterations).toBe(true);
  });

  it('generates valid runId from timestamp', () => {
    const config = legacyOptionsToEffectiveConfig({
      input: 'test',
    });

    // runId should not contain colons or dots (URL-safe)
    expect(config.runId).not.toContain(':');
    expect(config.runId).not.toContain('.');
  });
});

describe('createMockDependencies', () => {
  it('creates all required dependencies', () => {
    const deps = createMockDependencies();

    expect(deps.logger).toBeDefined();
    expect(deps.fileSystem).toBeDefined();
    expect(deps.prompter).toBeDefined();
    expect(deps.clock).toBeDefined();
    expect(deps.processRunner).toBeDefined();
  });

  it('exposes typed logger and fileSystem', () => {
    const deps = createMockDependencies();

    // BufferLogger has getEvents()
    expect(typeof deps.logger.getEvents).toBe('function');

    // MemoryFileSystem has exists()
    expect(typeof deps.fileSystem.exists).toBe('function');
  });
});

describe('createMockOrchestrator', () => {
  it('creates orchestrator with mock dependencies', () => {
    const config = createTestConfig();
    const result = createMockOrchestrator(config);

    expect(result.orchestrator).toBeDefined();
    expect(result.deps).toBeDefined();
    expect(result.config).toBe(config);
    expect(result.logger).toBeDefined();
    expect(result.fileSystem).toBeDefined();
    expect(result.processRunner).toBeDefined();
  });

  it('orchestrator starts in IDLE state', () => {
    const config = createTestConfig();
    const { orchestrator } = createMockOrchestrator(config);

    expect(orchestrator.getCurrentState()).toBe('IDLE');
    expect(orchestrator.isComplete()).toBe(false);
  });

  it('orchestrator can transition through states', () => {
    const config = createTestConfig();
    const { orchestrator } = createMockOrchestrator(config);

    // Start plan generation
    const result = orchestrator.start('test requirements');
    expect(result.success).toBe(true);
    expect(orchestrator.getCurrentState()).toBe('PLAN_GENERATION');

    // Signal plan generated
    const result2 = orchestrator.onPlanGenerated();
    expect(result2.success).toBe(true);
    expect(orchestrator.getCurrentState()).toBe('PLAN_REVISION');
  });

  it('orchestrator tracks iteration counts', () => {
    const config = createTestConfig();
    const { orchestrator } = createMockOrchestrator(config);

    orchestrator.start('test requirements');
    orchestrator.onPlanGenerated();
    orchestrator.onPlanImproved();
    orchestrator.onPlanImproved();

    const context = orchestrator.getContext();
    expect(context.planRevisionCount).toBe(2);
  });
});

describe('createTestConfig', () => {
  it('creates config with defaults', () => {
    const config = createTestConfig();

    expect(config.schemaVersion).toBe('1.0.0');
    expect(config.input).toBe('test requirements');
    expect(config.runId).toBe('test-run-001');
    expect(config.paths.workingDirectory).toBe('/test');
  });

  it('allows overriding specific fields', () => {
    const config = createTestConfig({
      input: 'custom input',
      runId: 'custom-run',
      limits: {
        maxPlanIterations: 3,
        maxExecIterations: 2,
        maxFollowUpIterations: 1,
        maxGapAuditIterations: 1,
      },
    });

    expect(config.input).toBe('custom input');
    expect(config.runId).toBe('custom-run');
    expect(config.limits.maxPlanIterations).toBe(3);
    expect(config.limits.maxExecIterations).toBe(2);
  });
});

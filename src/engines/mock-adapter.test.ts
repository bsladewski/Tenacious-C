/**
 * Tests for MockAdapter file generation
 * Verifies that MockAdapter generates realistic file outputs for --mock-mode
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { createMockAdapter, resetMockAdapterState, MockAdapter } from './mock-adapter';
import { setMockConfig } from './mock-config';
import { EngineExecutionOptions } from '../types/engine-result';

describe('MockAdapter file generation', () => {
  let testDir: string;
  let adapter: MockAdapter;

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(tmpdir(), `mock-adapter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    // Reset mock state between tests
    resetMockAdapterState();

    // Reset global mock config
    setMockConfig(null);

    // Create adapter
    adapter = createMockAdapter();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createExecutionOptions(prompt: string, overrides?: Partial<EngineExecutionOptions>): EngineExecutionOptions {
    // Default to 'plan' mode for plan-generation tests, but allow override
    const defaultMode: EngineExecutionOptions['mode'] = overrides?.mode ?? 'plan';
    return {
      mode: defaultMode,
      userMessage: prompt,
      cwd: testDir,
      ...overrides,
    };
  }

  describe('plan-generation phase', () => {
    it('should generate plan.md and plan-metadata.json', async () => {
      const options = createExecutionOptions('Generate a plan for implementing user authentication.');
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'plan.md'))).toBe(true);
      expect(existsSync(resolve(testDir, 'plan-metadata.json'))).toBe(true);
    });

    it('should generate valid plan metadata with schemaVersion', async () => {
      const options = createExecutionOptions('Generate a plan for implementing user authentication.');
      await adapter.execute(options);

      const metadata = JSON.parse(readFileSync(resolve(testDir, 'plan-metadata.json'), 'utf-8'));
      expect(metadata.schemaVersion).toBe('1.0.0');
      expect(typeof metadata.confidence).toBe('number');
      expect(Array.isArray(metadata.openQuestions)).toBe(true);
      expect(typeof metadata.summary).toBe('string');
    });

    it('should generate open questions by default', async () => {
      const options = createExecutionOptions('Generate a plan for implementing user authentication.');
      await adapter.execute(options);

      const metadata = JSON.parse(readFileSync(resolve(testDir, 'plan-metadata.json'), 'utf-8'));
      expect(metadata.openQuestions.length).toBeGreaterThan(0);
      expect(metadata.openQuestions[0]).toHaveProperty('question');
      expect(metadata.openQuestions[0]).toHaveProperty('suggestedAnswers');
    });
  });

  describe('answer-questions phase', () => {
    it('should detect answer-questions phase from prompt', async () => {
      const options = createExecutionOptions('Based on the answers provided, revise the plan accordingly.');
      await adapter.execute(options);

      const metadata = JSON.parse(readFileSync(resolve(testDir, 'plan-metadata.json'), 'utf-8'));
      expect(metadata.summary).toContain('answering questions');
    });

    it('should track question answer iterations', async () => {
      // First answer iteration
      await adapter.execute(createExecutionOptions('Based on the answers provided, revise the plan accordingly.'));
      let metadata = JSON.parse(readFileSync(resolve(testDir, 'plan-metadata.json'), 'utf-8'));
      expect(metadata.summary).toContain('iteration 1');

      // Second answer iteration
      await adapter.execute(createExecutionOptions('Based on the answers provided, revise the plan accordingly.'));
      metadata = JSON.parse(readFileSync(resolve(testDir, 'plan-metadata.json'), 'utf-8'));
      expect(metadata.summary).toContain('iteration 2');
    });
  });

  describe('improve-plan phase', () => {
    it('should detect improve-plan phase from prompt', async () => {
      const options = createExecutionOptions('Please improve and deepen the plan with more details.');
      await adapter.execute(options);

      const metadata = JSON.parse(readFileSync(resolve(testDir, 'plan-metadata.json'), 'utf-8'));
      expect(metadata.summary).toContain('improved');
    });

    it('should increase confidence with each improvement', async () => {
      // First improvement
      await adapter.execute(createExecutionOptions('Please improve and deepen the plan with more details.'));
      let metadata = JSON.parse(readFileSync(resolve(testDir, 'plan-metadata.json'), 'utf-8'));
      const firstConfidence = metadata.confidence;

      // Second improvement
      await adapter.execute(createExecutionOptions('Please improve and deepen the plan with more details.'));
      metadata = JSON.parse(readFileSync(resolve(testDir, 'plan-metadata.json'), 'utf-8'));
      const secondConfidence = metadata.confidence;

      expect(secondConfidence).toBeGreaterThan(firstConfidence);
    });
  });

  describe('execute-plan phase', () => {
    it('should generate execution summary and execute-metadata.json', async () => {
      const options = createExecutionOptions('Execute the plan starting from step 1.', { mode: 'execute' });
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'execution-summary-1.md'))).toBe(true);
      expect(existsSync(resolve(testDir, 'execute-metadata.json'))).toBe(true);
    });

    it('should generate valid execute metadata with schemaVersion', async () => {
      const options = createExecutionOptions('Execute the plan starting from step 1.', { mode: 'execute' });
      await adapter.execute(options);

      const metadata = JSON.parse(readFileSync(resolve(testDir, 'execute-metadata.json'), 'utf-8'));
      expect(metadata.schemaVersion).toBe('1.0.0');
      expect(typeof metadata.hasFollowUps).toBe('boolean');
      expect(Array.isArray(metadata.hardBlockers)).toBe(true);
      expect(typeof metadata.summary).toBe('string');
    });

    it('should support custom execution iteration from prompt', async () => {
      const options = createExecutionOptions('Execute the plan for execute-2 iteration.', { mode: 'execute' });
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'execution-summary-2.md'))).toBe(true);
    });

    it('should detect execute-plan phase from mode even with full template prompt', async () => {
      // This simulates the real-world scenario where the execute-plan template
      // doesn't contain "Execute the plan" in the prompt text
      const fullTemplatePrompt = `You are executing changes for the codebase (frontend, backend, or both as required).

The requirements are defined by:
1. The referenced plan file at \`plan.md\`
2. The original requirements at \`requirements.txt\`

Follow instruction precedence (highest to lowest):
1. This command's rules
2. Agent rules (e.g., \`cursorrules/\`, \`agents.md\`, etc.)
3. The referenced plan and original requirements`;
      
      const options = createExecutionOptions(fullTemplatePrompt, { mode: 'execute' });
      await adapter.execute(options);

      // Should generate execute-metadata.json even though prompt doesn't contain "Execute the plan"
      expect(existsSync(resolve(testDir, 'execute-metadata.json'))).toBe(true);
      expect(existsSync(resolve(testDir, 'execution-summary-1.md'))).toBe(true);
      
      const metadata = JSON.parse(readFileSync(resolve(testDir, 'execute-metadata.json'), 'utf-8'));
      expect(metadata.schemaVersion).toBe('1.0.0');
      expect(typeof metadata.hasFollowUps).toBe('boolean');
    });
  });

  describe('execute-follow-ups phase', () => {
    it('should generate follow-up execution summary', async () => {
      const options = createExecutionOptions('You are executing follow-up items from a previous execution run.', { mode: 'execute' });
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'execution-summary-1-followup-0.md'))).toBe(true);
      expect(existsSync(resolve(testDir, 'execute-metadata.json'))).toBe(true);
    });

    it('should track follow-up iterations', async () => {
      // First follow-up
      await adapter.execute(createExecutionOptions('You are executing follow-up items from a previous execution run.', { mode: 'execute' }));
      let metadata = JSON.parse(readFileSync(resolve(testDir, 'execute-metadata.json'), 'utf-8'));
      expect(metadata.hasFollowUps).toBe(true);

      // Second follow-up (default config has 2 follow-up iterations)
      await adapter.execute(createExecutionOptions('You are executing follow-up items from a previous execution run.', { mode: 'execute' }));
      metadata = JSON.parse(readFileSync(resolve(testDir, 'execute-metadata.json'), 'utf-8'));
      expect(metadata.hasFollowUps).toBe(false); // Should be false after reaching limit
    });

    it('should detect execute-follow-ups phase from mode with full template prompt', async () => {
      // This simulates the real-world scenario with the execute-follow-ups template
      const fullTemplatePrompt = `You are executing follow-up items from a previous execution run for the codebase (frontend, backend, or both as required).

The previous execution summary is located at \`execution-summary-1.md\`. This summary contains follow-up items that need to be addressed.

Follow instruction precedence (highest to lowest):
1. This command's rules
2. Agent rules (e.g., \`cursorrules/\`, \`agents.md\`, etc.)
3. The follow-up items from the execution summary`;
      
      const options = createExecutionOptions(fullTemplatePrompt, { mode: 'execute' });
      await adapter.execute(options);

      // Should generate follow-up output files
      expect(existsSync(resolve(testDir, 'execution-summary-1-followup-0.md'))).toBe(true);
      expect(existsSync(resolve(testDir, 'execute-metadata.json'))).toBe(true);
      
      const metadata = JSON.parse(readFileSync(resolve(testDir, 'execute-metadata.json'), 'utf-8'));
      expect(metadata.schemaVersion).toBe('1.0.0');
      expect(typeof metadata.hasFollowUps).toBe('boolean');
    });
  });

  describe('gap-audit phase', () => {
    it('should generate gap audit summary and metadata', async () => {
      const options = createExecutionOptions('Perform a gap-audit of the implementation.', { mode: 'audit' });
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'gap-audit-summary-1.md'))).toBe(true);
      expect(existsSync(resolve(testDir, 'gap-audit-metadata.json'))).toBe(true);
    });

    it('should generate valid gap audit metadata with schemaVersion', async () => {
      const options = createExecutionOptions('Perform a gap-audit of the implementation.', { mode: 'audit' });
      await adapter.execute(options);

      const metadata = JSON.parse(readFileSync(resolve(testDir, 'gap-audit-metadata.json'), 'utf-8'));
      expect(metadata.schemaVersion).toBe('1.0.0');
      expect(typeof metadata.gapsIdentified).toBe('boolean');
      expect(typeof metadata.summary).toBe('string');
    });

    it('should track gap audit iterations', async () => {
      // First audit - should find gaps
      await adapter.execute(createExecutionOptions('Perform a gap-audit of the implementation.', { mode: 'audit' }));
      let metadata = JSON.parse(readFileSync(resolve(testDir, 'gap-audit-metadata.json'), 'utf-8'));
      expect(metadata.gapsIdentified).toBe(true);

      // Second audit (default config has 2 execution iterations) - should find no gaps
      await adapter.execute(createExecutionOptions('Perform a gap-audit of the implementation.', { mode: 'audit' }));
      metadata = JSON.parse(readFileSync(resolve(testDir, 'gap-audit-metadata.json'), 'utf-8'));
      expect(metadata.gapsIdentified).toBe(false);
    });
  });

  describe('gap-plan phase', () => {
    it('should generate gap closure plan', async () => {
      const options = createExecutionOptions('Create a Gap Closure Plan to address the identified gaps.', { mode: 'gap' });
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'gap-plan-1.md'))).toBe(true);
    });
  });

  describe('generate-summary phase', () => {
    it('should generate final summary output', async () => {
      const options = createExecutionOptions('Generate the final TENACIOUS C EXECUTION SUMMARY.');
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'final-summary-output.txt'))).toBe(true);
    });

    it('should detect generate-summary phase from explicit phase marker', async () => {
      // Test explicit phase marker detection (most specific)
      const options = createExecutionOptions('**PHASE: generate-summary**\n\nGenerate the final summary.', { mode: 'plan' });
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'final-summary-output.txt'))).toBe(true);
    });

    it('should detect generate-summary phase from TENACIOUS C EXECUTION SUMMARY', async () => {
      // Test fallback detection with specific phrase
      const options = createExecutionOptions('Generate the final TENACIOUS C EXECUTION SUMMARY.', { mode: 'plan' });
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'final-summary-output.txt'))).toBe(true);
    });

    it('should detect generate-summary phase from final-summary-output.txt', async () => {
      // Test fallback detection with file path
      const options = createExecutionOptions('Write summary to final-summary-output.txt', { mode: 'plan' });
      await adapter.execute(options);

      expect(existsSync(resolve(testDir, 'final-summary-output.txt'))).toBe(true);
    });

    it('should extract output file path from prompt', async () => {
      const customPath = resolve(testDir, 'custom-output', 'summary.txt');
      // Include 'final-summary-output.txt' in the prompt to trigger the generate-summary phase detection
      const options = createExecutionOptions(`Generate the final TENACIOUS C EXECUTION SUMMARY and write it to this exact file path: \`${customPath}\``);
      await adapter.execute(options);

      expect(existsSync(customPath)).toBe(true);
    });

    it('should create file at correct path when phase detection works', async () => {
      const options = createExecutionOptions('**PHASE: generate-summary**\n\nWrite to this exact file path: `' + resolve(testDir, 'final-summary-output.txt') + '`', { mode: 'plan' });
      await adapter.execute(options);

      const filePath = resolve(testDir, 'final-summary-output.txt');
      expect(existsSync(filePath)).toBe(true);
      
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('TENACIOUS C EXECUTION SUMMARY');
    });

    it('should prioritize explicit phase marker over other patterns', async () => {
      // Even if prompt contains "improve" (which would normally trigger improve-plan),
      // explicit phase marker should take precedence
      const options = createExecutionOptions('**PHASE: generate-summary**\n\nPlease improve the summary.', { mode: 'plan' });
      await adapter.execute(options);

      // Should generate summary file, not plan file
      expect(existsSync(resolve(testDir, 'final-summary-output.txt'))).toBe(true);
      expect(existsSync(resolve(testDir, 'plan.md'))).toBe(false);
    });
  });

  describe('mock configuration', () => {
    it('should use global mock config', async () => {
      setMockConfig({
        openQuestionIterations: 0, // No questions
        startingConfidence: 90,
      });

      // Create a new adapter to pick up the new config
      const configuredAdapter = createMockAdapter();
      await configuredAdapter.execute(createExecutionOptions('Generate a plan.'));

      const metadata = JSON.parse(readFileSync(resolve(testDir, 'plan-metadata.json'), 'utf-8'));
      expect(metadata.openQuestions).toHaveLength(0);
      expect(metadata.confidence).toBe(90);
    });

    it('should generate hard blockers when configured', async () => {
      setMockConfig({
        hardBlockers: true,
      });

      const configuredAdapter = createMockAdapter();
      await configuredAdapter.execute(createExecutionOptions('Execute the plan starting from step 1.', { mode: 'execute' }));

      const metadata = JSON.parse(readFileSync(resolve(testDir, 'execute-metadata.json'), 'utf-8'));
      expect(metadata.hardBlockers.length).toBeGreaterThan(0);
      expect(metadata.hardBlockers[0]).toHaveProperty('description');
      expect(metadata.hardBlockers[0]).toHaveProperty('reason');
    });
  });

  describe('execution history', () => {
    it('should record execution history for test assertions', async () => {
      await adapter.execute(createExecutionOptions('First prompt'));
      await adapter.execute(createExecutionOptions('Second prompt'));

      expect(adapter.executionHistory).toHaveLength(2);
      expect(adapter.executionHistory[0].options.userMessage).toBe('First prompt');
      expect(adapter.executionHistory[1].options.userMessage).toBe('Second prompt');
    });

    it('should allow clearing execution history', async () => {
      await adapter.execute(createExecutionOptions('Test prompt'));
      expect(adapter.executionHistory).toHaveLength(1);

      adapter.clearHistory();
      expect(adapter.executionHistory).toHaveLength(0);
    });
  });

  describe('availability and version', () => {
    it('should report as available by default', async () => {
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('should report mock version', async () => {
      const version = await adapter.getVersion();
      expect(version).toBe('mock-1.0.0');
    });

    it('should allow custom availability and version', async () => {
      const customAdapter = createMockAdapter({
        isAvailable: false,
        version: 'custom-2.0.0',
      });

      expect(await customAdapter.isAvailable()).toBe(false);
      expect(await customAdapter.getVersion()).toBe('custom-2.0.0');
    });
  });

  describe('integration: full execution flow', () => {
    it('should generate execute-metadata.json in execute-plan phase and allow follow-ups to read it', async () => {
      // Step 1: Execute plan phase - should generate execute-metadata.json
      const executePlanPrompt = `You are executing changes for the codebase (frontend, backend, or both as required).

The requirements are defined by:
1. The referenced plan file at \`plan.md\`
2. The original requirements at \`requirements.txt\``;

      const executeOptions = createExecutionOptions(executePlanPrompt, { mode: 'execute' });
      await adapter.execute(executeOptions);

      // Verify execute-metadata.json was generated
      expect(existsSync(resolve(testDir, 'execute-metadata.json'))).toBe(true);
      expect(existsSync(resolve(testDir, 'execution-summary-1.md'))).toBe(true);

      let metadata = JSON.parse(readFileSync(resolve(testDir, 'execute-metadata.json'), 'utf-8'));
      expect(metadata.schemaVersion).toBe('1.0.0');
      expect(metadata.hasFollowUps).toBe(true); // Mock config sets hasFollowUps to true

      // Step 2: Execute follow-ups phase - should read and update execute-metadata.json
      const followUpPrompt = `You are executing follow-up items from a previous execution run for the codebase.

The previous execution summary is located at \`execution-summary-1.md\`.`;

      const followUpOptions = createExecutionOptions(followUpPrompt, { mode: 'execute' });
      await adapter.execute(followUpOptions);

      // Verify follow-up files were generated
      expect(existsSync(resolve(testDir, 'execution-summary-1-followup-0.md'))).toBe(true);
      
      // Verify execute-metadata.json still exists and was updated
      expect(existsSync(resolve(testDir, 'execute-metadata.json'))).toBe(true);
      metadata = JSON.parse(readFileSync(resolve(testDir, 'execute-metadata.json'), 'utf-8'));
      expect(metadata.schemaVersion).toBe('1.0.0');
      expect(typeof metadata.hasFollowUps).toBe('boolean');
    });

    it('should correctly detect phases using mode field without relying on prompt text', async () => {
      // Test that mode-based detection works even when prompt doesn't contain expected keywords
      const ambiguousPrompt = 'Do some work on the codebase.';

      // With mode: 'execute', should detect as execute-plan
      const executeOptions = createExecutionOptions(ambiguousPrompt, { mode: 'execute' });
      await adapter.execute(executeOptions);
      expect(existsSync(resolve(testDir, 'execute-metadata.json'))).toBe(true);
      expect(existsSync(resolve(testDir, 'execution-summary-1.md'))).toBe(true);

      // Clean up for next test
      rmSync(testDir, { recursive: true, force: true });
      mkdirSync(testDir, { recursive: true });

      // With mode: 'audit', should detect as gap-audit
      const auditOptions = createExecutionOptions(ambiguousPrompt, { mode: 'audit' });
      await adapter.execute(auditOptions);
      expect(existsSync(resolve(testDir, 'gap-audit-metadata.json'))).toBe(true);
      expect(existsSync(resolve(testDir, 'gap-audit-summary-1.md'))).toBe(true);

      // Clean up for next test
      rmSync(testDir, { recursive: true, force: true });
      mkdirSync(testDir, { recursive: true });

      // With mode: 'plan', should detect as plan-generation
      const planOptions = createExecutionOptions(ambiguousPrompt, { mode: 'plan' });
      await adapter.execute(planOptions);
      expect(existsSync(resolve(testDir, 'plan.md'))).toBe(true);
      expect(existsSync(resolve(testDir, 'plan-metadata.json'))).toBe(true);
    });

    it('should generate final summary file in full mock mode execution flow', async () => {
      // Simulate full execution flow: plan → execute → summary
      
      // Step 1: Plan generation
      const planOptions = createExecutionOptions('Generate a plan for implementing a feature.', { mode: 'plan' });
      await adapter.execute(planOptions);
      expect(existsSync(resolve(testDir, 'plan.md'))).toBe(true);

      // Step 2: Execute plan
      const executeOptions = createExecutionOptions('Execute the plan starting from step 1.', { mode: 'execute' });
      await adapter.execute(executeOptions);
      expect(existsSync(resolve(testDir, 'execution-summary-1.md'))).toBe(true);
      expect(existsSync(resolve(testDir, 'execute-metadata.json'))).toBe(true);

      // Step 3: Generate final summary (with explicit phase marker)
      const summaryPrompt = `You are generating a brief, terminal-friendly summary of a Tenacious C execution run.

The execution artifacts are located in: \`${testDir}\`

**PHASE: generate-summary**

**CRITICAL OUTPUT INSTRUCTION:**

You MUST write the generated summary to this exact file path:
\`${resolve(testDir, 'final-summary-output.txt')}\``;

      const summaryOptions = createExecutionOptions(summaryPrompt, { mode: 'plan' });
      await adapter.execute(summaryOptions);

      // Verify summary file was created
      expect(existsSync(resolve(testDir, 'final-summary-output.txt'))).toBe(true);
      
      // Verify file contains expected content
      const summaryContent = readFileSync(resolve(testDir, 'final-summary-output.txt'), 'utf-8');
      expect(summaryContent).toContain('TENACIOUS C EXECUTION SUMMARY');
      expect(summaryContent).toContain('ORIGINAL REQUIREMENTS');
      expect(summaryContent).toContain('WORK ACCOMPLISHED');
    });
  });
});

/**
 * Mock Engine Adapter (Phase 3.7)
 * Implementation of EngineAdapter for testing
 *
 * This adapter generates realistic file outputs (plan.md, plan-metadata.json,
 * execute-metadata.json, etc.) to enable end-to-end testing of the full workflow
 * without calling real AI tools.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { EngineResult, EngineExecutionOptions } from '../types/engine-result';
import { EngineAdapter } from './engine-adapter';
import { ProcessRunner } from '../types/process-runner';
import { getEffectiveMockConfig, MockConfig } from './mock-config';
import { PlanMetadata } from '../schemas/plan-metadata.schema';
import { ExecuteMetadata, HardBlocker } from '../schemas/execute-metadata.schema';
import { GapAuditMetadata } from '../schemas/gap-audit-metadata.schema';
import { ToolCurationMetadata } from '../schemas/tool-curation-metadata.schema';

/**
 * Phase types that determine what files to generate
 */
type MockPhase = 'plan-generation' | 'answer-questions' | 'improve-plan' |
                 'execute-plan' | 'execute-follow-ups' | 'gap-audit' | 'gap-plan' | 'generate-summary' | 'tool-curation';

/**
 * Module-level state counters that persist across all MockAdapter instances
 * This ensures state is maintained even when new instances are created
 */
let questionAnswerCount = 0;
let improvePlanCount = 0;
let followUpCounts: Map<number, number> = new Map(); // executionIteration -> followUpCount
let gapAuditCount = 0;

/**
 * Reset all mock adapter state counters (useful for testing)
 */
export function resetMockAdapterState(): void {
  questionAnswerCount = 0;
  improvePlanCount = 0;
  followUpCounts.clear();
  gapAuditCount = 0;
}

/**
 * Configurable response for the mock adapter
 */
export interface MockAdapterResponse {
  /** Exit code to return */
  exitCode: number;
  /** Duration in milliseconds to simulate */
  durationMs: number;
  /** Stdout lines to return */
  stdoutTail?: string[];
  /** Stderr lines to return */
  stderrTail?: string[];
  /** Whether to simulate interruption */
  interrupted?: boolean;
  /** Signal if interrupted */
  signal?: string;
}

/**
 * Options for creating a mock adapter
 */
export interface MockAdapterOptions {
  /** Default response to return */
  defaultResponse?: MockAdapterResponse;
  /** Map of prompt patterns to responses */
  responseMap?: Map<RegExp | string, MockAdapterResponse>;
  /** Whether the adapter should report itself as available */
  isAvailable?: boolean;
  /** Version string to report */
  version?: string;
  /** Process runner (required by EngineAdapterOptions but not used in mock) */
  processRunner?: ProcessRunner;
}

/**
 * Mock engine adapter for testing
 * Generates realistic file outputs to enable end-to-end workflow testing
 */
export class MockAdapter implements EngineAdapter {
  readonly name = 'mock';
  private readonly defaultResponse: MockAdapterResponse;
  private readonly responseMap: Map<RegExp | string, MockAdapterResponse>;
  private readonly available: boolean;
  private readonly versionString: string | undefined;

  /** History of all executions for test assertions */
  public readonly executionHistory: Array<{
    options: EngineExecutionOptions;
    response: MockAdapterResponse;
  }> = [];

  constructor(options: MockAdapterOptions = {}) {
    this.defaultResponse = options.defaultResponse ?? {
      exitCode: 0,
      durationMs: 100,
      stdoutTail: ['Mock execution complete'],
    };
    this.responseMap = options.responseMap ?? new Map();
    this.available = options.isAvailable ?? true;
    this.versionString = options.version ?? 'mock-1.0.0';
  }

  /**
   * Get the current mock config (reads from global config dynamically)
   */
  private get config(): MockConfig {
    return getEffectiveMockConfig();
  }

  async execute(options: EngineExecutionOptions): Promise<EngineResult> {
    // Find matching response
    const response = this.findResponse(options.userMessage);

    // Simulate execution delay
    await this.delay(response.durationMs);

    // Record execution
    this.executionHistory.push({ options, response });

    // Detect phase and generate appropriate files
    // Use mode-based detection (recommended approach) instead of prompt-only detection
    const phase = this.inferPhaseFromOptions(options);
    const outputDir = options.cwd ?? process.cwd();

    // Extract execution/follow-up iteration from prompt if available
    const executionIteration = this.extractExecutionIteration(options.userMessage) ?? 1;
    const followUpIteration = this.extractFollowUpIteration(options.userMessage) ?? 0;

    await this.generateFilesForPhase(phase, outputDir, executionIteration, followUpIteration, options.userMessage);

    const now = new Date();
    const startedAt = new Date(now.getTime() - response.durationMs);

    return {
      exitCode: response.exitCode,
      durationMs: response.durationMs,
      stdoutTail: response.stdoutTail,
      stderrTail: response.stderrTail,
      interrupted: response.interrupted,
      signal: response.signal,
      modelUsed: options.model ?? 'mock-model',
      invocation: {
        command: 'mock',
        args: [options.userMessage],
        cwd: options.cwd,
        startedAt: startedAt.toISOString(),
        endedAt: now.toISOString(),
      },
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async getVersion(): Promise<string | undefined> {
    return this.versionString;
  }

  /**
   * Set a response for a specific prompt pattern
   */
  setResponse(pattern: RegExp | string, response: MockAdapterResponse): void {
    this.responseMap.set(pattern, response);
  }

  /**
   * Clear all custom responses
   */
  clearResponses(): void {
    this.responseMap.clear();
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory.length = 0;
  }

  private findResponse(prompt: string): MockAdapterResponse {
    for (const [pattern, response] of this.responseMap.entries()) {
      if (typeof pattern === 'string') {
        if (prompt.includes(pattern)) {
          return response;
        }
      } else {
        if (pattern.test(prompt)) {
          return response;
        }
      }
    }
    return this.defaultResponse;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.min(ms, 10))); // Cap at 10ms for tests
  }

  /**
   * Infer the execution phase from EngineExecutionOptions
   * Uses mode field as primary indicator, with prompt text as fallback for sub-phase distinction
   * 
   * This is the recommended approach as it leverages the structured mode field that's
   * correctly set by mapPhaseToMode() based on ExecutionContext, rather than relying
   * on fragile string matching in prompt text.
   */
  private inferPhaseFromOptions(options: EngineExecutionOptions): MockPhase {
    const { mode, userMessage } = options;

    // Use mode as primary indicator
    switch (mode) {
      case 'execute':
        // Within execute mode, use prompt text to distinguish execute-plan vs execute-follow-ups
        // Check for the specific pattern that indicates execute-follow-ups (more specific than just "follow-up")
        if (userMessage.includes('executing follow-up items from a previous execution run') || 
            userMessage.includes('executing follow-up items from a previous execution') ||
            userMessage.includes('previous execution summary is located')) {
          return 'execute-follow-ups';
        }
        // Default to execute-plan for execute mode
        return 'execute-plan';

      case 'audit':
        return 'gap-audit';

      case 'gap':
        return 'gap-plan';

      case 'plan':
        // Within plan mode, use prompt text to distinguish sub-phases
        // Detection order: Most specific patterns first to avoid false positives
        
        // 1. Check for explicit phase markers (most specific and unambiguous)
        if (userMessage.includes('PHASE: generate-summary') || userMessage.includes('**PHASE: generate-summary**')) {
          return 'generate-summary';
        }
        
        // 2. Check for generate-summary indicators (specific phrases)
        if (userMessage.includes('TENACIOUS C EXECUTION SUMMARY') || userMessage.includes('final-summary-output.txt')) {
          return 'generate-summary';
        }
        if (userMessage.includes('execution summary')) {
          return 'generate-summary';
        }
        
        // 3. Check for tool curation indicators
        if (userMessage.includes('Tool Curation') || userMessage.includes('tool-curation') || 
            userMessage.includes('verification tools') || userMessage.includes('verification commands')) {
          return 'tool-curation';
        }
        
        // 4. Check for other plan-mode sub-phases (less specific patterns)
        if (userMessage.includes('gap-plan') || userMessage.includes('Gap Closure Plan')) {
          return 'gap-plan';
        }
        if (userMessage.includes('answers') && userMessage.includes('revise')) {
          return 'answer-questions';
        }
        if (userMessage.includes('improve') || userMessage.includes('deepen')) {
          return 'improve-plan';
        }
        
        // 5. Default to plan-generation if no specific phase detected
        return 'plan-generation';

      default:
        // Fallback to prompt-based detection for unknown modes
        return this.inferPhaseFromPrompt(userMessage);
    }
  }

  /**
   * Infer the execution phase from the prompt content (legacy method)
   * @deprecated Use inferPhaseFromOptions() instead, which uses the mode field
   * Kept for backward compatibility
   */
  private inferPhaseFromPrompt(prompt: string): MockPhase {
    // Use template markers to detect phase
    if (prompt.includes('gap-audit') || prompt.includes('Gap Audit')) return 'gap-audit';
    if (prompt.includes('gap-plan') || prompt.includes('Gap Closure Plan')) return 'gap-plan';
    // Check for the specific pattern that indicates execute-follow-ups (more specific than just "follow-up")
    if (prompt.includes('executing follow-up items from a previous execution run') || 
        prompt.includes('executing follow-up items from a previous execution') ||
        prompt.includes('previous execution summary is located')) return 'execute-follow-ups';
    if (prompt.includes('Execute the plan') || prompt.includes('execute-plan')) return 'execute-plan';
    if (prompt.includes('Tool Curation') || prompt.includes('tool-curation') || 
        prompt.includes('verification tools') || prompt.includes('verification commands')) return 'tool-curation';
    if (prompt.includes('answers') && prompt.includes('revise')) return 'answer-questions';
    if (prompt.includes('improve') || prompt.includes('deepen')) return 'improve-plan';
    if (prompt.includes('execution summary') || prompt.includes('TENACIOUS C EXECUTION SUMMARY') || prompt.includes('final-summary-output.txt')) return 'generate-summary';
    return 'plan-generation';
  }

  /**
   * Extract execution iteration number from prompt
   */
  private extractExecutionIteration(prompt: string): number | undefined {
    const match = prompt.match(/execute-(\d+)/i) || prompt.match(/execution[- ]?iteration[:\s]*(\d+)/i);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Extract follow-up iteration number from prompt
   */
  private extractFollowUpIteration(prompt: string): number | undefined {
    const match = prompt.match(/followup-(\d+)/i) || prompt.match(/follow-?up[- ]?iteration[:\s]*(\d+)/i);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Generate files based on the detected phase
   */
  private async generateFilesForPhase(
    phase: MockPhase,
    outputDir: string,
    executionIteration: number,
    followUpIteration: number,
    prompt: string
  ): Promise<void> {
    // Ensure output directory exists
    mkdirSync(outputDir, { recursive: true });

    switch (phase) {
      case 'plan-generation':
        this.generateInitialPlan(outputDir);
        break;
      case 'answer-questions':
        this.generatePlanAfterAnswers(outputDir);
        break;
      case 'improve-plan':
        this.generateImprovedPlan(outputDir);
        break;
      case 'execute-plan':
        this.generateExecutionOutput(outputDir, executionIteration);
        break;
      case 'execute-follow-ups':
        this.generateFollowUpOutput(outputDir, executionIteration, followUpIteration);
        break;
      case 'gap-audit':
        this.generateGapAuditOutput(outputDir, executionIteration);
        break;
      case 'gap-plan':
        this.generateGapPlanOutput(outputDir, executionIteration);
        break;
      case 'tool-curation':
        this.generateToolCurationOutput(outputDir);
        break;
      case 'generate-summary':
        this.generateFinalSummary(outputDir, prompt);
        break;
    }
  }

  /**
   * Generate initial plan files
   */
  private generateInitialPlan(outputDir: string): void {
    const planPath = resolve(outputDir, 'plan.md');
    const metadataPath = resolve(outputDir, 'plan-metadata.json');

    const markdown = `# Mock Plan

This is a placeholder plan generated by the mock adapter.

## What a real plan would contain:
- **Requirements Snapshot**: Key goals and constraints distilled from the prompt
- **Scope**: Target areas (frontend/backend/both), in-scope and out-of-scope items
- **Non-goals**: Explicit exclusions
- **Assumptions**: Key assumptions made during planning
- **Success Criteria**: Testable completion criteria
- **Implementation Plan**: Step-by-step approach with file changes
- **Testing Plan**: Testing strategy

---
*Generated by MockAdapter for testing purposes*
`;

    const shouldHaveQuestions = questionAnswerCount < this.config.openQuestionIterations;

    const metadata: PlanMetadata = {
      schemaVersion: '1.0.0',
      confidence: this.config.startingConfidence!,
      openQuestions: shouldHaveQuestions ? [
        {
          question: `Mock question ${questionAnswerCount + 1}: What framework should be used?`,
          suggestedAnswers: ['Option A', 'Option B', 'Option C'],
        },
      ] : [],
      summary: 'Mock plan generated for testing. This summary describes what was planned.',
    };

    writeFileSync(planPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Generate plan files after answering questions
   */
  private generatePlanAfterAnswers(outputDir: string): void {
    const planPath = resolve(outputDir, 'plan.md');
    const metadataPath = resolve(outputDir, 'plan-metadata.json');

    questionAnswerCount++;

    const markdown = `# Mock Plan (After Answers)

This is a placeholder plan generated by the mock adapter after receiving answers to open questions.

## What a real plan would contain:
- Updated plan incorporating the answers provided
- Any new questions that arose from the answers
- Revised implementation approach based on clarifications

---
*Generated by MockAdapter for testing purposes (Question Answer Iteration ${questionAnswerCount})*
`;

    const shouldHaveQuestions = questionAnswerCount < this.config.openQuestionIterations;

    const metadata: PlanMetadata = {
      schemaVersion: '1.0.0',
      confidence: this.config.startingConfidence!,
      openQuestions: shouldHaveQuestions ? [
        {
          question: `Mock question ${questionAnswerCount + 1}: What framework should be used?`,
          suggestedAnswers: ['Option A', 'Option B', 'Option C'],
        },
      ] : [],
      summary: `Mock plan revised after answering questions (iteration ${questionAnswerCount}).`,
    };

    writeFileSync(planPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Generate improved plan files
   */
  private generateImprovedPlan(outputDir: string): void {
    const planPath = resolve(outputDir, 'plan.md');
    const metadataPath = resolve(outputDir, 'plan-metadata.json');

    improvePlanCount++;

    const confidenceIncrease = (this.config.targetConfidence! - this.config.startingConfidence!) / this.config.planRevisionIterations;
    const currentConfidence = Math.min(
      this.config.startingConfidence! + (improvePlanCount * confidenceIncrease),
      this.config.targetConfidence!
    );

    const markdown = `# Mock Plan (Improved)

This is a placeholder plan generated by the mock adapter after improving plan completeness.

## What a real plan would contain:
- Deeper analysis of requirements
- More detailed implementation steps
- Enhanced testing strategy
- Better risk assessment

---
*Generated by MockAdapter for testing purposes (Improve Plan Iteration ${improvePlanCount})*
`;

    const metadata: PlanMetadata = {
      schemaVersion: '1.0.0',
      confidence: Math.round(currentConfidence),
      openQuestions: [],
      summary: `Mock plan improved for completeness (iteration ${improvePlanCount}, confidence: ${Math.round(currentConfidence)}%).`,
    };

    writeFileSync(planPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Generate execution output files
   */
  private generateExecutionOutput(outputDir: string, executionIteration: number): void {
    const summaryPath = resolve(outputDir, `execution-summary-${executionIteration}.md`);
    const metadataPath = resolve(outputDir, 'execute-metadata.json');

    const markdown = `# Mock Execution Summary

This is a placeholder execution summary generated by the mock adapter.

## What a real execution summary would contain:
- List of files created/modified
- Code changes made
- Tests added or updated
- Any issues encountered
- Next steps or follow-ups needed

---
*Generated by MockAdapter for testing purposes (Execution Iteration ${executionIteration})*
`;

    const hardBlockers: HardBlocker[] = [];
    if (this.config.hardBlockers && executionIteration === 1) {
      hardBlockers.push({
        description: 'Mock hard blocker: Docker not running',
        reason: 'Docker is required for container tests but is not available',
      });
    }

    if (!followUpCounts.has(executionIteration)) {
      followUpCounts.set(executionIteration, 0);
    }

    const metadata: ExecuteMetadata = {
      schemaVersion: '1.0.0',
      hasFollowUps: true,
      hardBlockers,
      summary: `Mock execution completed iteration ${executionIteration}.`,
    };

    writeFileSync(summaryPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Generate follow-up execution output files
   */
  private generateFollowUpOutput(outputDir: string, executionIteration: number, followUpIteration: number): void {
    const currentFollowUpCount = followUpCounts.get(executionIteration) ?? 0;
    const newFollowUpCount = currentFollowUpCount + 1;
    followUpCounts.set(executionIteration, newFollowUpCount);

    const summaryPath = resolve(outputDir, `execution-summary-${executionIteration}-followup-${followUpIteration}.md`);
    const metadataPath = resolve(outputDir, 'execute-metadata.json');

    const markdown = `# Mock Follow-Up Execution Summary

This is a placeholder follow-up execution summary generated by the mock adapter.

## What a real follow-up summary would contain:
- Additional changes made based on previous execution
- Refinements and improvements
- Any remaining follow-ups needed

---
*Generated by MockAdapter for testing purposes (Execution Iteration ${executionIteration}, Follow-Up Iteration ${followUpIteration})*
`;

    const hasFollowUps = newFollowUpCount < this.config.followUpIterations;

    const metadata: ExecuteMetadata = {
      schemaVersion: '1.0.0',
      hasFollowUps,
      hardBlockers: [],
      summary: `Mock follow-up execution completed (execution iteration ${executionIteration}, follow-up iteration ${followUpIteration}).`,
    };

    writeFileSync(summaryPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Generate gap audit output files
   */
  private generateGapAuditOutput(outputDir: string, executionIteration: number): void {
    const summaryPath = resolve(outputDir, `gap-audit-summary-${executionIteration}.md`);
    const metadataPath = resolve(outputDir, 'gap-audit-metadata.json');

    gapAuditCount++;

    const markdown = `# Mock Gap Audit Summary

This is a placeholder gap audit summary generated by the mock adapter.

## What a real gap audit summary would contain:
- Analysis of implementation against requirements
- Identification of gaps or missing features
- Quality assessment
- Recommendations for gap closure

---
*Generated by MockAdapter for testing purposes (Gap Audit Iteration ${gapAuditCount})*
`;

    const gapsIdentified = gapAuditCount < this.config.executionIterations;

    const metadata: GapAuditMetadata = {
      schemaVersion: '1.0.0',
      gapsIdentified,
      summary: gapsIdentified
        ? `Mock gap audit found implementation gaps (iteration ${gapAuditCount}).`
        : `Mock gap audit found no gaps. Implementation complete (iteration ${gapAuditCount}).`,
    };

    writeFileSync(summaryPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Generate gap plan output files
   */
  private generateGapPlanOutput(outputDir: string, executionIteration: number): void {
    const planPath = resolve(outputDir, `gap-plan-${executionIteration}.md`);

    const markdown = `# Mock Gap Closure Plan

This is a placeholder gap closure plan generated by the mock adapter.

## What a real gap plan would contain:
- Specific gaps identified in the audit
- Plan to address each gap
- Implementation steps
- Testing strategy for gap closure

---
*Generated by MockAdapter for testing purposes (Execution Iteration ${executionIteration})*
`;

    writeFileSync(planPath, markdown);
  }

  /**
   * Generate tool curation output files
   */
  private generateToolCurationOutput(outputDir: string): void {
    const reportPath = resolve(outputDir, 'tool-curation-report.md');
    const metadataPath = resolve(outputDir, 'tool-curation-metadata.json');

    const markdown = `# Mock Tool Curation Report

This is a placeholder tool curation report generated by the mock adapter.

## What a real tool curation report would contain:
- Discovery of verification tools in the repository
- Analysis of which tools are relevant to the planned changes
- Selection of verification commands that must pass
- Evidence for each selection

## Mock Selected Verification Commands:
1. \`npm run lint\` - ESLint configured in package.json
2. \`npm run test\` - Vitest configured in package.json
3. \`npm run build\` - TypeScript compilation configured

---
*Generated by MockAdapter for testing purposes*
`;

    const metadata: ToolCurationMetadata = {
      schemaVersion: '1.0.0',
      summary: 'Selected 3 verification commands based on repository tooling: npm run lint (ESLint configured), npm run test (Vitest configured), and npm run build (TypeScript compilation). These commands must pass before the implementation is considered complete.',
    };

    writeFileSync(reportPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Generate final summary output file
   */
  private generateFinalSummary(outputDir: string, prompt: string): void {
    // Extract the output file path from the prompt
    const outputFileMatch = prompt.match(/write.*?to.*?this exact file path:\s*`([^`]+)`/i) ||
                           prompt.match(/file path:\s*`([^`]+)`/i) ||
                           prompt.match(/`([^`]*final-summary-output\.txt[^`]*)`/i);

    let outputFilePath: string;
    if (outputFileMatch && outputFileMatch[1]) {
      outputFilePath = outputFileMatch[1];
    } else {
      outputFilePath = resolve(outputDir, 'final-summary-output.txt');
    }

    const summary = `═══════════════════════════════════════════════════════════════
                    TENACIOUS C EXECUTION SUMMARY
═══════════════════════════════════════════════════════════════

📋 ORIGINAL REQUIREMENTS
───────────────────────────────────────────────────────────────
This is a placeholder summary generated by the mock adapter.

A real summary would contain:
- Brief summary of the original requirements that were requested
- Key goals and constraints from the initial prompt

✅ WORK ACCOMPLISHED
───────────────────────────────────────────────────────────────
This is a placeholder summary generated by the mock adapter.

A real summary would contain:
- Comprehensive summary of what was accomplished during execution
- Key features or changes that were implemented
- Files that were created or modified (summary, not exhaustive list)
- Tests that were added or updated
- Any significant metrics or improvements

📊 EXECUTION STATISTICS
───────────────────────────────────────────────────────────────
- Plan iterations: ${questionAnswerCount + improvePlanCount} (mock placeholder)
- Execution iterations: ${gapAuditCount} (mock placeholder)
- Follow-up iterations: ${Array.from(followUpCounts.values()).reduce((a, b) => a + b, 0)} (mock placeholder)
- Gap audits performed: ${gapAuditCount} (mock placeholder)
- Gap plans generated: ${gapAuditCount > 0 ? gapAuditCount - 1 : 0} (mock placeholder)

📁 OUTPUT LOCATION
───────────────────────────────────────────────────────────────
All artifacts saved to: ${outputDir}

═══════════════════════════════════════════════════════════════

Note: This is a placeholder summary generated by MockAdapter for testing purposes.
A real summary would be generated by reading all execution artifacts and aggregating
the work accomplished across all phases of the execution.`;

    const outputDirPath = resolve(outputFilePath, '..');
    mkdirSync(outputDirPath, { recursive: true });

    writeFileSync(outputFilePath, summary);
  }
}

/**
 * Create a mock adapter instance
 */
export function createMockAdapter(options: MockAdapterOptions = {}): MockAdapter {
  return new MockAdapter(options);
}

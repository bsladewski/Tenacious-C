import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { AICliTool } from '../interfaces/ai-cli-tool';
import { ExecutionContext } from '../interfaces/execution-context';
import { PlanMetadata } from '../schemas/plan-metadata.schema';
import { ExecuteMetadata, HardBlocker } from '../schemas/execute-metadata.schema';
import { GapAuditMetadata } from '../schemas/gap-audit-metadata.schema';

/**
 * Configuration for the mock CLI tool
 */
export interface MockConfig {
  /**
   * Number of times to output open questions before stopping
   * Default: 2
   */
  openQuestionIterations: number;
  
  /**
   * Number of low-confidence plan revisions before reaching threshold
   * Default: 2
   */
  planRevisionIterations: number;
  
  /**
   * Number of execution iterations (how many gap audit cycles)
   * Default: 2
   */
  executionIterations: number;
  
  /**
   * Number of follow-up iterations per execution before completing
   * Default: 2
   */
  followUpIterations: number;
  
  /**
   * Whether to output hard blockers on the first plan execution
   * Default: false
   */
  hardBlockers?: boolean;
  
  /**
   * Confidence threshold to eventually reach
   * Should match the CLI's --plan-confidence value
   * Default: 85
   */
  targetConfidence?: number;
  
  /**
   * Starting confidence (should be below threshold)
   * Default: 60
   */
  startingConfidence?: number;
}

export const DEFAULT_MOCK_CONFIG: MockConfig = {
  openQuestionIterations: 2,
  planRevisionIterations: 2,
  executionIterations: 2,
  followUpIterations: 2,
  hardBlockers: false,
  targetConfidence: 85,
  startingConfidence: 60,
};

/**
 * Global mock config (set via --mock-config CLI argument)
 * This is a simple approach to pass config to MockCliTool instances
 */
let globalMockConfig: Partial<MockConfig> | null = null;

/**
 * Set the global mock config (called from CLI argument parsing)
 */
export function setMockConfig(config: Partial<MockConfig> | null): void {
  globalMockConfig = config;
}

/**
 * Get the current global mock config
 */
export function getMockConfig(): Partial<MockConfig> | null {
  return globalMockConfig;
}

/**
 * Module-level state counters that persist across all MockCliTool instances
 * This ensures state is maintained even when new instances are created
 */
let questionAnswerCount: number = 0;
let improvePlanCount: number = 0;
let followUpCounts: Map<number, number> = new Map(); // executionIteration -> followUpCount
let gapAuditCount: number = 0;

/**
 * Reset all mock tool state counters (useful for testing)
 */
export function resetMockState(): void {
  questionAnswerCount = 0;
  improvePlanCount = 0;
  followUpCounts.clear();
  gapAuditCount = 0;
}

/**
 * Mock CLI tool implementation for testing workflows without AI costs
 */
export class MockCliTool implements AICliTool {
  private config: MockConfig;
  
  constructor(config: Partial<MockConfig> = {}) {
    // Merge: default -> global config -> constructor config
    this.config = { ...DEFAULT_MOCK_CONFIG, ...globalMockConfig, ...config };
  }
  
  async execute(prompt: string, model?: string, context?: ExecutionContext): Promise<void> {
    // Parse phase from context or infer from prompt
    const phase = context?.phase ?? this.inferPhaseFromPrompt(prompt);
    const outputDir = context?.outputDirectory ?? this.parseOutputDirFromPrompt(prompt);
    
    // Route to appropriate generator
    switch (phase) {
      case 'plan-generation':
        await this.generateInitialPlan(outputDir);
        break;
      case 'answer-questions':
        await this.generatePlanAfterAnswers(outputDir, context);
        break;
      case 'improve-plan':
        await this.generateImprovedPlan(outputDir, context);
        break;
      case 'execute-plan':
        await this.generateExecutionOutput(outputDir, context);
        break;
      case 'execute-follow-ups':
        await this.generateFollowUpOutput(outputDir, context);
        break;
      case 'gap-audit':
        await this.generateGapAuditOutput(outputDir, context);
        break;
      case 'gap-plan':
        await this.generateGapPlanOutput(outputDir, context);
        break;
      case 'generate-summary':
        await this.generateFinalSummary(prompt, context);
        break;
    }
  }
  
  private inferPhaseFromPrompt(prompt: string): ExecutionContext['phase'] {
    // Use template markers to detect phase
    if (prompt.includes('gap-audit') || prompt.includes('Gap Audit')) return 'gap-audit';
    if (prompt.includes('gap-plan') || prompt.includes('Gap Closure Plan')) return 'gap-plan';
    if (prompt.includes('follow-up') || prompt.includes('Follow-Up')) return 'execute-follow-ups';
    if (prompt.includes('Execute the plan') || prompt.includes('execute-plan')) return 'execute-plan';
    if (prompt.includes('answers') && prompt.includes('revise')) return 'answer-questions';
    if (prompt.includes('improve') || prompt.includes('deepen')) return 'improve-plan';
    if (prompt.includes('execution summary') || prompt.includes('TENACIOUS C EXECUTION SUMMARY') || prompt.includes('final-summary-output.txt')) return 'generate-summary';
    return 'plan-generation';
  }
  
  private parseOutputDirFromPrompt(prompt: string): string {
    // Try to extract output directory from prompt
    const outputDirMatch = prompt.match(/outputDirectory[:\s]+([^\s\n]+)/i) ||
                           prompt.match(/output directory[:\s]+([^\s\n]+)/i);
    if (outputDirMatch) {
      return outputDirMatch[1];
    }
    // Default fallback
    return resolve(process.cwd(), '.tenacious-c', 'mock-output');
  }
  
  private async generateInitialPlan(outputDir: string): Promise<void> {
    const planPath = resolve(outputDir, 'plan.md');
    const metadataPath = resolve(outputDir, 'plan-metadata.json');
    
    // Placeholder markdown
    const markdown = `# Mock Plan

This is a placeholder plan generated by the mock CLI tool.

## What a real plan would contain:
- **Requirements Snapshot**: Key goals and constraints distilled from the prompt
- **Scope**: Target areas (frontend/backend/both), in-scope and out-of-scope items
- **Non-goals**: Explicit exclusions
- **Assumptions**: Key assumptions made during planning
- **Success Criteria**: Testable completion criteria
- **Implementation Plan**: Step-by-step approach with file changes
- **Testing Plan**: Testing strategy

---
*Generated by MockCliTool for testing purposes*
`;
    
    // Metadata that drives state machine
    const shouldHaveQuestions = questionAnswerCount < this.config.openQuestionIterations;
    
    const metadata: PlanMetadata = {
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
  
  private async generatePlanAfterAnswers(outputDir: string, context?: ExecutionContext): Promise<void> {
    const planPath = resolve(outputDir, 'plan.md');
    const metadataPath = resolve(outputDir, 'plan-metadata.json');
    
    // Increment question answer count
    questionAnswerCount++;
    
    // Placeholder markdown
    const markdown = `# Mock Plan (After Answers)

This is a placeholder plan generated by the mock CLI tool after receiving answers to open questions.

## What a real plan would contain:
- Updated plan incorporating the answers provided
- Any new questions that arose from the answers
- Revised implementation approach based on clarifications

---
*Generated by MockCliTool for testing purposes (Question Answer Iteration ${questionAnswerCount})*
`;
    
    // Metadata that drives state machine
    const shouldHaveQuestions = questionAnswerCount < this.config.openQuestionIterations;
    
    const metadata: PlanMetadata = {
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
  
  private async generateImprovedPlan(outputDir: string, context?: ExecutionContext): Promise<void> {
    const planPath = resolve(outputDir, 'plan.md');
    const metadataPath = resolve(outputDir, 'plan-metadata.json');
    
    // Increment improve plan count
    improvePlanCount++;
    
    // Calculate confidence: start low, increase until threshold is reached
    const confidenceIncrease = (this.config.targetConfidence! - this.config.startingConfidence!) / this.config.planRevisionIterations;
    const currentConfidence = Math.min(
      this.config.startingConfidence! + (improvePlanCount * confidenceIncrease),
      this.config.targetConfidence!
    );
    
    // Placeholder markdown
    const markdown = `# Mock Plan (Improved)

This is a placeholder plan generated by the mock CLI tool after improving plan completeness.

## What a real plan would contain:
- Deeper analysis of requirements
- More detailed implementation steps
- Enhanced testing strategy
- Better risk assessment

---
*Generated by MockCliTool for testing purposes (Improve Plan Iteration ${improvePlanCount})*
`;
    
    const metadata: PlanMetadata = {
      confidence: Math.round(currentConfidence),
      openQuestions: [],
      summary: `Mock plan improved for completeness (iteration ${improvePlanCount}, confidence: ${Math.round(currentConfidence)}%).`,
    };
    
    writeFileSync(planPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  private async generateExecutionOutput(outputDir: string, context?: ExecutionContext): Promise<void> {
    const summaryPath = resolve(outputDir, `execution-summary-${context?.executionIteration || 1}.md`);
    const metadataPath = resolve(outputDir, 'execute-metadata.json');
    
    const executionIteration = context?.executionIteration || 1;
    
    // Placeholder markdown
    const markdown = `# Mock Execution Summary

This is a placeholder execution summary generated by the mock CLI tool.

## What a real execution summary would contain:
- List of files created/modified
- Code changes made
- Tests added or updated
- Any issues encountered
- Next steps or follow-ups needed

---
*Generated by MockCliTool for testing purposes (Execution Iteration ${executionIteration})*
`;
    
    // Determine if we should output hard blockers (only on first execution if configured)
    const hardBlockers: HardBlocker[] = [];
    if (this.config.hardBlockers && executionIteration === 1) {
      hardBlockers.push({
        description: 'Mock hard blocker: Docker not running',
        reason: 'Docker is required for container tests but is not available',
      });
    }
    
    // Initialize follow-up count for this execution iteration if not already set
    if (!followUpCounts.has(executionIteration)) {
      followUpCounts.set(executionIteration, 0);
    }
    
    const metadata: ExecuteMetadata = {
      hasFollowUps: true, // Will be set to false when follow-up limit is reached
      hardBlockers,
      summary: `Mock execution completed iteration ${executionIteration}.`,
    };
    
    writeFileSync(summaryPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  private async generateFollowUpOutput(outputDir: string, context?: ExecutionContext): Promise<void> {
    const executionIteration = context?.executionIteration || 1;
    const followUpIteration = context?.followUpIteration ?? 0;
    
    // Get or initialize follow-up count for this execution iteration
    const currentFollowUpCount = followUpCounts.get(executionIteration) ?? 0;
    const newFollowUpCount = currentFollowUpCount + 1;
    followUpCounts.set(executionIteration, newFollowUpCount);
    
    const summaryPath = resolve(outputDir, `execution-summary-${executionIteration}-followup-${followUpIteration}.md`);
    const metadataPath = resolve(outputDir, 'execute-metadata.json');
    
    // Placeholder markdown
    const markdown = `# Mock Follow-Up Execution Summary

This is a placeholder follow-up execution summary generated by the mock CLI tool.

## What a real follow-up summary would contain:
- Additional changes made based on previous execution
- Refinements and improvements
- Any remaining follow-ups needed

---
*Generated by MockCliTool for testing purposes (Execution Iteration ${executionIteration}, Follow-Up Iteration ${followUpIteration})*
`;
    
    // Check if we've reached the follow-up limit for this execution iteration
    const hasFollowUps = newFollowUpCount < this.config.followUpIterations;
    
    const metadata: ExecuteMetadata = {
      hasFollowUps,
      hardBlockers: [],
      summary: `Mock follow-up execution completed (execution iteration ${executionIteration}, follow-up iteration ${followUpIteration}).`,
    };
    
    writeFileSync(summaryPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  private async generateGapAuditOutput(outputDir: string, context?: ExecutionContext): Promise<void> {
    const summaryPath = resolve(outputDir, `gap-audit-summary-${context?.executionIteration || 1}.md`);
    const metadataPath = resolve(outputDir, 'gap-audit-metadata.json');
    
    // Increment gap audit count
    gapAuditCount++;
    
    // Placeholder markdown
    const markdown = `# Mock Gap Audit Summary

This is a placeholder gap audit summary generated by the mock CLI tool.

## What a real gap audit summary would contain:
- Analysis of implementation against requirements
- Identification of gaps or missing features
- Quality assessment
- Recommendations for gap closure

---
*Generated by MockCliTool for testing purposes (Gap Audit Iteration ${gapAuditCount})*
`;
    
    // Check if we've reached the execution iteration limit
    const gapsIdentified = gapAuditCount < this.config.executionIterations;
    
    const metadata: GapAuditMetadata = {
      gapsIdentified,
      summary: gapsIdentified 
        ? `Mock gap audit found implementation gaps (iteration ${gapAuditCount}).`
        : `Mock gap audit found no gaps. Implementation complete (iteration ${gapAuditCount}).`,
    };
    
    writeFileSync(summaryPath, markdown);
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  private async generateGapPlanOutput(outputDir: string, context?: ExecutionContext): Promise<void> {
    const executionIteration = context?.executionIteration || 1;
    const planPath = resolve(outputDir, `gap-plan-${executionIteration}.md`);
    
    // Placeholder markdown
    const markdown = `# Mock Gap Closure Plan

This is a placeholder gap closure plan generated by the mock CLI tool.

## What a real gap plan would contain:
- Specific gaps identified in the audit
- Plan to address each gap
- Implementation steps
- Testing strategy for gap closure

---
*Generated by MockCliTool for testing purposes (Execution Iteration ${executionIteration})*
`;
    
    writeFileSync(planPath, markdown);
  }
  
  private async generateFinalSummary(prompt: string, context?: ExecutionContext): Promise<void> {
    // Extract the output file path from the prompt - look for the explicit instruction
    const outputFileMatch = prompt.match(/write.*?to.*?this exact file path:\s*`([^`]+)`/i) || 
                           prompt.match(/file path:\s*`([^`]+)`/i) ||
                           prompt.match(/`([^`]*final-summary-output\.txt[^`]*)`/i);
    
    // Use timestamp directory from context if available (preferred method)
    // Otherwise try to extract from prompt
    let timestampDirectory: string;
    if (context?.outputDirectory) {
      timestampDirectory = context.outputDirectory;
    } else {
      // Try to extract timestamp directory from prompt - look for the template variable
      // The prompt contains: "The execution artifacts are located in: `{{timestampDirectory}}`"
      // After interpolation it will be: "The execution artifacts are located in: `/path/to/.tenacious-c/timestamp`"
      const timestampDirMatch = prompt.match(/execution artifacts are located in:\s*`([^`]+)`/i) ||
                                prompt.match(/`([^`]*\.tenacious-c\/[^`/]+)`/);
      
      if (timestampDirMatch && timestampDirMatch[1]) {
        timestampDirectory = timestampDirMatch[1];
      } else {
        // Fallback: try to find any .tenacious-c path with a timestamp pattern
        const fallbackMatch = prompt.match(/([^\s`]+\.tenacious-c\/[^\s`/]+)/);
        if (fallbackMatch && fallbackMatch[1]) {
          timestampDirectory = fallbackMatch[1];
        } else {
          // Last resort: if we can't find it, try to extract from output file path
          if (outputFileMatch && outputFileMatch[1]) {
            const outputPath = outputFileMatch[1];
            // Extract directory from output file path
            timestampDirectory = resolve(outputPath, '..');
          } else {
            // This shouldn't happen, but provide a sensible default
            throw new Error('Could not determine timestamp directory from prompt. Mock tool requires timestamp directory to be specified in the summary generation prompt.');
          }
        }
      }
    }
    
    // Determine output file path
    let outputFilePath: string;
    if (outputFileMatch && outputFileMatch[1]) {
      outputFilePath = outputFileMatch[1];
    } else {
      // Default to timestampDirectory/final-summary-output.txt
      outputFilePath = resolve(timestampDirectory, 'final-summary-output.txt');
    }
    
    // Generate placeholder summary that describes what a real summary would contain
    const summary = `═══════════════════════════════════════════════════════════════
                    TENACIOUS C EXECUTION SUMMARY
═══════════════════════════════════════════════════════════════

📋 ORIGINAL REQUIREMENTS
───────────────────────────────────────────────────────────────
This is a placeholder summary generated by the mock CLI tool.

A real summary would contain:
- Brief summary of the original requirements that were requested
- Key goals and constraints from the initial prompt

✅ WORK ACCOMPLISHED
───────────────────────────────────────────────────────────────
This is a placeholder summary generated by the mock CLI tool.

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
All artifacts saved to: ${timestampDirectory}

═══════════════════════════════════════════════════════════════

Note: This is a placeholder summary generated by MockCliTool for testing purposes.
A real summary would be generated by reading all execution artifacts and aggregating
the work accomplished across all phases of the execution.`;

    // Ensure directory exists
    const outputDir = resolve(outputFilePath, '..');
    mkdirSync(outputDir, { recursive: true });
    
    writeFileSync(outputFilePath, summary);
  }
}

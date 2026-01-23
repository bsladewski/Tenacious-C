/**
 * Orchestrator-based plan execution
 *
 * This module provides the main entry point for plan execution
 * using the Orchestrator class with explicit state machine.
 *
 * This is the default execution engine for tenacious-c.
 */

import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import {
  createOrchestratorFromLegacyOptions,
  LegacyConfigOptions,
} from '../orchestration';
import { Orchestrator, OrchestratorDependencies } from '../core/orchestrator';
import { EffectiveConfig, ExecutionContext } from '../types';
import { CliToolType } from '../config';
import { getPlaceholderTemplate } from '../templates/plan.template';
import { getAnswerQuestionsTemplate } from '../templates/answer-questions.template';
import { getImprovePlanTemplate } from '../templates/improve-plan.template';
import { getExecutePlanTemplate } from '../templates/execute-plan.template';
import { getExecuteFollowUpsTemplate } from '../templates/execute-follow-ups.template';
import { getGapAuditTemplate } from '../templates/gap-audit.template';
import { getGapPlanTemplate } from '../templates/gap-plan.template';
import { getToolCurationTemplate } from '../templates/tool-curation.template';
import { interpolateTemplate } from '../templates/prompt-template';
import {
  readPlanMetadata,
  clearOpenQuestions,
  writeRequirements,
  trackQAHistory,
  readQAHistory,
  readExecuteMetadata,
  readGapAuditMetadata,
  readToolCurationMetadata,
  validateExecutionArtifacts,
  validatePlanArtifacts,
  saveExecutionState,
  findLatestResumableRun,
} from '../io';
import {
  orchestratorRunStateToExecutionState,
  executionStateToOrchestratorRunState,
  extractResumeContext,
} from '../core';
import { promptForAnswers, formatAnswers, promptForHardBlockerResolution, formatHardBlockerResolutions, previewPlan } from '../ui';
import { generateFinalSummary } from '../logging';
import { getCliToolForAction, executeWithFallback, selectCliTool, selectCliToolForAction } from '../engines';
import inquirer from 'inquirer';

/**
 * Format iteration display string (e.g., "1/5" or "1/🌟" in destiny mode)
 */
function formatIteration(current: number, max: number, isDestinyMode: boolean): string {
  return isDestinyMode ? `${current}/🌟` : `${current}/${max}`;
}

/**
 * Orchestrator-based plan execution context
 */
interface OrchestratorPlanContext {
  orchestrator: Orchestrator;
  config: EffectiveConfig;
  deps: OrchestratorDependencies;
  timestampDirectory: string;
  planOutputDirectory: string;
  requirementsPath: string;
  currentPlanPath: string;
  // Mutable state for CLI tool fallback tracking
  currentPlanCliTool: CliToolType | null;
  currentPlanModel: string | null;
  currentExecuteCliTool: CliToolType | null;
  currentExecuteModel: string | null;
  currentAuditCliTool: CliToolType | null;
  currentAuditModel: string | null;
  currentFallbackTools: CliToolType[];
  // Legacy options for tool selection
  specifiedCliTool: CliToolType | null;
  // Mutable directories set during execution
  currentExecuteOutputDirectory?: string;
  currentGapAuditOutputDirectory?: string;
  // Nemesis mode flag
  nemesis: boolean;
}

/**
 * Persist current orchestration state to disk
 */
function persistState(ctx: OrchestratorPlanContext): void {
  const runState = ctx.orchestrator.getRunState();
  const executionState = orchestratorRunStateToExecutionState(
    runState,
    ctx.timestampDirectory,
    ctx.config.input,
    ctx.planOutputDirectory,
    ctx.currentPlanPath,
    ctx.currentExecuteOutputDirectory,
    ctx.currentGapAuditOutputDirectory
  );
  saveExecutionState(ctx.timestampDirectory, executionState);
}

/**
 * Execute plan using the Orchestrator state machine
 */
export async function executePlanWithOrchestrator(
  input: string,
  maxRevisions: number = 10,
  planConfidenceThreshold: number = 85,
  maxFollowUpIterations: number = 10,
  execIterations: number = 5,
  isDestinyMode: boolean = false,
  specifiedCliTool: CliToolType | null = null,
  previewPlanFlag: boolean = false,
  resumeFlag: boolean = false,
  planModel: string | null = null,
  executeModel: string | null = null,
  auditModel: string | null = null,
  planCliTool: CliToolType | null = null,
  executeCliTool: CliToolType | null = null,
  auditCliTool: CliToolType | null = null,
  fallbackCliTools: CliToolType[] = [],
  noInteractive: boolean = false,
  verbose: boolean = false,
  debug: boolean = false,
  jsonOutput: boolean = false,
  nemesis: boolean = false,
  planOnly: boolean = false
): Promise<void> {
  // Convert input to requirements
  let requirements: string;
  if (existsSync(input)) {
    const absolutePath = isAbsolute(input) ? input : resolve(process.cwd(), input);
    requirements = `Refer to \`${absolutePath}\` for requirements.`;
  } else {
    requirements = input;
  }

  // Create legacy options for orchestrator factory
  const legacyOptions: LegacyConfigOptions = {
    input: requirements,
    maxRevisions,
    planConfidenceThreshold,
    maxFollowUpIterations,
    execIterations,
    isDestinyMode,
    specifiedCliTool,
    previewPlanFlag,
    resumeFlag,
    planModel,
    executeModel,
    auditModel,
    planCliTool,
    executeCliTool,
    auditCliTool,
    fallbackCliTools,
    planOnly,
  };

  // Create orchestrator with production dependencies
  const { orchestrator, config, deps } = createOrchestratorFromLegacyOptions(legacyOptions, {
    verbose,
    debug,
    jsonOutput,
    nonInteractive: noInteractive,
  });

  // Handle resume or new run
  let timestampDirectory: string;
  let planOutputDirectory: string;
  let currentPlanPath: string;
  let currentExecuteOutputDirectory: string | undefined;
  let currentGapAuditOutputDirectory: string | undefined;

  if (resumeFlag) {
    // Find latest resumable run
    const tenaciousCDir = config.paths.artifactBaseDir;
    const savedState = findLatestResumableRun(tenaciousCDir);

    if (!savedState) {
      console.error('\n❌ No resumable run found. Start a new run without --resume.\n');
      process.exit(1);
    }

    // Use directories from saved state
    timestampDirectory = savedState.timestampDirectory;
    const resumeContext = extractResumeContext(savedState, timestampDirectory);
    planOutputDirectory = resumeContext.planOutputDirectory;
    currentPlanPath = resumeContext.currentPlanPath;
    currentExecuteOutputDirectory = resumeContext.currentExecuteOutputDirectory;
    currentGapAuditOutputDirectory = resumeContext.currentGapAuditOutputDirectory;

    // Resume uses the saved requirements
    requirements = savedState.requirements;

    console.log(`\n📂 Resuming from: ${timestampDirectory}`);
  } else {
    // Set up new directories
    timestampDirectory = resolve(config.paths.artifactBaseDir, config.runId);
    planOutputDirectory = resolve(timestampDirectory, 'plan');
    currentPlanPath = resolve(planOutputDirectory, 'plan.md');

    // Ensure directories exist
    await deps.fileSystem.mkdir(planOutputDirectory, true);

    // Write requirements
    writeRequirements(timestampDirectory, requirements);
  }

  // Create context for orchestration
  const ctx: OrchestratorPlanContext = {
    orchestrator,
    config,
    deps,
    timestampDirectory,
    planOutputDirectory,
    requirementsPath: resolve(timestampDirectory, 'requirements.txt'),
    currentPlanPath,
    currentPlanCliTool: planCliTool,
    currentPlanModel: planModel,
    currentExecuteCliTool: executeCliTool,
    currentExecuteModel: executeModel,
    currentAuditCliTool: auditCliTool,
    currentAuditModel: auditModel,
    currentFallbackTools: [...fallbackCliTools],
    specifiedCliTool,
    nemesis,
    currentExecuteOutputDirectory,
    currentGapAuditOutputDirectory,
  };

  // Start or resume orchestration
  if (resumeFlag) {
    // Load saved state and resume
    const tenaciousCDir = config.paths.artifactBaseDir;
    const savedState = findLatestResumableRun(tenaciousCDir);

    if (!savedState) {
      // This shouldn't happen as we checked above, but TypeScript needs it
      throw new Error('No resumable run found');
    }

    // Convert ExecutionState to OrchestratorRunState
    const orchestratorState = executionStateToOrchestratorRunState(savedState, config);

    // Resume from saved state
    const resumeResult = orchestrator.resume(orchestratorState);
    if (!resumeResult.success) {
      throw new Error(`Failed to resume orchestration: ${resumeResult.description}`);
    }

    console.log(`📋 Resumed: ${orchestrator.getStateDescription()}`);
  } else {
    // Start new orchestration
    const startResult = orchestrator.start(requirements);
    if (!startResult.success) {
      throw new Error(`Failed to start orchestration: ${startResult.description}`);
    }
    // Don't print state description here - handlers will print their own messages
    // (removes duplicate "Generating initial plan" before handler's "Generating initial plan...")
  }

  // Run the orchestration loop
  await runOrchestrationLoop(ctx, previewPlanFlag);

  // Generate final summary
  if (orchestrator.getCurrentState() === 'COMPLETE') {
    console.log('\n📊 Generating execution summary...\n');
    try {
      const toolType = await selectCliTool(specifiedCliTool);
      const summary = await generateFinalSummary(timestampDirectory, toolType);
      console.log(summary);
    } catch (error) {
      console.warn(`\n⚠️  Could not generate final summary: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`\n📁 Artifacts are available in: ${timestampDirectory}\n`);
    }

    // In plan-only mode, copy the final plan to the working directory
    if (config.runMode.planOnly) {
      const timestamp = Math.floor(Date.now() / 1000);
      const destPath = resolve(process.cwd(), `plan_${timestamp}.md`);
      try {
        const copyResult = await deps.fileSystem.copy(currentPlanPath, destPath);
        if (copyResult.ok) {
          console.log(`\n📄 Plan copied to: ${destPath}`);
        } else {
          console.warn(`\n⚠️  Could not copy plan file: ${copyResult.error.message}`);
        }
      } catch (error) {
        console.warn(`\n⚠️  Could not copy plan file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

/**
 * Main orchestration loop
 */
async function runOrchestrationLoop(
  ctx: OrchestratorPlanContext,
  previewPlanFlag: boolean
): Promise<void> {
  const { orchestrator } = ctx;

  while (!orchestrator.isComplete()) {
    const state = orchestrator.getCurrentState();

    switch (state) {
      case 'PLAN_GENERATION':
        await handlePlanGeneration(ctx);
        break;

      case 'PLAN_REVISION':
        await handlePlanRevision(ctx, previewPlanFlag);
        break;

      case 'TOOL_CURATION':
        await handleToolCuration(ctx);
        break;

      case 'EXECUTION':
        await handleExecution(ctx);
        break;

      case 'FOLLOW_UPS':
        await handleFollowUps(ctx);
        break;

      case 'GAP_AUDIT':
        await handleGapAudit(ctx);
        break;

      case 'GAP_PLAN':
        await handleGapPlan(ctx);
        break;

      case 'SUMMARY_GENERATION':
        orchestrator.onSummaryComplete();
        break;

      default:
        // Shouldn't reach here
        throw new Error(`Unexpected state: ${state}`);
    }
  }

  if (orchestrator.getCurrentState() === 'FAILED') {
    const summary = orchestrator.getRunSummary();
    throw new Error(`Orchestration failed at phase: ${summary.phase}`);
  }
}

/**
 * Handle plan generation phase
 */
async function handlePlanGeneration(ctx: OrchestratorPlanContext): Promise<void> {
  const { orchestrator, config, planOutputDirectory } = ctx;

  console.log('\n📋 Generating initial plan...');

  // Get template and interpolate
  const template = getPlaceholderTemplate();
  const prompt = interpolateTemplate(template, {
    outputDirectory: planOutputDirectory,
    requirements: config.input,
  });

  // Get CLI tool
  const planTool = await getCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);
  const planToolType = await selectCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);

  // Store the selected tool type in context for subsequent iterations
  if (!ctx.currentPlanCliTool) {
    ctx.currentPlanCliTool = planToolType;
  }

  // Execute with fallback
  const context: ExecutionContext = {
    phase: 'plan-generation',
    outputDirectory: planOutputDirectory,
  };
  const result = await executeWithFallback(
    planTool,
    planToolType,
    prompt,
    ctx.currentPlanModel,
    ctx.currentFallbackTools,
    context
  );

  // Update state if fallback occurred
  if (result.fallbackOccurred) {
    ctx.currentPlanCliTool = result.usedTool;
    ctx.currentPlanModel = result.usedModel;
    ctx.currentFallbackTools = result.remainingFallbackTools;
  }

  // Validate plan artifacts before proceeding
  const validationResult = validatePlanArtifacts(planOutputDirectory);
  if (!validationResult.valid) {
    console.error('\n❌ Artifact validation failed after plan generation:');
    if (validationResult.missing.length > 0) {
      console.error(`   Missing files: ${validationResult.missing.join(', ')}`);
    }
    if (validationResult.errors.length > 0) {
      for (const error of validationResult.errors) {
        console.error(`   Error: ${error}`);
      }
    }
    console.error('\n   Possible causes:');
    console.error('   - The CLI tool may have exited before writing artifacts');
    console.error('   - Check the execution transcripts for errors');
    console.error('   - Try running with a different CLI tool using --fallback-cli-tools\n');
    process.exit(1);
  }

  // Transition to revision phase
  orchestrator.onPlanGenerated();
  persistState(ctx);
  console.log(`✅ Initial plan generated`);
}

/**
 * Handle plan revision phase
 */
async function handlePlanRevision(
  ctx: OrchestratorPlanContext,
  previewPlanFlag: boolean
): Promise<void> {
  const { orchestrator, config, planOutputDirectory, timestampDirectory } = ctx;
  const isDestinyMode = config.runMode.unlimitedIterations;

  try {
    const metadata = readPlanMetadata(planOutputDirectory);

    // Handle preview on first revision
    if (previewPlanFlag && orchestrator.getContext().planRevisionCount === 0) {
      const planPath = resolve(planOutputDirectory, 'plan.md');
      console.log('\n📄 Previewing plan...');
      await previewPlan(planPath);
      console.log('\n');

      const response = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continue',
          message: 'Do you want to continue with plan execution?',
          default: true,
        },
      ]);

      if (!response.continue) {
        console.log('\n❌ Plan execution cancelled by user.\n');
        process.exit(0);
      }
      console.log('\n');
    }

    // Check for open questions
    if (metadata.openQuestions && metadata.openQuestions.length > 0) {
      const revisionCount = orchestrator.getContext().planRevisionCount;
      console.log(`\n📋 Open questions found (revision ${formatIteration(revisionCount + 1, config.limits.maxPlanIterations, isDestinyMode)}). Please provide answers:`);

      // Notify orchestrator of open questions
      orchestrator.onOpenQuestionsFound(metadata.openQuestions.length);

      const questionsToAnswer = [...metadata.openQuestions];
      clearOpenQuestions(planOutputDirectory);

      // Prompt for answers
      const answers = await promptForAnswers(questionsToAnswer);

      // Track Q&A history
      for (const question of questionsToAnswer) {
        const answer = answers.get(question.question) || '';
        trackQAHistory(timestampDirectory, question.question, answer);
      }

      const formattedAnswers = formatAnswers(answers);
      const qaHistory = readQAHistory(timestampDirectory);

      // Execute answer-questions template
      const answerTemplate = getAnswerQuestionsTemplate();
      const answerPrompt = interpolateTemplate(answerTemplate, {
        outputDirectory: planOutputDirectory,
        answers: formattedAnswers,
        qaHistory: qaHistory || '',
      });

      const planTool = await getCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);
      const planToolType = await selectCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);

      // Store the selected tool type in context for subsequent iterations
      if (!ctx.currentPlanCliTool) {
        ctx.currentPlanCliTool = planToolType;
      }

      console.log(`\n🔄 Revising plan with your answers (revision ${formatIteration(revisionCount + 1, config.limits.maxPlanIterations, isDestinyMode)})...`);

      const answerContext: ExecutionContext = {
        phase: 'answer-questions',
        outputDirectory: planOutputDirectory,
        questionAnswerIteration: revisionCount,
      };
      const result = await executeWithFallback(
        planTool,
        planToolType,
        answerPrompt,
        ctx.currentPlanModel,
        ctx.currentFallbackTools,
        answerContext
      );

      if (result.fallbackOccurred) {
        ctx.currentPlanCliTool = result.usedTool;
        ctx.currentPlanModel = result.usedModel;
        ctx.currentFallbackTools = result.remainingFallbackTools;
      }

      orchestrator.onQuestionsAnswered();
      persistState(ctx);
      return;
    }

    // Check confidence threshold
    if (metadata.confidence < config.thresholds.planConfidence) {
      const revisionCount = orchestrator.getContext().planRevisionCount;
      console.log(`\n📊 Plan confidence (${metadata.confidence}%) is below threshold (${config.thresholds.planConfidence}%). Deepening plan...`);

      orchestrator.onConfidenceLow(metadata.confidence, config.thresholds.planConfidence);

      const improveTemplate = getImprovePlanTemplate();
      const improvePrompt = interpolateTemplate(improveTemplate, {
        outputDirectory: planOutputDirectory,
      });

      const planTool = await getCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);
      const planToolType = await selectCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);

      // Store the selected tool type in context for subsequent iterations
      if (!ctx.currentPlanCliTool) {
        ctx.currentPlanCliTool = planToolType;
      }

      console.log(`\n🔄 Improving plan completeness (revision ${formatIteration(revisionCount + 1, config.limits.maxPlanIterations, isDestinyMode)})...`);

      const improveContext: ExecutionContext = {
        phase: 'improve-plan',
        outputDirectory: planOutputDirectory,
        improvePlanIteration: revisionCount,
      };
      const result = await executeWithFallback(
        planTool,
        planToolType,
        improvePrompt,
        ctx.currentPlanModel,
        ctx.currentFallbackTools,
        improveContext
      );

      if (result.fallbackOccurred) {
        ctx.currentPlanCliTool = result.usedTool;
        ctx.currentPlanModel = result.usedModel;
        ctx.currentFallbackTools = result.remainingFallbackTools;
      }

      orchestrator.onPlanImproved();
      persistState(ctx);
      return;
    }

    // Check iteration limit
    const stopCondition = orchestrator.checkPlanRevisionStop(false, metadata.confidence);
    if (stopCondition.shouldStop && stopCondition.reason === 'LIMIT_REACHED') {
      console.log(`\n⚠️  Reached maximum plan revisions (${config.limits.maxPlanIterations}). Stopping.`);
    }

    // Plan is complete
    console.log(`\n✅ Plan complete! Confidence: ${metadata.confidence}% (threshold: ${config.thresholds.planConfidence}%)`);

    if (metadata.summary) {
      console.log('\n📋 Plan Summary:');
      console.log('───────────────────────────────────────────────────────────────');
      console.log(metadata.summary);
      console.log('───────────────────────────────────────────────────────────────');
    }

    // If plan-only mode, skip execution and go directly to summary generation
    // Important: Check BEFORE onPlanComplete() to avoid transitioning to EXECUTION first
    if (config.runMode.planOnly) {
      console.log('\n📋 Plan-only mode: skipping execution phase');
      orchestrator.onGenerateSummary();
    } else {
      orchestrator.onPlanComplete(metadata.confidence);
    }

    persistState(ctx);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      console.error('\n❌ Could not read plan-metadata.json. Cannot continue without metadata.');
      console.error(`   Error: ${error.message}`);
      console.error('   This may indicate the plan generation was interrupted.\n');
      process.exit(1);
    } else {
      throw error;
    }
  }
}

/**
 * Handle tool curation phase
 */
async function handleToolCuration(ctx: OrchestratorPlanContext): Promise<void> {
  const { orchestrator, timestampDirectory } = ctx;

  console.log('\n🔧 Curating verification tools...');

  // Set up tool curation output directory
  const toolCurationOutputDirectory = resolve(timestampDirectory, 'tool-curation');
  await ctx.deps.fileSystem.mkdir(toolCurationOutputDirectory, true);

  // Get template and interpolate
  const repoRoot = process.cwd();
  const template = getToolCurationTemplate();
  const prompt = interpolateTemplate(template, {
    requirementsPath: ctx.requirementsPath,
    planPath: ctx.currentPlanPath,
    outputDirectory: toolCurationOutputDirectory,
    repoRoot,
  });

  // Get CLI tool for curation (uses plan tool)
  const planTool = await getCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);
  const planToolType = await selectCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);

  // Store the selected tool type in context for subsequent iterations
  if (!ctx.currentPlanCliTool) {
    ctx.currentPlanCliTool = planToolType;
  }

  // Execute tool curation
  const context: ExecutionContext = {
    phase: 'tool-curation',
    outputDirectory: toolCurationOutputDirectory,
  };
  const result = await executeWithFallback(
    planTool,
    planToolType,
    prompt,
    ctx.currentPlanModel,
    ctx.currentFallbackTools,
    context
  );

  // Update state if fallback occurred
  if (result.fallbackOccurred) {
    ctx.currentPlanCliTool = result.usedTool;
    ctx.currentPlanModel = result.usedModel;
    ctx.currentFallbackTools = result.remainingFallbackTools;
  }

  console.log('\n✅ Tool curation complete!');

  // Read and print summary
  try {
    const toolCurationMetadata = readToolCurationMetadata(toolCurationOutputDirectory);
    if (toolCurationMetadata.summary) {
      console.log('\n🔧 Tool Curation Summary:');
      console.log('───────────────────────────────────────────────────────────────');
      console.log(toolCurationMetadata.summary);
      console.log('───────────────────────────────────────────────────────────────');
    }
  } catch (error) {
    // Non-fatal: log warning but continue
    if (error instanceof Error && error.message.includes('not found')) {
      console.log('\n⚠️  Could not read tool-curation-metadata.json. Continuing...');
    }
  }

  // Transition to execution
  orchestrator.onToolCurationComplete();
  persistState(ctx);
}

/**
 * Handle execution phase
 */
async function handleExecution(ctx: OrchestratorPlanContext): Promise<void> {
  const { orchestrator, config, timestampDirectory } = ctx;

  // Defense in depth: should not reach execution in plan-only mode
  // This is a safety guard in case the primary check in handlePlanRevision() is bypassed
  if (config.runMode.planOnly) {
    console.log('\n⚠️  Warning: Reached execution phase in plan-only mode. Skipping.');
    orchestrator.onGenerateSummary();
    persistState(ctx);
    return;
  }

  const execIterationCount = orchestrator.getContext().execIterationCount;
  const isDestinyMode = config.runMode.unlimitedIterations;
  const isInitialExecution = execIterationCount === 1;
  const planType = isInitialExecution ? 'initial plan' : 'gap closure plan';

  console.log(`\n🚀 Starting ${planType} execution (execution iteration ${formatIteration(execIterationCount, config.limits.maxExecIterations, isDestinyMode)})...`);

  // Set up execution directory
  const executeOutputDirectory = isInitialExecution
    ? resolve(timestampDirectory, 'execute')
    : resolve(timestampDirectory, `execute-${execIterationCount}`);

  await ctx.deps.fileSystem.mkdir(executeOutputDirectory, true);

  // Execute plan
  const executeTemplate = getExecutePlanTemplate();
  const executePrompt = interpolateTemplate(executeTemplate, {
    planPath: ctx.currentPlanPath,
    requirementsPath: ctx.requirementsPath,
    outputDirectory: executeOutputDirectory,
    executionIteration: execIterationCount.toString(),
  });

  const executeTool = await getCliToolForAction('execute', ctx.currentExecuteCliTool, ctx.specifiedCliTool);
  const executeToolType = await selectCliToolForAction('execute', ctx.currentExecuteCliTool, ctx.specifiedCliTool);

  // Store the selected tool type in context for subsequent iterations
  if (!ctx.currentExecuteCliTool) {
    ctx.currentExecuteCliTool = executeToolType;
  }

  const executeContext: ExecutionContext = {
    phase: 'execute-plan',
    outputDirectory: executeOutputDirectory,
    executionIteration: execIterationCount,
  };
  const result = await executeWithFallback(
    executeTool,
    executeToolType,
    executePrompt,
    ctx.currentExecuteModel,
    ctx.currentFallbackTools,
    executeContext
  );

  if (result.fallbackOccurred) {
    ctx.currentExecuteCliTool = result.usedTool;
    ctx.currentExecuteModel = result.usedModel;
    ctx.currentFallbackTools = result.remainingFallbackTools;
  }

  console.log('\n✅ Plan execution complete!');

  // Validate execution artifacts before proceeding
  const validationResult = validateExecutionArtifacts(executeOutputDirectory, execIterationCount);
  if (!validationResult.valid) {
    console.error('\n❌ Artifact validation failed after execution:');
    if (validationResult.missing.length > 0) {
      console.error(`   Missing files: ${validationResult.missing.join(', ')}`);
    }
    if (validationResult.errors.length > 0) {
      for (const error of validationResult.errors) {
        console.error(`   Error: ${error}`);
      }
    }
    console.error('\n   Possible causes:');
    console.error('   - The CLI tool may have exited before writing artifacts');
    console.error('   - Check the execution transcripts for errors');
    console.error('   - Try running with a different CLI tool using --fallback-cli-tools\n');
    process.exit(1);
  }

  // Check execution metadata
  try {
    const executeMetadata = readExecuteMetadata(executeOutputDirectory);

    if (executeMetadata.summary) {
      console.log('\n📝 Execution Summary:');
      console.log('───────────────────────────────────────────────────────────────');
      console.log(executeMetadata.summary);
      console.log('───────────────────────────────────────────────────────────────');
    }

    const hasHardBlockers = executeMetadata.hardBlockers && executeMetadata.hardBlockers.length > 0;
    const hasFollowUps = executeMetadata.hasFollowUps;

    orchestrator.onExecutionComplete(hasFollowUps, hasHardBlockers);

    // Store execute directory in context for follow-ups
    ctx.currentExecuteOutputDirectory = executeOutputDirectory;
    persistState(ctx);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      console.error('\n❌ Could not read execute-metadata.json. Cannot continue without metadata.');
      console.error(`   Error: ${error.message}`);
      console.error('   This may indicate the execution was interrupted.\n');
      process.exit(1);
    } else {
      throw error;
    }
  }
}

/**
 * Handle follow-ups phase
 */
async function handleFollowUps(ctx: OrchestratorPlanContext): Promise<void> {
  const { orchestrator, config, timestampDirectory } = ctx;
  const execIterationCount = orchestrator.getContext().execIterationCount;
  const followUpIterationCount = orchestrator.getContext().followUpIterationCount;
  const hasDoneIteration0 = orchestrator.getContext().hasDoneIteration0;
  const isDestinyMode = config.runMode.unlimitedIterations;

  const executeOutputDirectory = ctx.currentExecuteOutputDirectory ||
    (execIterationCount === 1
      ? resolve(timestampDirectory, 'execute')
      : resolve(timestampDirectory, `execute-${execIterationCount}`));

  try {
    const executeMetadata = readExecuteMetadata(executeOutputDirectory);

    // Check for hard blockers
    if (executeMetadata.hardBlockers && executeMetadata.hardBlockers.length > 0 && !hasDoneIteration0) {
      console.log(`\n🚫 Hard blockers detected (${executeMetadata.hardBlockers.length}). User input required...`);

      const blockerResolutions = await promptForHardBlockerResolution(executeMetadata.hardBlockers);
      const formattedResolutions = formatHardBlockerResolutions(executeMetadata.hardBlockers, blockerResolutions);

      console.log('\n🔄 Executing follow-ups with hard blocker resolutions...');

      const executionSummaryPath = resolve(executeOutputDirectory, `execution-summary-${execIterationCount}.md`);

      const followUpsTemplate = getExecuteFollowUpsTemplate();
      const followUpsPrompt = interpolateTemplate(followUpsTemplate, {
        executionSummaryPath,
        outputDirectory: executeOutputDirectory,
        hardBlockerResolutions: formattedResolutions,
        executionIteration: execIterationCount.toString(),
        followUpIteration: '0',
      });

      const executeTool = await getCliToolForAction('execute', ctx.currentExecuteCliTool, ctx.specifiedCliTool);
      const executeToolType = await selectCliToolForAction('execute', ctx.currentExecuteCliTool, ctx.specifiedCliTool);

      if (!executeToolType) {
        throw new Error('Failed to determine CLI tool for follow-up execution. Please specify --execute-cli-tool or ensure a tool preference is saved.');
      }

      // Store the selected tool type in context for subsequent iterations
      if (!ctx.currentExecuteCliTool) {
        ctx.currentExecuteCliTool = executeToolType;
      }

      const followUpContext: ExecutionContext = {
        phase: 'execute-follow-ups',
        outputDirectory: executeOutputDirectory,
        executionIteration: execIterationCount,
        followUpIteration: 0,
      };
      const result = await executeWithFallback(
        executeTool,
        executeToolType,
        followUpsPrompt,
        ctx.currentExecuteModel,
        ctx.currentFallbackTools,
        followUpContext
      );

      if (result.fallbackOccurred) {
        ctx.currentExecuteCliTool = result.usedTool;
        ctx.currentExecuteModel = result.usedModel;
        ctx.currentFallbackTools = result.remainingFallbackTools;
      }

      // Read updated metadata and print summary
      try {
        const updatedMetadata = readExecuteMetadata(executeOutputDirectory);
        if (updatedMetadata.summary) {
          console.log('\n📝 Follow-ups Summary:');
          console.log('───────────────────────────────────────────────────────────────');
          console.log(updatedMetadata.summary);
          console.log('───────────────────────────────────────────────────────────────');
        }
      } catch (error) {
        // Non-fatal: log warning but continue
        if (error instanceof Error && error.message.includes('not found')) {
          console.log('\n⚠️  Could not read execute-metadata.json. Continuing...');
        }
      }

      orchestrator.onHardBlockersResolved();
      persistState(ctx);
      return;
    }

    // Check iteration limit
    const stopCondition = orchestrator.checkFollowUpStop(executeMetadata.hasFollowUps, false);
    if (stopCondition.shouldStop) {
      if (stopCondition.reason === 'LIMIT_REACHED') {
        console.log(`\n⚠️  Reached maximum follow-up iterations (${config.limits.maxFollowUpIterations}). Stopping.`);
        orchestrator.onMaxFollowUpsReached();
      } else {
        console.log('\n✅ All follow-ups complete!');
        orchestrator.onFollowUpsComplete(false);
      }
      persistState(ctx);
      return;
    }

    // Execute follow-ups
    const currentFollowUpIteration = followUpIterationCount;
    console.log(`\n🔄 Executing follow-ups (iteration ${formatIteration(currentFollowUpIteration + 1, config.limits.maxFollowUpIterations, isDestinyMode)})...`);

    // Determine previous iteration path
    let previousFollowUpIteration: number;
    if (hasDoneIteration0) {
      previousFollowUpIteration = followUpIterationCount - 1;
    } else {
      previousFollowUpIteration = followUpIterationCount === 1 ? -1 : followUpIterationCount - 1;
    }
    const executionSummaryPath = previousFollowUpIteration === -1
      ? resolve(executeOutputDirectory, `execution-summary-${execIterationCount}.md`)
      : resolve(executeOutputDirectory, `execution-summary-${execIterationCount}-followup-${previousFollowUpIteration}.md`);

    const followUpsTemplate = getExecuteFollowUpsTemplate();
    const followUpsPrompt = interpolateTemplate(followUpsTemplate, {
      executionSummaryPath,
      outputDirectory: executeOutputDirectory,
      hardBlockerResolutions: '',
      executionIteration: execIterationCount.toString(),
      followUpIteration: currentFollowUpIteration.toString(),
    });

    const executeTool = await getCliToolForAction('execute', ctx.currentExecuteCliTool, ctx.specifiedCliTool);
    const executeToolType = await selectCliToolForAction('execute', ctx.currentExecuteCliTool, ctx.specifiedCliTool);

    if (!executeToolType) {
      throw new Error('Failed to determine CLI tool for follow-up execution. Please specify --execute-cli-tool or ensure a tool preference is saved.');
    }

    // Store the selected tool type in context for subsequent iterations
    if (!ctx.currentExecuteCliTool) {
      ctx.currentExecuteCliTool = executeToolType;
    }

    const followUpContext: ExecutionContext = {
      phase: 'execute-follow-ups',
      outputDirectory: executeOutputDirectory,
      executionIteration: execIterationCount,
      followUpIteration: currentFollowUpIteration,
    };
    const result = await executeWithFallback(
      executeTool,
      executeToolType,
      followUpsPrompt,
      ctx.currentExecuteModel,
      ctx.currentFallbackTools,
      followUpContext
    );

    if (result.fallbackOccurred) {
      ctx.currentExecuteCliTool = result.usedTool;
      ctx.currentExecuteModel = result.usedModel;
      ctx.currentFallbackTools = result.remainingFallbackTools;
    }

    // Read updated metadata
    const updatedMetadata = readExecuteMetadata(executeOutputDirectory);

    // Print summary if available
    if (updatedMetadata.summary) {
      console.log('\n📝 Follow-ups Summary:');
      console.log('───────────────────────────────────────────────────────────────');
      console.log(updatedMetadata.summary);
      console.log('───────────────────────────────────────────────────────────────');
    }

    orchestrator.onFollowUpsComplete(updatedMetadata.hasFollowUps);
    persistState(ctx);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      console.error('\n❌ Could not read execute-metadata.json. Cannot continue without metadata.');
      console.error(`   Error: ${error.message}`);
      console.error('   This may indicate the execution was interrupted.\n');
      process.exit(1);
    } else {
      throw error;
    }
  }
}

/**
 * Handle gap audit phase
 */
async function handleGapAudit(ctx: OrchestratorPlanContext): Promise<void> {
  const { orchestrator, timestampDirectory } = ctx;
  const execIterationCount = orchestrator.getContext().execIterationCount;
  const isInitialExecution = execIterationCount === 1;

  console.log('\n🔍 Running gap audit...');

  const gapAuditOutputDirectory = isInitialExecution
    ? resolve(timestampDirectory, 'gap-audit')
    : resolve(timestampDirectory, `gap-audit-${execIterationCount}`);

  await ctx.deps.fileSystem.mkdir(gapAuditOutputDirectory, true);

  const gapAuditTemplate = getGapAuditTemplate(ctx.nemesis);
  const gapAuditPrompt = interpolateTemplate(gapAuditTemplate, {
    requirementsPath: ctx.requirementsPath,
    planPath: ctx.currentPlanPath,
    outputDirectory: gapAuditOutputDirectory,
    executionIteration: execIterationCount.toString(),
  });

  const auditTool = await getCliToolForAction('audit', ctx.currentAuditCliTool, ctx.specifiedCliTool);
  const auditToolType = await selectCliToolForAction('audit', ctx.currentAuditCliTool, ctx.specifiedCliTool);

  // Store the selected tool type in context for subsequent iterations
  if (!ctx.currentAuditCliTool) {
    ctx.currentAuditCliTool = auditToolType;
  }

  const auditContext: ExecutionContext = {
    phase: 'gap-audit',
    outputDirectory: gapAuditOutputDirectory,
    executionIteration: execIterationCount,
    gapAuditIteration: execIterationCount,
  };
  const result = await executeWithFallback(
    auditTool,
    auditToolType,
    gapAuditPrompt,
    ctx.currentAuditModel,
    ctx.currentFallbackTools,
    auditContext
  );

  if (result.fallbackOccurred) {
    ctx.currentAuditCliTool = result.usedTool;
    ctx.currentAuditModel = result.usedModel;
    ctx.currentFallbackTools = result.remainingFallbackTools;
  }

  console.log('\n✅ Gap audit complete!');

  // Store gap audit directory for gap plan phase
  ctx.currentGapAuditOutputDirectory = gapAuditOutputDirectory;

  try {
    const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);

    if (gapAuditMetadata.summary) {
      console.log('\n🔍 Gap Audit Summary:');
      console.log('───────────────────────────────────────────────────────────────');
      console.log(gapAuditMetadata.summary);
      console.log('───────────────────────────────────────────────────────────────');
    }

    if (!gapAuditMetadata.gapsIdentified) {
      console.log('\n✅ No gaps identified. Implementation is complete!');
      orchestrator.onNoGapsFound();
      orchestrator.onGenerateSummary();
      persistState(ctx);
    } else {
      orchestrator.onGapAuditComplete(true);
      persistState(ctx);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      console.log('\n⚠️  Could not read gap-audit-metadata.json. Assuming gaps were found and continuing...');
      orchestrator.onGapAuditComplete(true);
      persistState(ctx);
    } else {
      throw error;
    }
  }
}

/**
 * Handle gap plan phase
 */
async function handleGapPlan(ctx: OrchestratorPlanContext): Promise<void> {
  const { orchestrator, config, timestampDirectory } = ctx;
  const execIterationCount = orchestrator.getContext().execIterationCount;
  const isInitialExecution = execIterationCount === 1;

  // Check execution iteration limit
  const stopCondition = orchestrator.checkExecutionIterationStop(true);
  if (stopCondition.shouldStop && stopCondition.reason === 'LIMIT_REACHED') {
    console.log(`\n⚠️  Reached maximum execution iterations (${config.limits.maxExecIterations}). Stopping.`);
    orchestrator.onMaxExecIterationsReached();
    orchestrator.onGenerateSummary();
    persistState(ctx);
    return;
  }

  console.log('\n📋 Creating gap closure plan...');

  const gapPlanOutputDirectory = isInitialExecution
    ? resolve(timestampDirectory, 'gap-plan')
    : resolve(timestampDirectory, `gap-plan-${execIterationCount}`);

  await ctx.deps.fileSystem.mkdir(gapPlanOutputDirectory, true);

  const gapAuditOutputDirectory = ctx.currentGapAuditOutputDirectory ||
    (isInitialExecution
      ? resolve(timestampDirectory, 'gap-audit')
      : resolve(timestampDirectory, `gap-audit-${execIterationCount}`));

  const gapAuditPath = resolve(gapAuditOutputDirectory, `gap-audit-summary-${execIterationCount}.md`);

  const gapPlanTemplate = getGapPlanTemplate();
  const gapPlanPrompt = interpolateTemplate(gapPlanTemplate, {
    gapAuditPath,
    outputDirectory: gapPlanOutputDirectory,
    executionIteration: execIterationCount.toString(),
  });

  const planTool = await getCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);
  const planToolType = await selectCliToolForAction('plan', ctx.currentPlanCliTool, ctx.specifiedCliTool);

  // Store the selected tool type in context for subsequent iterations
  if (!ctx.currentPlanCliTool) {
    ctx.currentPlanCliTool = planToolType;
  }

  const gapPlanContext: ExecutionContext = {
    phase: 'gap-plan',
    outputDirectory: gapPlanOutputDirectory,
    executionIteration: execIterationCount,
  };
  const result = await executeWithFallback(
    planTool,
    planToolType,
    gapPlanPrompt,
    ctx.currentPlanModel,
    ctx.currentFallbackTools,
    gapPlanContext
  );

  if (result.fallbackOccurred) {
    ctx.currentPlanCliTool = result.usedTool;
    ctx.currentPlanModel = result.usedModel;
    ctx.currentFallbackTools = result.remainingFallbackTools;
  }

  console.log('\n✅ Gap closure plan complete!');

  // Update current plan path for next execution
  ctx.currentPlanPath = resolve(gapPlanOutputDirectory, `gap-plan-${execIterationCount}.md`);

  orchestrator.onGapPlanComplete();
  persistState(ctx);
}

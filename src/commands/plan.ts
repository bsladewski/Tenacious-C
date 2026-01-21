import { existsSync, mkdirSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { getCliToolForAction, executeWithFallback, selectCliTool, selectCliToolForAction } from '../engines';
import { CliToolType } from '../config';
import { getPlaceholderTemplate } from '../templates/plan.template';
import { getAnswerQuestionsTemplate } from '../templates/answer-questions.template';
import { getImprovePlanTemplate } from '../templates/improve-plan.template';
import { getExecutePlanTemplate } from '../templates/execute-plan.template';
import { getExecuteFollowUpsTemplate } from '../templates/execute-follow-ups.template';
import { getGapAuditTemplate } from '../templates/gap-audit.template';
import { getGapPlanTemplate } from '../templates/gap-plan.template';
import { interpolateTemplate } from '../templates/prompt-template';
import {
  readPlanMetadata,
  clearOpenQuestions,
  writeRequirements,
  trackQAHistory,
  readQAHistory,
  readExecuteMetadata,
  readGapAuditMetadata,
  saveExecutionState,
  findLatestResumableRun,
  getExecutionArtifacts,
  validateExecutionArtifacts,
} from '../io';
import { createExecutionState, syncStateWithArtifacts } from '../core';
import { promptForAnswers, formatAnswers, promptForHardBlockerResolution, formatHardBlockerResolutions, previewPlan } from '../ui';
import { generateFinalSummary } from '../logging';
import { resumePlan } from './resume-plan';
import { ExecutionContext } from '../types';
import inquirer from 'inquirer';

/**
 * Format iteration display string (e.g., "1/5" or "1/🌟" in destiny mode)
 * @param current - Current iteration number
 * @param max - Maximum iterations
 * @param isDestinyMode - Whether prompt of destiny mode is active
 * @returns Formatted iteration string
 */
function formatIteration(current: number, max: number, isDestinyMode: boolean): string {
  return isDestinyMode ? `${current}/🌟` : `${current}/${max}`;
}

/**
 * Execute a plan (initial plan or gap plan) with follow-up iterations
 * @param planPath - Path to the plan file to execute
 * @param requirementsPath - Path to the requirements file
 * @param executeOutputDirectory - Directory for execution output
 * @param maxFollowUpIterations - Maximum number of follow-up iterations
 * @param defaultCliTool - Default CLI tool type (from --cli-tool or saved preference)
 * @param executionIteration - Current execution iteration number (for display)
 * @param isDestinyMode - Whether prompt of destiny mode is active
 * @param executeModel - Optional model name to use for execution and follow-ups
 * @param executeCliTool - Optional CLI tool to use for execution (overrides defaultCliTool)
 */
export async function executePlanWithFollowUps(
  planPath: string,
  requirementsPath: string,
  executeOutputDirectory: string,
  maxFollowUpIterations: number,
  defaultCliTool: CliToolType | null,
  executionIteration: number,
  isDestinyMode: boolean,
  executeModel?: string | null,
  executeCliTool?: CliToolType | null,
  fallbackCliTools?: CliToolType[]
): Promise<{ executeCliTool: CliToolType | null; executeModel: string | null; fallbackCliTools: CliToolType[] }> {
  // Track mutable state for fallback
  let currentExecuteCliTool = executeCliTool || null;
  let currentExecuteModel = executeModel || null;
  let currentFallbackTools = fallbackCliTools ? [...fallbackCliTools] : [];
  // Ensure execution output directory exists
  mkdirSync(executeOutputDirectory, { recursive: true });

  // Scan for existing execution artifacts to determine resume point
  const artifacts = getExecutionArtifacts(executeOutputDirectory, executionIteration);
  
  // Check if initial execution was already done
  if (!artifacts.initialExecutionDone) {
    // Get the execute template and interpolate
    const executeTemplate = getExecutePlanTemplate();
    const executePrompt = interpolateTemplate(executeTemplate, {
      planPath,
      requirementsPath,
      outputDirectory: executeOutputDirectory,
      executionIteration: executionIteration.toString(),
    });

    // Get the appropriate CLI tool for execution
    const executeTool = await getCliToolForAction('execute', currentExecuteCliTool, defaultCliTool);
    const executeToolType = await selectCliToolForAction('execute', currentExecuteCliTool, defaultCliTool);

    // Execute using AI CLI tool with execute model if specified, with fallback support
    const executeContext: ExecutionContext = {
      phase: 'execute-plan',
      outputDirectory: executeOutputDirectory,
      executionIteration,
    };
    const executeResult = await executeWithFallback(
      executeTool,
      executeToolType,
      executePrompt,
      currentExecuteModel,
      currentFallbackTools,
      executeContext
    );
    
    // Update mutable state if fallback occurred
    if (executeResult.fallbackOccurred) {
      currentExecuteCliTool = executeResult.usedTool;
      currentExecuteModel = executeResult.usedModel;
      currentFallbackTools = executeResult.remainingFallbackTools;
    }

    console.log('\n✅ Plan execution complete!');
    
    // Validate execution artifacts before proceeding
    const validationResult = validateExecutionArtifacts(executeOutputDirectory, executionIteration);
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
    
    // Log initial execution summary if available
    try {
      const initialExecuteMetadata = readExecuteMetadata(executeOutputDirectory);
      if (initialExecuteMetadata.summary) {
        console.log('\n📝 Execution Summary:');
        console.log('───────────────────────────────────────────────────────────────');
        console.log(initialExecuteMetadata.summary);
        console.log('───────────────────────────────────────────────────────────────');
      }
    } catch {
      // If we can't read metadata, that's okay - continue
    }
  } else {
    console.log('\n✅ Initial execution already completed. Skipping...');
  }

  // Initialize follow-up state from artifacts
  // Use artifact-based values as source of truth
  let hasDoneIteration0 = artifacts.hasDoneIteration0;
  
  // Determine starting follow-up iteration count
  // If we have completed iterations, start from the next one
  // Otherwise start from 0
  let followUpIterationCount: number;
  if (artifacts.lastFollowUpIteration !== null) {
    // We've completed some follow-ups, start from the next iteration
    followUpIterationCount = artifacts.lastFollowUpIteration + 1;
  } else {
    // No follow-ups completed yet, start from 0
    followUpIterationCount = 0;
  }

  // Check for hard blockers after initial execution (only if we just ran it or haven't resolved them)
  // Skip if we've already done iteration 0 (hard blockers were resolved)
  if (!artifacts.initialExecutionDone || (!hasDoneIteration0 && artifacts.initialExecutionDone)) {
    try {
      const initialExecuteMetadata = readExecuteMetadata(executeOutputDirectory);
      if (initialExecuteMetadata.hardBlockers && initialExecuteMetadata.hardBlockers.length > 0) {
        // Only prompt if hard blockers exist AND we haven't already resolved them (no iteration 0 artifact)
        if (!hasDoneIteration0) {
          console.log(`\n🚫 Hard blockers detected after initial execution (${initialExecuteMetadata.hardBlockers.length}). User input required...`);

          // Prompt user for hard blocker resolution
          const blockerResolutions = await promptForHardBlockerResolution(initialExecuteMetadata.hardBlockers);

          // Format hard blocker resolutions for the template
          const formattedResolutions = formatHardBlockerResolutions(initialExecuteMetadata.hardBlockers, blockerResolutions);

          console.log('\n🔄 Executing follow-ups with hard blocker resolutions...');

          // Prepare paths for follow-up execution template
          // Use iteration 0 for the initial follow-up execution after plan execution
          const executionSummaryPath = resolve(executeOutputDirectory, `execution-summary-${executionIteration}.md`);
          const followUpIteration = 0;

          // Track that we've done iteration 0
          hasDoneIteration0 = true;
          followUpIterationCount = 1; // Next iteration after 0

          // Get the execute follow-ups template and interpolate
          const followUpsTemplate = getExecuteFollowUpsTemplate();
          const followUpsPrompt = interpolateTemplate(followUpsTemplate, {
            executionSummaryPath,
            outputDirectory: executeOutputDirectory,
            hardBlockerResolutions: formattedResolutions,
            executionIteration: executionIteration.toString(),
            followUpIteration: followUpIteration.toString(),
          });

          // Get the appropriate CLI tool for execution
          const executeTool = await getCliToolForAction('execute', currentExecuteCliTool, defaultCliTool);
          const executeToolType = currentExecuteCliTool || defaultCliTool;
          
          // Execute using AI CLI tool with execute model if specified, with fallback support
          const followUpContext: ExecutionContext = {
            phase: 'execute-follow-ups',
            outputDirectory: executeOutputDirectory,
            executionIteration,
            followUpIteration,
          };
          const executeResult = await executeWithFallback(
            executeTool,
            executeToolType,
            followUpsPrompt,
            currentExecuteModel,
            currentFallbackTools,
            followUpContext
          );
          
          // Update mutable state if fallback occurred
          if (executeResult.fallbackOccurred) {
            currentExecuteCliTool = executeResult.usedTool;
            currentExecuteModel = executeResult.usedModel;
            currentFallbackTools = executeResult.remainingFallbackTools;
          }
        } else {
          // Hard blockers were already resolved (iteration 0 exists)
          console.log('\n✅ Hard blockers were already resolved. Continuing with follow-ups...');
        }
      }
    } catch (error) {
      // If metadata file doesn't exist or can't be read, continue to follow-up loop
      // This allows the tool to work even if metadata wasn't generated
      if (!(error instanceof Error && error.message.includes('not found'))) {
        throw error;
      }
    }
  }

  // Iterative follow-up execution loop
  // Continue executing follow-ups until hasFollowUps is false or max iterations reached
  // Start from the correct iteration based on artifacts
  // Note: followUpIterationCount is already set to the next iteration to execute

  while (followUpIterationCount < maxFollowUpIterations) {
    try {
      const executeMetadata = readExecuteMetadata(executeOutputDirectory);

      // Check for hard blockers first
      if (executeMetadata.hardBlockers && executeMetadata.hardBlockers.length > 0) {
        console.log(`\n🚫 Hard blockers detected (${executeMetadata.hardBlockers.length}). User input required...`);

        // Prompt user for hard blocker resolution
        const blockerResolutions = await promptForHardBlockerResolution(executeMetadata.hardBlockers);

        // Format hard blocker resolutions for the template
        const formattedResolutions = formatHardBlockerResolutions(executeMetadata.hardBlockers, blockerResolutions);

        // Determine which iteration we're executing
        // If hard blockers exist in the loop, we're executing a follow-up iteration
        // The iteration number is followUpIterationCount (which is the next iteration to execute)
        const currentFollowUpIteration = followUpIterationCount;
        console.log(`\n🔄 Executing follow-ups with hard blocker resolutions (iteration ${formatIteration(currentFollowUpIteration + 1, maxFollowUpIterations, isDestinyMode)})...`);

        // Prepare paths for follow-up execution template
        // Determine the previous iteration to read from
        // If we're executing iteration N, we read from iteration N-1
        // Special case: if we haven't done iteration 0 and this is iteration 1, read from initial summary
        let previousFollowUpIteration: number;
        if (hasDoneIteration0) {
          // We've done iteration 0, so previous is followUpIterationCount - 1
          // If followUpIterationCount is 1, previous is 0
          previousFollowUpIteration = followUpIterationCount - 1;
        } else {
          // Haven't done iteration 0 yet
          // If this is iteration 1, read from initial summary (-1)
          // Otherwise, read from previous follow-up iteration
          previousFollowUpIteration = followUpIterationCount === 1 ? -1 : followUpIterationCount - 1;
        }
        const executionSummaryPath = previousFollowUpIteration === -1
          ? resolve(executeOutputDirectory, `execution-summary-${executionIteration}.md`)
          : resolve(executeOutputDirectory, `execution-summary-${executionIteration}-followup-${previousFollowUpIteration}.md`);

        // Get the execute follow-ups template and interpolate
        const followUpsTemplate = getExecuteFollowUpsTemplate();
        const followUpsPrompt = interpolateTemplate(followUpsTemplate, {
          executionSummaryPath,
          outputDirectory: executeOutputDirectory,
          hardBlockerResolutions: formattedResolutions,
          executionIteration: executionIteration.toString(),
          followUpIteration: currentFollowUpIteration.toString(),
        });

      // Get the appropriate CLI tool for execution
      const executeTool = await getCliToolForAction('execute', currentExecuteCliTool, defaultCliTool);
      const executeToolType = currentExecuteCliTool || defaultCliTool;
      
      // Execute using AI CLI tool with execute model if specified, with fallback support
      const followUpContext: ExecutionContext = {
        phase: 'execute-follow-ups',
        outputDirectory: executeOutputDirectory,
        executionIteration,
        followUpIteration: currentFollowUpIteration,
      };
      const executeResult = await executeWithFallback(
        executeTool,
        executeToolType,
        followUpsPrompt,
        currentExecuteModel,
        currentFallbackTools,
        followUpContext
      );
        
        // Update mutable state if fallback occurred
        if (executeResult.fallbackOccurred) {
          currentExecuteCliTool = executeResult.usedTool;
          currentExecuteModel = executeResult.usedModel;
          currentFallbackTools = executeResult.remainingFallbackTools;
        }

        followUpIterationCount++;

        // Continue loop to check if there are still follow-ups or blockers
        continue;
      }

      // Check if there are follow-ups to execute
      if (!executeMetadata.hasFollowUps) {
        // No more follow-ups, we're done
        break;
      }

      // Determine which iteration we're executing
      const currentFollowUpIteration = followUpIterationCount;
      console.log(`\n🔄 Executing follow-ups (iteration ${formatIteration(currentFollowUpIteration + 1, maxFollowUpIterations, isDestinyMode)})...`);

      // Prepare paths for follow-up execution template
      // Determine the previous iteration to read from
      // If we're executing iteration N, we read from iteration N-1
      // Special case: if we haven't done iteration 0 and this is iteration 1, read from initial summary
      let previousFollowUpIteration: number;
      if (hasDoneIteration0) {
        // We've done iteration 0, so previous is followUpIterationCount - 1
        // If followUpIterationCount is 1, previous is 0
        previousFollowUpIteration = followUpIterationCount - 1;
      } else {
        // Haven't done iteration 0 yet
        // If this is iteration 1, read from initial summary (-1)
        // Otherwise, read from previous follow-up iteration
        previousFollowUpIteration = followUpIterationCount === 1 ? -1 : followUpIterationCount - 1;
      }
      const executionSummaryPath = previousFollowUpIteration === -1
        ? resolve(executeOutputDirectory, `execution-summary-${executionIteration}.md`)
        : resolve(executeOutputDirectory, `execution-summary-${executionIteration}-followup-${previousFollowUpIteration}.md`);

      // Get the execute follow-ups template and interpolate
      const followUpsTemplate = getExecuteFollowUpsTemplate();
      const followUpsPrompt = interpolateTemplate(followUpsTemplate, {
        executionSummaryPath,
        outputDirectory: executeOutputDirectory,
        hardBlockerResolutions: '', // No hard blockers, empty string
        executionIteration: executionIteration.toString(),
        followUpIteration: currentFollowUpIteration.toString(),
      });

      // Get the appropriate CLI tool for execution
      const executeTool = await getCliToolForAction('execute', currentExecuteCliTool, defaultCliTool);
      const executeToolType = currentExecuteCliTool || defaultCliTool;
      
      // Execute using AI CLI tool with execute model if specified, with fallback support
      const followUpContext: ExecutionContext = {
        phase: 'execute-follow-ups',
        outputDirectory: executeOutputDirectory,
        executionIteration,
        followUpIteration: currentFollowUpIteration,
      };
      const executeResult = await executeWithFallback(
        executeTool,
        executeToolType,
        followUpsPrompt,
        currentExecuteModel,
        currentFallbackTools,
        followUpContext
      );
      
      // Update mutable state if fallback occurred
      if (executeResult.fallbackOccurred) {
        currentExecuteCliTool = executeResult.usedTool;
        currentExecuteModel = executeResult.usedModel;
        currentFallbackTools = executeResult.remainingFallbackTools;
      }

      followUpIterationCount++;

      // Continue loop to check if there are still follow-ups
    } catch (error) {
      // If metadata file doesn't exist or can't be read, stop execution
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

  if (followUpIterationCount >= maxFollowUpIterations) {
    console.log(`\n⚠️  Reached maximum follow-up iterations (${maxFollowUpIterations}). Stopping.`);
  } else {
    // Final check - show final status
    try {
      const finalExecuteMetadata = readExecuteMetadata(executeOutputDirectory);
      if (!finalExecuteMetadata.hasFollowUps) {
        console.log('\n✅ All follow-ups complete!');
      } else {
        console.log('\n✅ Follow-up iterations complete.');
      }
      
      // Log execution summary if available
      if (finalExecuteMetadata.summary) {
        console.log('\n📝 Execution Summary:');
        console.log('───────────────────────────────────────────────────────────────');
        console.log(finalExecuteMetadata.summary);
        console.log('───────────────────────────────────────────────────────────────');
      }
    } catch {
      // If we can't read metadata, that's okay - we've completed the iterations
      console.log('\n✅ Follow-up iterations complete.');
    }
  }
  
  // Return updated tool config for caller to use in subsequent phases
  return {
    executeCliTool: currentExecuteCliTool,
    executeModel: currentExecuteModel,
    fallbackCliTools: currentFallbackTools,
  };
}

/**
 * Execute the plan command
 * @param input - Either a string prompt or a file path
 * @param maxRevisions - Maximum number of plan revisions (default: 10)
 * @param planConfidenceThreshold - Minimum confidence threshold (0-100) (default: 85)
 * @param maxFollowUpIterations - Maximum number of follow-up execution iterations (default: 10)
 * @param execIterations - Maximum number of plan-based execution iterations (default: 5)
 * @param isDestinyMode - Whether prompt of destiny mode is active (overrides all limits)
 * @param specifiedCliTool - CLI tool type specified via --cli-tool argument, or null
 * @param previewPlanFlag - Whether to preview the plan before execution
 * @param resumeFlag - Whether to resume from a previous run
 * @param planModel - Optional model name to use for plan generation and revisions
 * @param executeModel - Optional model name to use for plan execution and follow-ups
 * @param auditModel - Optional model name to use for gap audits
 * @param planCliTool - Optional CLI tool to use for plan generation/revisions (overrides specifiedCliTool)
 * @param executeCliTool - Optional CLI tool to use for execution/follow-ups (overrides specifiedCliTool)
 * @param auditCliTool - Optional CLI tool to use for gap audits (overrides specifiedCliTool)
 */
export async function executePlan(input: string, maxRevisions: number = 10, planConfidenceThreshold: number = 85, maxFollowUpIterations: number = 10, execIterations: number = 5, isDestinyMode: boolean = false, specifiedCliTool: CliToolType | null = null, previewPlanFlag: boolean = false, resumeFlag: boolean = false, planModel: string | null = null, executeModel: string | null = null, auditModel: string | null = null, planCliTool: CliToolType | null = null, executeCliTool: CliToolType | null = null, auditCliTool: CliToolType | null = null, fallbackCliTools: CliToolType[] = [], _noInteractive: boolean = false, _verbose: boolean = false, _debug: boolean = false, _jsonOutput: boolean = false, nemesis: boolean = false): Promise<void> {
  // If resume flag is set, find and resume the latest run
  if (resumeFlag) {
    const tenaciousCDir = resolve(process.cwd(), '.tenacious-c');
    const state = findLatestResumableRun(tenaciousCDir);
    
    if (!state) {
      console.error('\n❌ No resumable run found. Please start a new run first.\n');
      process.exit(1);
    }
    
    console.log(`\n🔄 Found resumable run in: ${state.timestampDirectory}`);
    console.log(`   Phase: ${state.phase}`);
    if (state.planGeneration) {
      console.log(`   Plan revisions: ${state.planGeneration.revisionCount}`);
    }
    if (state.execution) {
      console.log(`   Execution iterations: ${state.execution.execIterationCount}`);
    }
    console.log(`   Last saved: ${new Date(state.lastSaved).toLocaleString()}`);
    
    // Override saved config with command-line flags if provided
    const overriddenConfig = {
      maxRevisions: isDestinyMode ? Number.MAX_SAFE_INTEGER : maxRevisions,
      planConfidenceThreshold,
      maxFollowUpIterations: isDestinyMode ? Number.MAX_SAFE_INTEGER : maxFollowUpIterations,
      execIterations: isDestinyMode ? Number.MAX_SAFE_INTEGER : execIterations,
      isDestinyMode,
      cliTool: specifiedCliTool ?? state.config.cliTool, // Use new CLI tool if specified, otherwise keep saved
      previewPlan: previewPlanFlag,
      planModel: planModel ?? state.config.planModel, // Use new model if specified, otherwise keep saved
      executeModel: executeModel ?? state.config.executeModel, // Use new model if specified, otherwise keep saved
      auditModel: auditModel ?? state.config.auditModel, // Use new model if specified, otherwise keep saved
      planCliTool: planCliTool ?? state.config.planCliTool, // Use new CLI tool if specified, otherwise keep saved
      executeCliTool: executeCliTool ?? state.config.executeCliTool, // Use new CLI tool if specified, otherwise keep saved
      auditCliTool: auditCliTool ?? state.config.auditCliTool, // Use new CLI tool if specified, otherwise keep saved
      fallbackCliTools: fallbackCliTools.length > 0 ? fallbackCliTools : (state.config.fallbackCliTools || []), // Use new fallback tools if specified, otherwise keep saved
    };
    
    // Update state with overridden config
    const updatedState = {
      ...state,
      config: overriddenConfig,
    };
    
    await resumePlan(updatedState);
    return;
  }
  
  // Determine if input is a file path or a string prompt
  let requirements: string;
  
  if (existsSync(input)) {
    // It's a file path - resolve to absolute path
    const absolutePath = isAbsolute(input) ? input : resolve(process.cwd(), input);
    requirements = `Refer to \`${absolutePath}\` for requirements.`;
  } else {
    // It's a string prompt - use directly
    requirements = input;
  }

  // Set up output directory: .tenacious-c/<timestamp>/plan/
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  const timestampDirectory = resolve(process.cwd(), '.tenacious-c', timestamp);
  const outputDirectory = resolve(timestampDirectory, 'plan');

  // Ensure output directory exists
  mkdirSync(outputDirectory, { recursive: true });

  // Store the original requirements in the timestamp directory
  writeRequirements(timestampDirectory, requirements);

  // Create initial execution state
  let executionState = createExecutionState(
    timestampDirectory,
    requirements,
    {
      maxRevisions,
      planConfidenceThreshold,
      maxFollowUpIterations,
      execIterations,
      isDestinyMode,
      cliTool: specifiedCliTool,
      previewPlan: previewPlanFlag,
      planModel,
      executeModel,
      auditModel,
      planCliTool,
      executeCliTool,
      auditCliTool,
      fallbackCliTools,
    },
    'plan-generation'
  );
  saveExecutionState(timestampDirectory, executionState);

  // Mutable state for fallback tracking - these are updated when fallback occurs
  let currentPlanCliTool = planCliTool;
  let currentPlanModel = planModel;
  let currentExecuteCliTool = executeCliTool;
  let currentExecuteModel = executeModel;
  let currentAuditCliTool = auditCliTool;
  let currentAuditModel = auditModel;
  let currentFallbackCliTools = [...fallbackCliTools];

  // Get the template and interpolate
  const template = getPlaceholderTemplate();
  const prompt = interpolateTemplate(template, {
    outputDirectory,
    requirements,
  });

  // Get the appropriate CLI tool for plan generation
  const planTool = await getCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
  const planToolType = await selectCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
  
  // Generate initial plan
  console.log('\n📋 Generating initial plan...');
  
  // Execute using AI CLI tool with plan model if specified, with fallback support
  const planContext: ExecutionContext = {
    phase: 'plan-generation',
    outputDirectory,
  };
  const planResult = await executeWithFallback(
    planTool,
    planToolType,
    prompt,
    currentPlanModel,
    currentFallbackCliTools,
    planContext
  );
  
  // Update mutable state if fallback occurred
  if (planResult.fallbackOccurred) {
    currentPlanCliTool = planResult.usedTool;
    currentPlanModel = planResult.usedModel;
    currentFallbackCliTools = planResult.remainingFallbackTools;
  }

  // Update state after initial plan generation
  executionState = {
    ...executionState,
    phase: 'plan-revision',
    planGeneration: {
      revisionCount: 0,
      planPath: resolve(outputDirectory, 'plan.md'),
      outputDirectory,
    },
  };
  saveExecutionState(timestampDirectory, executionState);

  // Preview plan if requested
  if (previewPlanFlag) {
    const planPath = resolve(outputDirectory, 'plan.md');
    console.log('\n📄 Previewing plan...');
    await previewPlan(planPath);
    console.log('\n');
    
    // Ask user if they want to continue with execution
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

  // Iterative plan revision loop
  // Flow:
  // 1. Generate initial plan
  // 2. If open questions exist, revise the plan with answers to open questions. Return to step 2 if new open questions are raised. Otherwise, proceed to step 3.
  // 3. If confidence is below threshold, deepen the plan. If new open questions are raised return to step 2. If confidence is still below threshold return to step 3. Otherwise, proceed (complete).
  let revisionCount = 0;
  
  while (revisionCount < maxRevisions) {
    try {
      const metadata = readPlanMetadata(outputDirectory);
      
      // Step 2: Check if there are open questions (priority over confidence check)
      if (metadata.openQuestions && metadata.openQuestions.length > 0) {
        console.log(`\n📋 Open questions found (revision ${formatIteration(revisionCount + 1, maxRevisions, isDestinyMode)}). Please provide answers:`);
        
        // Store questions before clearing (so we can prompt with them)
        const questionsToAnswer = [...metadata.openQuestions];
        
        // Clear open questions in metadata before prompting
        // This prevents the same questions from being asked again if revision fails
        clearOpenQuestions(outputDirectory);
        
        // Prompt user for answers
        const answers = await promptForAnswers(questionsToAnswer);
        
        // Track Q&A history
        for (const question of questionsToAnswer) {
          const answer = answers.get(question.question) || '';
          trackQAHistory(timestampDirectory, question.question, answer);
        }
        
        // Format answers for the template
        const formattedAnswers = formatAnswers(answers);
        
        // Read Q&A history for the template
        const qaHistory = readQAHistory(timestampDirectory);
        
        // Execute answer-questions template
        const answerTemplate = getAnswerQuestionsTemplate();
        const answerPrompt = interpolateTemplate(answerTemplate, {
          outputDirectory,
          answers: formattedAnswers,
          qaHistory: qaHistory || '',
        });
        
        // Get the appropriate CLI tool for plan operations
        const planTool = await getCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
        const planToolType = await selectCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
        
        console.log(`\n🔄 Revising plan with your answers (revision ${formatIteration(revisionCount + 1, maxRevisions, isDestinyMode)})...`);
        const answerContext: ExecutionContext = {
          phase: 'answer-questions',
          outputDirectory,
          questionAnswerIteration: revisionCount,
        };
        const planResult = await executeWithFallback(
          planTool,
          planToolType,
          answerPrompt,
          currentPlanModel,
          currentFallbackCliTools,
          answerContext
        );
        
        // Update mutable state if fallback occurred
        if (planResult.fallbackOccurred) {
          currentPlanCliTool = planResult.usedTool;
          currentPlanModel = planResult.usedModel;
          currentFallbackCliTools = planResult.remainingFallbackTools;
        }
        
        revisionCount++;
        
        // Update state
        executionState = {
          ...executionState,
          planGeneration: {
            ...executionState.planGeneration!,
            revisionCount,
          },
        };
        saveExecutionState(timestampDirectory, executionState);
        
        // Continue loop to check for new questions or confidence
        continue;
      }
      
      // Step 3: Check if confidence is below threshold
      if (metadata.confidence < planConfidenceThreshold) {
        console.log(`\n📊 Plan confidence (${metadata.confidence}%) is below threshold (${planConfidenceThreshold}%). Deepening plan...`);
        
        // Execute improve-plan template
        const improveTemplate = getImprovePlanTemplate();
        const improvePrompt = interpolateTemplate(improveTemplate, {
          outputDirectory,
        });
        
        // Get the appropriate CLI tool for plan operations
        const planTool = await getCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
        const planToolType = await selectCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
        
        console.log(`\n🔄 Improving plan completeness (revision ${formatIteration(revisionCount + 1, maxRevisions, isDestinyMode)})...`);
        const improveContext: ExecutionContext = {
          phase: 'improve-plan',
          outputDirectory,
          improvePlanIteration: revisionCount,
        };
        const planResult = await executeWithFallback(
          planTool,
          planToolType,
          improvePrompt,
          currentPlanModel,
          currentFallbackCliTools,
          improveContext
        );
        
        // Update mutable state if fallback occurred
        if (planResult.fallbackOccurred) {
          currentPlanCliTool = planResult.usedTool;
          currentPlanModel = planResult.usedModel;
          currentFallbackCliTools = planResult.remainingFallbackTools;
        }
        
        revisionCount++;
        
        // Update state
        executionState = {
          ...executionState,
          planGeneration: {
            ...executionState.planGeneration!,
            revisionCount,
          },
        };
        saveExecutionState(timestampDirectory, executionState);
        
        // Continue loop to check for new questions or if confidence is still low
        continue;
      }
      
      // No open questions and confidence is above threshold - we're done!
      break;
    } catch (error) {
      // If metadata file doesn't exist or can't be read, stop execution
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
  
  if (revisionCount >= maxRevisions) {
    console.log(`\n⚠️  Reached maximum plan revisions (${maxRevisions}). Stopping.`);
  } else {
    // Final check - show final status
    try {
      const finalMetadata = readPlanMetadata(outputDirectory);
      console.log(`\n✅ Plan complete! Confidence: ${finalMetadata.confidence}% (threshold: ${planConfidenceThreshold}%)`);
      
      // Log plan summary if available
      if (finalMetadata.summary) {
        console.log('\n📋 Plan Summary:');
        console.log('───────────────────────────────────────────────────────────────');
        console.log(finalMetadata.summary);
        console.log('───────────────────────────────────────────────────────────────');
      }
    } catch {
      // If we can't read metadata, that's okay - we've completed the revisions
      console.log('\n✅ Plan revisions complete.');
    }
  }

  // Update state to indicate plan generation is complete
  executionState = {
    ...executionState,
    phase: 'execution',
  };
  saveExecutionState(timestampDirectory, executionState);

  // Prepare paths for execution (will be reused)
  const requirementsPath = resolve(timestampDirectory, 'requirements.txt');
  let currentPlanPath = resolve(outputDirectory, 'plan.md');
  
  // Execution iteration loop
  // Continue executing plans (initial or gap plans) until no gaps are found or max iterations reached
  let execIterationCount = 0;
  
  while (execIterationCount < execIterations) {
    execIterationCount++;
    
    // Determine which plan to execute
    const isInitialExecution = execIterationCount === 1;
    const planType = isInitialExecution ? 'initial plan' : 'gap closure plan';
    
    console.log(`\n🚀 Starting ${planType} execution (execution iteration ${formatIteration(execIterationCount, execIterations, isDestinyMode)})...`);
    
    // Set up execution output directory: .tenacious-c/<timestamp>/execute/ or execute-{n}/
    const executeOutputDirectory = isInitialExecution 
      ? resolve(timestampDirectory, 'execute')
      : resolve(timestampDirectory, `execute-${execIterationCount}`);
    
    // Check for existing artifacts to initialize state correctly
    const existingArtifacts = getExecutionArtifacts(executeOutputDirectory, execIterationCount);
    const initialFollowUpCount = existingArtifacts.lastFollowUpIteration !== null 
      ? existingArtifacts.lastFollowUpIteration + 1 
      : 0;
    const initialHasDoneIteration0 = existingArtifacts.hasDoneIteration0;
    
    // Update state before execution (initialize from artifacts if they exist)
    executionState = {
      ...executionState,
      execution: {
        execIterationCount,
        currentPlanPath,
        executeOutputDirectory,
        followUpIterationCount: initialFollowUpCount,
        hasDoneIteration0: initialHasDoneIteration0,
      },
    };
    saveExecutionState(timestampDirectory, executionState);
    
    // Execute plan with follow-ups
    const executeResult = await executePlanWithFollowUps(
      currentPlanPath,
      requirementsPath,
      executeOutputDirectory,
      maxFollowUpIterations,
      specifiedCliTool,
      execIterationCount,
      isDestinyMode,
      currentExecuteModel,
      currentExecuteCliTool,
      currentFallbackCliTools
    );
    
    // Update mutable state if fallback occurred during execution
    if (executeResult.executeCliTool !== currentExecuteCliTool || 
        executeResult.executeModel !== currentExecuteModel) {
      currentExecuteCliTool = executeResult.executeCliTool;
      currentExecuteModel = executeResult.executeModel;
      currentFallbackCliTools = executeResult.fallbackCliTools;
    }
    
    // Sync state with artifacts after execution
    const syncedState = syncStateWithArtifacts(executionState, executeOutputDirectory, execIterationCount);
    
    // Save synced state immediately if execution state changed
    // Check if the execution properties actually changed (sync returns new object only if changed)
    const stateChanged = syncedState.execution?.followUpIterationCount !== executionState.execution?.followUpIterationCount ||
                         syncedState.execution?.hasDoneIteration0 !== executionState.execution?.hasDoneIteration0;
    if (stateChanged) {
      saveExecutionState(timestampDirectory, syncedState);
    }
    
    // Update state after execution
    executionState = {
      ...syncedState,
      phase: 'gap-audit',
    };
    saveExecutionState(timestampDirectory, executionState);
    
    // Run gap audit after execution and follow-up iterations are complete
    console.log('\n🔍 Running gap audit...');
    
    // Set up gap audit output directory: .tenacious-c/<timestamp>/gap-audit/ or gap-audit-{n}/
    const gapAuditOutputDirectory = isInitialExecution
      ? resolve(timestampDirectory, 'gap-audit')
      : resolve(timestampDirectory, `gap-audit-${execIterationCount}`);
    
    // Ensure gap audit output directory exists
    mkdirSync(gapAuditOutputDirectory, { recursive: true });
    
    // Get the gap audit template and interpolate
    const gapAuditTemplate = getGapAuditTemplate(nemesis);
    const gapAuditPrompt = interpolateTemplate(gapAuditTemplate, {
      requirementsPath,
      planPath: currentPlanPath,
      outputDirectory: gapAuditOutputDirectory,
      executionIteration: execIterationCount.toString(),
    });
    
    // Get the appropriate CLI tool for audit
    const auditTool = await getCliToolForAction('audit', currentAuditCliTool, specifiedCliTool);
    const auditToolType = await selectCliToolForAction('audit', currentAuditCliTool, specifiedCliTool);
    
    // Execute using AI CLI tool with audit model if specified, with fallback support
    const auditContext: ExecutionContext = {
      phase: 'gap-audit',
      outputDirectory: gapAuditOutputDirectory,
      executionIteration: execIterationCount,
      gapAuditIteration: execIterationCount,
    };
    const auditResult = await executeWithFallback(
      auditTool,
      auditToolType,
      gapAuditPrompt,
      currentAuditModel,
      currentFallbackCliTools,
      auditContext
    );
    
    // Update mutable state if fallback occurred
    if (auditResult.fallbackOccurred) {
      currentAuditCliTool = auditResult.usedTool;
      currentAuditModel = auditResult.usedModel;
      currentFallbackCliTools = auditResult.remainingFallbackTools;
    }
    
    console.log('\n✅ Gap audit complete!');
    
    // Log gap audit summary if available
    try {
      const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);
      if (gapAuditMetadata.summary) {
        console.log('\n🔍 Gap Audit Summary:');
        console.log('───────────────────────────────────────────────────────────────');
        console.log(gapAuditMetadata.summary);
        console.log('───────────────────────────────────────────────────────────────');
      }
    } catch {
      // If we can't read metadata, that's okay - continue
    }
    
    // Update state after gap audit
    executionState = {
      ...executionState,
      phase: 'gap-plan',
      gapAudit: {
        execIterationCount,
        gapAuditOutputDirectory,
      },
    };
    saveExecutionState(timestampDirectory, executionState);
    
    // Check if gaps were identified
    try {
      const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);
      
      if (!gapAuditMetadata.gapsIdentified) {
        // No gaps found - we're done!
        console.log('\n✅ No gaps identified. Implementation is complete!');
        break;
      }
      
      // Gaps found - create gap plan for next iteration
      console.log('\n📋 Creating gap closure plan...');
      
      // Set up gap plan output directory: .tenacious-c/<timestamp>/gap-plan/ or gap-plan-{n}/
      const gapPlanOutputDirectory = isInitialExecution
        ? resolve(timestampDirectory, 'gap-plan')
        : resolve(timestampDirectory, `gap-plan-${execIterationCount}`);
      
      // Ensure gap plan output directory exists
      mkdirSync(gapPlanOutputDirectory, { recursive: true });
      
      // Prepare path for gap plan template
      const gapAuditPath = resolve(gapAuditOutputDirectory, `gap-audit-summary-${execIterationCount}.md`);
      
      // Get the gap plan template and interpolate
      const gapPlanTemplate = getGapPlanTemplate();
      const gapPlanPrompt = interpolateTemplate(gapPlanTemplate, {
        gapAuditPath,
        outputDirectory: gapPlanOutputDirectory,
        executionIteration: execIterationCount.toString(),
      });
      
      // Get the appropriate CLI tool for plan operations
      const planTool = await getCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
      const planToolType = await selectCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
      
      // Execute using AI CLI tool with plan model if specified, with fallback support
      const gapPlanContext: ExecutionContext = {
        phase: 'gap-plan',
        outputDirectory: gapPlanOutputDirectory,
        executionIteration: execIterationCount,
      };
      const planResult = await executeWithFallback(
        planTool,
        planToolType,
        gapPlanPrompt,
        currentPlanModel,
        currentFallbackCliTools,
        gapPlanContext
      );
      
      // Update mutable state if fallback occurred
      if (planResult.fallbackOccurred) {
        currentPlanCliTool = planResult.usedTool;
        currentPlanModel = planResult.usedModel;
        currentFallbackCliTools = planResult.remainingFallbackTools;
      }
      
      console.log('\n✅ Gap closure plan complete!');
      
      // Update current plan path for next iteration
      currentPlanPath = resolve(gapPlanOutputDirectory, `gap-plan-${execIterationCount}.md`);
      
      // Update state after gap plan
      executionState = {
        ...executionState,
        phase: 'execution',
        gapPlan: {
          execIterationCount,
          gapPlanOutputDirectory,
        },
        execution: {
          execIterationCount,
          currentPlanPath,
          executeOutputDirectory: '', // Will be set in next iteration
          followUpIterationCount: 0,
          hasDoneIteration0: false,
        },
      };
      saveExecutionState(timestampDirectory, executionState);
      
    } catch (error) {
      // If metadata file doesn't exist or can't be read, assume gaps were found and continue
      if (error instanceof Error && error.message.includes('not found')) {
        console.log('\n⚠️  Could not read gap-audit-metadata.json. Assuming gaps were found and continuing...');
        
        // Create gap plan anyway
        const gapPlanOutputDirectory = isInitialExecution
          ? resolve(timestampDirectory, 'gap-plan')
          : resolve(timestampDirectory, `gap-plan-${execIterationCount}`);
        
        mkdirSync(gapPlanOutputDirectory, { recursive: true });
        
        const gapAuditPath = resolve(gapAuditOutputDirectory, `gap-audit-summary-${execIterationCount}.md`);
        const gapPlanTemplate = getGapPlanTemplate();
        const gapPlanPrompt = interpolateTemplate(gapPlanTemplate, {
          gapAuditPath,
          outputDirectory: gapPlanOutputDirectory,
          executionIteration: execIterationCount.toString(),
        });
        
        // Get the appropriate CLI tool for plan operations
        const planTool = await getCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
        const planToolType = await selectCliToolForAction('plan', currentPlanCliTool, specifiedCliTool);
        
        const gapPlanContext: ExecutionContext = {
          phase: 'gap-plan',
          outputDirectory: gapPlanOutputDirectory,
          executionIteration: execIterationCount,
        };
        const planResult = await executeWithFallback(
          planTool,
          planToolType,
          gapPlanPrompt,
          currentPlanModel,
          currentFallbackCliTools,
          gapPlanContext
        );
        
        // Update mutable state if fallback occurred
        if (planResult.fallbackOccurred) {
          currentPlanCliTool = planResult.usedTool;
          currentPlanModel = planResult.usedModel;
          currentFallbackCliTools = planResult.remainingFallbackTools;
        }
        
        console.log('\n✅ Gap closure plan complete!');
        
        currentPlanPath = resolve(gapPlanOutputDirectory, `gap-plan-${execIterationCount}.md`);
      } else {
        throw error;
      }
    }
  }
  
  if (execIterationCount >= execIterations) {
    console.log(`\n⚠️  Reached maximum execution iterations (${execIterations}). Stopping.\n`);
  }

  // Mark as complete
  executionState = {
    ...executionState,
    phase: 'complete',
  };
  saveExecutionState(timestampDirectory, executionState);

  // Generate and display final summary
  // Use default tool for summary generation
  console.log('\n📊 Generating execution summary...\n');
  try {
    const toolType = await selectCliTool(specifiedCliTool);
    const summary = await generateFinalSummary(timestampDirectory, toolType);
    console.log(summary);
  } catch (error) {
    console.warn(`\n⚠️  Could not generate final summary: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`\n📁 Artifacts are available in: ${timestampDirectory}\n`);
  }
}

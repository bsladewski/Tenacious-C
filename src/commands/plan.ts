import { existsSync, mkdirSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { AICliTool } from '../interfaces/ai-cli-tool';
import { getCliTool } from '../utils/get-cli-tool';
import { CliToolType } from '../utils/cli-tool-preference';
import { getPlaceholderTemplate } from '../templates/plan.template';
import { getAnswerQuestionsTemplate } from '../templates/answer-questions.template';
import { getImprovePlanTemplate } from '../templates/improve-plan.template';
import { getExecutePlanTemplate } from '../templates/execute-plan.template';
import { getExecuteFollowUpsTemplate } from '../templates/execute-follow-ups.template';
import { getGapAuditTemplate } from '../templates/gap-audit.template';
import { getGapPlanTemplate } from '../templates/gap-plan.template';
import { interpolateTemplate } from '../templates/prompt-template';
import { readPlanMetadata } from '../utils/read-metadata';
import { clearOpenQuestions } from '../utils/update-metadata';
import { promptForAnswers, formatAnswers } from '../utils/prompt-questions';
import { writeRequirements } from '../utils/write-requirements';
import { trackQAHistory, readQAHistory } from '../utils/track-qa-history';
import { readExecuteMetadata } from '../utils/read-execute-metadata';
import { readGapAuditMetadata } from '../utils/read-gap-audit-metadata';
import { promptForHardBlockerResolution, formatHardBlockerResolutions } from '../utils/prompt-hard-blockers';
import { generateFinalSummary } from '../utils/generate-final-summary';
import { previewPlan } from '../utils/preview-plan';
import { saveExecutionState } from '../utils/save-execution-state';
import { findLatestResumableRun } from '../utils/find-latest-run';
import { createExecutionState } from '../utils/create-execution-state';
import { resumePlan } from './resume-plan';
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
 * @param aiTool - AI CLI tool instance
 * @param executionIteration - Current execution iteration number (for display)
 * @param isDestinyMode - Whether prompt of destiny mode is active
 */
export async function executePlanWithFollowUps(
  planPath: string,
  requirementsPath: string,
  executeOutputDirectory: string,
  maxFollowUpIterations: number,
  aiTool: AICliTool,
  executionIteration: number,
  isDestinyMode: boolean
): Promise<void> {
  // Ensure execution output directory exists
  mkdirSync(executeOutputDirectory, { recursive: true });

  // Get the execute template and interpolate
  const executeTemplate = getExecutePlanTemplate();
  const executePrompt = interpolateTemplate(executeTemplate, {
    planPath,
    requirementsPath,
    outputDirectory: executeOutputDirectory,
    executionIteration: executionIteration.toString(),
  });

  // Execute using AI CLI tool
  await aiTool.execute(executePrompt);

  console.log('\n✅ Plan execution complete!');

  // Check for hard blockers after initial execution
  let hasDoneIteration0 = false; // Track if we already did iteration 0 (initial hard blocker resolution)
  try {
    const initialExecuteMetadata = readExecuteMetadata(executeOutputDirectory);
    if (initialExecuteMetadata.hardBlockers && initialExecuteMetadata.hardBlockers.length > 0) {
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

      // Get the execute follow-ups template and interpolate
      const followUpsTemplate = getExecuteFollowUpsTemplate();
      const followUpsPrompt = interpolateTemplate(followUpsTemplate, {
        executionSummaryPath,
        outputDirectory: executeOutputDirectory,
        hardBlockerResolutions: formattedResolutions,
        executionIteration: executionIteration.toString(),
        followUpIteration: followUpIteration.toString(),
      });

      // Execute using AI CLI tool
      await aiTool.execute(followUpsPrompt);
    }
  } catch (error) {
    // If metadata file doesn't exist or can't be read, continue to follow-up loop
    // This allows the tool to work even if metadata wasn't generated
    if (!(error instanceof Error && error.message.includes('not found'))) {
      throw error;
    }
  }

  // Iterative follow-up execution loop
  // Continue executing follow-ups until hasFollowUps is false or max iterations reached
  let followUpIterationCount = 0;

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

        console.log(`\n🔄 Executing follow-ups with hard blocker resolutions (iteration ${formatIteration(followUpIterationCount + 1, maxFollowUpIterations, isDestinyMode)})...`);

        // Prepare paths for follow-up execution template
        // Use the previous iteration's summary (or initial summary for first iteration)
        // If we already did iteration 0, start from there; otherwise start from initial summary
        let previousFollowUpIteration: number;
        if (hasDoneIteration0) {
          // We already did iteration 0, so read from the most recent iteration
          previousFollowUpIteration = followUpIterationCount === 0 ? 0 : followUpIterationCount;
        } else {
          // First iteration in loop, read from initial summary (no follow-up number)
          previousFollowUpIteration = -1; // Special value to indicate initial summary
        }
        const executionSummaryPath = previousFollowUpIteration === -1
          ? resolve(executeOutputDirectory, `execution-summary-${executionIteration}.md`)
          : resolve(executeOutputDirectory, `execution-summary-${executionIteration}-followup-${previousFollowUpIteration}.md`);
        const currentFollowUpIteration = hasDoneIteration0 ? followUpIterationCount + 1 : followUpIterationCount + 1;

        // Get the execute follow-ups template and interpolate
        const followUpsTemplate = getExecuteFollowUpsTemplate();
        const followUpsPrompt = interpolateTemplate(followUpsTemplate, {
          executionSummaryPath,
          outputDirectory: executeOutputDirectory,
          hardBlockerResolutions: formattedResolutions,
          executionIteration: executionIteration.toString(),
          followUpIteration: currentFollowUpIteration.toString(),
        });

      // Execute using AI CLI tool
      await aiTool.execute(followUpsPrompt);

        followUpIterationCount++;

        // Continue loop to check if there are still follow-ups or blockers
        continue;
      }

      // Check if there are follow-ups to execute
      if (!executeMetadata.hasFollowUps) {
        // No more follow-ups, we're done
        break;
      }

      console.log(`\n🔄 Executing follow-ups (iteration ${formatIteration(followUpIterationCount + 1, maxFollowUpIterations, isDestinyMode)})...`);

      // Prepare paths for follow-up execution template
      // Use the previous iteration's summary (or initial summary for first iteration)
      // If we already did iteration 0, start from there; otherwise start from initial summary
      let previousFollowUpIteration: number;
      if (hasDoneIteration0) {
        // We already did iteration 0, so read from the most recent iteration
        previousFollowUpIteration = followUpIterationCount === 0 ? 0 : followUpIterationCount;
      } else {
        // First iteration in loop, read from initial summary (no follow-up number)
        previousFollowUpIteration = -1; // Special value to indicate initial summary
      }
      const executionSummaryPath = previousFollowUpIteration === -1
        ? resolve(executeOutputDirectory, `execution-summary-${executionIteration}.md`)
        : resolve(executeOutputDirectory, `execution-summary-${executionIteration}-followup-${previousFollowUpIteration}.md`);
      const currentFollowUpIteration = hasDoneIteration0 ? followUpIterationCount + 1 : followUpIterationCount + 1;

      // Get the execute follow-ups template and interpolate
      const followUpsTemplate = getExecuteFollowUpsTemplate();
      const followUpsPrompt = interpolateTemplate(followUpsTemplate, {
        executionSummaryPath,
        outputDirectory: executeOutputDirectory,
        hardBlockerResolutions: '', // No hard blockers, empty string
        executionIteration: executionIteration.toString(),
        followUpIteration: currentFollowUpIteration.toString(),
      });

      // Execute using AI CLI tool
      await aiTool.execute(followUpsPrompt);

      followUpIterationCount++;

      // Continue loop to check if there are still follow-ups
    } catch (error) {
      // If metadata file doesn't exist or can't be read, just continue
      // This allows the tool to work even if metadata wasn't generated
      if (error instanceof Error && error.message.includes('not found')) {
        if (followUpIterationCount === 0) {
          console.log('\n⚠️  Could not read execute-metadata.json. Skipping follow-up iterations.');
        }
        break;
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
    } catch {
      // If we can't read metadata, that's okay - we've completed the iterations
      console.log('\n✅ Follow-up iterations complete.');
    }
  }
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
 */
export async function executePlan(input: string, maxRevisions: number = 10, planConfidenceThreshold: number = 85, maxFollowUpIterations: number = 10, execIterations: number = 5, isDestinyMode: boolean = false, specifiedCliTool: CliToolType | null = null, previewPlanFlag: boolean = false, resumeFlag: boolean = false): Promise<void> {
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
    },
    'plan-generation'
  );
  saveExecutionState(timestampDirectory, executionState);

  // Get the template and interpolate
  const template = getPlaceholderTemplate();
  const prompt = interpolateTemplate(template, {
    outputDirectory,
    requirements,
  });

  // Get the appropriate CLI tool (reuse for all operations in this run)
  const aiTool = await getCliTool(specifiedCliTool);
  
  // Generate initial plan
  console.log('\n📋 Generating initial plan...');
  
  // Execute using AI CLI tool
  await aiTool.execute(prompt);

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
        
        console.log(`\n🔄 Revising plan with your answers (revision ${formatIteration(revisionCount + 1, maxRevisions, isDestinyMode)})...`);
        await aiTool.execute(answerPrompt);
        
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
        
        console.log(`\n🔄 Improving plan completeness (revision ${formatIteration(revisionCount + 1, maxRevisions, isDestinyMode)})...`);
        await aiTool.execute(improvePrompt);
        
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
      // If metadata file doesn't exist or can't be read, just continue
      // This allows the tool to work even if metadata wasn't generated
      if (error instanceof Error && error.message.includes('not found')) {
        if (revisionCount === 0) {
          console.log('\n⚠️  Could not read plan-metadata.json. Skipping revisions.');
        }
        break;
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
    
    // Update state before execution
    executionState = {
      ...executionState,
      execution: {
        execIterationCount,
        currentPlanPath,
        executeOutputDirectory,
        followUpIterationCount: 0,
        hasDoneIteration0: false,
      },
    };
    saveExecutionState(timestampDirectory, executionState);
    
    // Execute plan with follow-ups
    await executePlanWithFollowUps(
      currentPlanPath,
      requirementsPath,
      executeOutputDirectory,
      maxFollowUpIterations,
      aiTool,
      execIterationCount,
      isDestinyMode
    );
    
    // Update state after execution
    executionState = {
      ...executionState,
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
    const gapAuditTemplate = getGapAuditTemplate();
    const gapAuditPrompt = interpolateTemplate(gapAuditTemplate, {
      requirementsPath,
      planPath: currentPlanPath,
      outputDirectory: gapAuditOutputDirectory,
      executionIteration: execIterationCount.toString(),
    });
    
    // Execute using AI CLI tool
    await aiTool.execute(gapAuditPrompt);
    
    console.log('\n✅ Gap audit complete!');
    
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
      
      // Execute using AI CLI tool
      await aiTool.execute(gapPlanPrompt);
      
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
        
        await aiTool.execute(gapPlanPrompt);
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
  console.log('\n📊 Generating execution summary...\n');
  try {
    const summary = await generateFinalSummary(timestampDirectory, aiTool);
    console.log(summary);
  } catch (error) {
    console.warn(`\n⚠️  Could not generate final summary: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`\n📁 Artifacts are available in: ${timestampDirectory}\n`);
  }
}

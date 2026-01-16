import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { AICliTool } from '../interfaces/ai-cli-tool';
import { getCliTool } from '../utils/get-cli-tool';
import { loadExecutionState } from '../utils/load-execution-state';
import { saveExecutionState } from '../utils/save-execution-state';
import { createExecutionState } from '../utils/create-execution-state';
import { ExecutionState } from '../schemas/execution-state.schema';
import { readPlanMetadata } from '../utils/read-metadata';
import { clearOpenQuestions } from '../utils/update-metadata';
import { promptForAnswers, formatAnswers } from '../utils/prompt-questions';
import { trackQAHistory, readQAHistory } from '../utils/track-qa-history';
import { readExecuteMetadata } from '../utils/read-execute-metadata';
import { readGapAuditMetadata } from '../utils/read-gap-audit-metadata';
import { generateFinalSummary } from '../utils/generate-final-summary';
import { verifyGapAuditArtifacts, verifyPlanFile } from '../utils/scan-execution-artifacts';
import { syncStateWithArtifacts } from '../utils/sync-state-with-artifacts';
import { getAnswerQuestionsTemplate } from '../templates/answer-questions.template';
import { getImprovePlanTemplate } from '../templates/improve-plan.template';
import { getGapAuditTemplate } from '../templates/gap-audit.template';
import { getGapPlanTemplate } from '../templates/gap-plan.template';
import { getPlaceholderTemplate } from '../templates/plan.template';
import { interpolateTemplate } from '../templates/prompt-template';
import { executePlanWithFollowUps } from './plan';

/**
 * Format iteration display string (e.g., "1/5" or "1/🌟" in destiny mode)
 */
function formatIteration(current: number, max: number, isDestinyMode: boolean): string {
  return isDestinyMode ? `${current}/🌟` : `${current}/${max}`;
}

/**
 * Resume execution from a saved state
 * @param state - The execution state to resume from
 */
export async function resumePlan(state: ExecutionState): Promise<void> {
  console.log(`\n🔄 Resuming execution from ${state.phase} phase...`);
  
  // Get the CLI tool (use saved preference or auto-detect)
  const aiTool = await getCliTool(state.config.cliTool);
  
  const { timestampDirectory, config } = state;
  const {
    maxRevisions,
    planConfidenceThreshold,
    maxFollowUpIterations,
    execIterations,
    isDestinyMode,
  } = config;
  
  // Resume based on phase
  if (state.phase === 'plan-generation' || state.phase === 'plan-revision') {
    await resumePlanGeneration(state, aiTool, maxRevisions, planConfidenceThreshold, isDestinyMode);
    
    // Reload state in case it was updated during plan generation
    const reloadedState = loadExecutionState(timestampDirectory);
    if (reloadedState) {
      state = reloadedState;
    }
    
    // Verify plan generation is actually complete before moving to execution
    const outputDirectory = resolve(timestampDirectory, 'plan');
    const planPath = resolve(outputDirectory, 'plan.md');
    
    if (!existsSync(planPath)) {
      console.error('\n❌ Plan file not found. Plan generation may not have completed. Cannot resume to execution phase.\n');
      process.exit(1);
    }
    
    // Check if plan generation actually completed (no open questions, confidence met)
    // This is a critical check - we must verify the plan is complete before execution
    let metadata;
    try {
      metadata = readPlanMetadata(outputDirectory);
    } catch {
      // If we can't read metadata, we can't verify the plan is complete
      // This is a problem - don't proceed to execution
      console.error('\n❌ Could not read plan metadata. Cannot verify plan is complete.');
      console.error('   This may indicate the plan generation was interrupted.');
      console.error('   Please check the plan file and metadata, or start a new run.\n');
      process.exit(1);
    }
    
    // Now verify the plan is actually complete
    const hasOpenQuestions = metadata.openQuestions && metadata.openQuestions.length > 0;
    const confidenceMet = metadata.confidence >= planConfidenceThreshold;
    
    if (hasOpenQuestions || !confidenceMet) {
      console.log('\n⚠️  Plan generation is not yet complete:');
      if (hasOpenQuestions) {
        console.log(`   - ${metadata.openQuestions.length} open question(s) remain`);
      }
      if (!confidenceMet) {
        console.log(`   - Confidence (${metadata.confidence}%) is below threshold (${planConfidenceThreshold}%)`);
      }
      console.log('   Please run with --resume again to continue plan generation.\n');
      // Don't update state - stay in plan-revision phase
      return; // Exit early, user should resume again after answering questions
    }
    
    // Plan generation is complete - log summary and update state
    console.log(`\n✅ Plan complete! Confidence: ${metadata.confidence}% (threshold: ${planConfidenceThreshold}%)`);
    
    // Log plan summary if available
    if (metadata.summary) {
      console.log('\n📋 Plan Summary:');
      console.log('───────────────────────────────────────────────────────────────');
      console.log(metadata.summary);
      console.log('───────────────────────────────────────────────────────────────');
    }
    
    const updatedState = {
      ...state,
      phase: 'execution' as const,
    };
    saveExecutionState(timestampDirectory, updatedState);
    state = updatedState;
  }
  
  // If we've moved past plan generation, sync state with artifacts before continuing
  if (state.phase !== 'plan-generation' && state.phase !== 'plan-revision') {
    // If we have execution state, sync it with artifacts
    if (state.execution && state.execution.execIterationCount > 0) {
      const isInitialExecution = state.execution.execIterationCount === 1;
      const executeOutputDirectory = isInitialExecution 
        ? resolve(timestampDirectory, 'execute')
        : resolve(timestampDirectory, `execute-${state.execution.execIterationCount}`);
      
      // Sync state with artifacts before resuming
      const syncedState = syncStateWithArtifacts(state, executeOutputDirectory, state.execution.execIterationCount);
      // Always save synced state (function handles comparison internally)
      saveExecutionState(timestampDirectory, syncedState);
      state = syncedState;
    }
    
    await resumeExecution(state, aiTool, maxFollowUpIterations, execIterations, isDestinyMode);
  }
  
  // Mark as complete and generate final summary
  const finalState = createExecutionState(
    timestampDirectory,
    state.requirements,
    config,
    'complete'
  );
  saveExecutionState(timestampDirectory, finalState);
  
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

/**
 * Resume plan generation phase
 */
async function resumePlanGeneration(
  state: ExecutionState,
  aiTool: AICliTool,
  maxRevisions: number,
  planConfidenceThreshold: number,
  isDestinyMode: boolean
): Promise<void> {
  const { timestampDirectory } = state;
  const outputDirectory = resolve(timestampDirectory, 'plan');
  const planPath = resolve(outputDirectory, 'plan.md');
  
  // Ensure output directory exists
  mkdirSync(outputDirectory, { recursive: true });
  
  // Check if plan file exists - if not, we need to generate it first
  const planFileCheck = verifyPlanFile(planPath);
  if (!planFileCheck.exists) {
    if (!state.planGeneration) {
      // No plan generation state - this is a fresh start
      console.log('\n⚠️  No plan generation state found. Generating initial plan...');
    } else {
      console.log('\n⚠️  Plan file not found. Generating initial plan...');
    }
    console.log('\n⚠️  Plan file not found. Generating initial plan...');
    
    // Get the template and interpolate
    const template = getPlaceholderTemplate();
    const prompt = interpolateTemplate(template, {
      outputDirectory,
      requirements: state.requirements,
    });
    
    // Execute using AI CLI tool
    await aiTool.execute(prompt);
    
    // Update state after initial plan generation
    const updatedState = {
      ...state,
      phase: 'plan-revision' as const,
      planGeneration: {
        revisionCount: 0,
        planPath: planFileCheck.resolvedPath,
        outputDirectory,
      },
    };
    saveExecutionState(timestampDirectory, updatedState);
    // The caller will reload the state, so we can continue with the updated state
    // For now, update the local state reference so we can continue
    state.planGeneration = {
      revisionCount: 0,
      planPath: planFileCheck.resolvedPath,
      outputDirectory,
    };
  }
  
  // Verify plan file exists before proceeding
  const finalPlanCheck = verifyPlanFile(planPath);
  if (!finalPlanCheck.exists) {
    console.error(`\n❌ Plan file not found at: ${planPath}\n`);
    process.exit(1);
  }
  
  // If we still don't have planGeneration state, initialize it
  if (!state.planGeneration) {
    state.planGeneration = {
      revisionCount: 0,
      planPath: finalPlanCheck.resolvedPath,
      outputDirectory,
    };
  }
  
  let revisionCount = state.planGeneration.revisionCount || 0;
  
  // Continue plan revision loop
  while (revisionCount < maxRevisions) {
    try {
      const metadata = readPlanMetadata(outputDirectory);
      
      // Check for open questions
      if (metadata.openQuestions && metadata.openQuestions.length > 0) {
        console.log(`\n📋 Open questions found (revision ${formatIteration(revisionCount + 1, maxRevisions, isDestinyMode)}). Please provide answers:`);
        
        const questionsToAnswer = [...metadata.openQuestions];
        clearOpenQuestions(outputDirectory);
        
        const answers = await promptForAnswers(questionsToAnswer);
        
        for (const question of questionsToAnswer) {
          const answer = answers.get(question.question) || '';
          trackQAHistory(timestampDirectory, question.question, answer);
        }
        
        const formattedAnswers = formatAnswers(answers);
        const qaHistory = readQAHistory(timestampDirectory);
        
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
        const updatedState = {
          ...state,
          phase: 'plan-revision' as const,
          planGeneration: {
            ...state.planGeneration!,
            revisionCount,
          },
        };
        saveExecutionState(timestampDirectory, updatedState);
        continue;
      }
      
      // Check confidence
      if (metadata.confidence < planConfidenceThreshold) {
        console.log(`\n📊 Plan confidence (${metadata.confidence}%) is below threshold (${planConfidenceThreshold}%). Deepening plan...`);
        
        const improveTemplate = getImprovePlanTemplate();
        const improvePrompt = interpolateTemplate(improveTemplate, {
          outputDirectory,
        });
        
        console.log(`\n🔄 Improving plan completeness (revision ${formatIteration(revisionCount + 1, maxRevisions, isDestinyMode)})...`);
        await aiTool.execute(improvePrompt);
        
        revisionCount++;
        
        // Update state
        const updatedState = {
          ...state,
          phase: 'plan-revision' as const,
          planGeneration: {
            ...state.planGeneration!,
            revisionCount,
          },
        };
        saveExecutionState(timestampDirectory, updatedState);
        continue;
      }
      
      // Plan is complete - no open questions and confidence is met
      break;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        // If metadata doesn't exist, we can't continue with revisions
        // This might happen if plan generation was interrupted before metadata was created
        if (revisionCount === 0) {
          console.log('\n⚠️  Could not read plan-metadata.json.');
          console.log('   Plan may have been interrupted before metadata was generated.');
          console.log('   The plan file exists, but we cannot verify it is complete.');
        }
        // Exit the loop - let the caller verify completion
        break;
      } else {
        throw error;
      }
    }
  }
  
  // Update state - but don't change phase to 'execution' yet
  // The caller will verify plan is complete before moving to execution
  if (state.planGeneration) {
    const updatedState = {
      ...state,
      phase: 'plan-revision' as const,
      planGeneration: {
        ...state.planGeneration,
        revisionCount,
      },
    };
    saveExecutionState(timestampDirectory, updatedState);
  }
}

/**
 * Resume execution phase
 */
async function resumeExecution(
  state: ExecutionState,
  aiTool: AICliTool,
  maxFollowUpIterations: number,
  execIterations: number,
  isDestinyMode: boolean
): Promise<void> {
  const { timestampDirectory } = state;
  const outputDirectory = resolve(timestampDirectory, 'plan');
  const requirementsPath = resolve(timestampDirectory, 'requirements.txt');
  
  // Determine current plan path and verify it exists
  let currentPlanPath = state.execution?.currentPlanPath || resolve(outputDirectory, 'plan.md');
  const initialPlanCheck = verifyPlanFile(currentPlanPath);
  if (!initialPlanCheck.exists) {
    // Plan file doesn't exist, try to construct correct path
    console.log(`\n⚠️  Plan file not found at: ${currentPlanPath}`);
    // Try default plan path
    const defaultPlanPath = resolve(outputDirectory, 'plan.md');
    const defaultPlanCheck = verifyPlanFile(defaultPlanPath);
    if (defaultPlanCheck.exists) {
      console.log(`   Using default plan path: ${defaultPlanPath}`);
      currentPlanPath = defaultPlanPath;
    } else {
      console.error(`\n❌ Plan file not found. Cannot resume execution.\n`);
      process.exit(1);
    }
  } else {
    currentPlanPath = initialPlanCheck.resolvedPath;
  }
  
  // Start from the saved execution iteration, or determine where we are
  let execIterationCount = state.execution?.execIterationCount || 0;
  
  // If we have gap plan state, we've already done at least one execution iteration
  if (state.gapPlan) {
    execIterationCount = state.gapPlan.execIterationCount;
    const gapPlanPath = state.execution?.currentPlanPath || resolve(timestampDirectory, `gap-plan-${execIterationCount}`, `gap-plan-${execIterationCount}.md`);
    const gapPlanCheck = verifyPlanFile(gapPlanPath);
    if (gapPlanCheck.exists) {
      currentPlanPath = gapPlanCheck.resolvedPath;
    } else {
      console.log(`\n⚠️  Gap plan file not found at: ${gapPlanPath}`);
      console.log('   Will attempt to locate or regenerate...');
    }
  } else if (state.gapAudit) {
    execIterationCount = state.gapAudit.execIterationCount;
  } else if (state.execution) {
    execIterationCount = state.execution.execIterationCount;
  }
  
  // Check if the current execution iteration is complete before moving to the next one
  // This handles the case where execution was interrupted mid-way through follow-ups
  let currentIterationCompleted = false;
  if (execIterationCount > 0) {
    const isInitialExecution = execIterationCount === 1;
    const currentExecuteOutputDirectory = isInitialExecution 
      ? resolve(timestampDirectory, 'execute')
      : resolve(timestampDirectory, `execute-${execIterationCount}`);
    
    // Check if current iteration is complete
    if (!isExecutionComplete(currentExecuteOutputDirectory)) {
      // Current iteration is not complete - continue with it
      console.log(`\n🔄 Continuing execution iteration ${execIterationCount} (follow-ups not yet complete)...`);
      
      await executePlanWithFollowUps(
        currentPlanPath,
        requirementsPath,
        currentExecuteOutputDirectory,
        maxFollowUpIterations,
        aiTool,
        execIterationCount,
        isDestinyMode
      );
      
      // Mark that we've completed this iteration
      currentIterationCompleted = true;
      
      // Sync state with artifacts after execution
      const syncedState = syncStateWithArtifacts(state, currentExecuteOutputDirectory, execIterationCount);
      
      // Update state after execution
      const updatedState: ExecutionState = {
        ...syncedState,
        phase: 'gap-audit' as const,
        execution: {
          ...syncedState.execution!,
          execIterationCount,
          currentPlanPath,
          executeOutputDirectory: currentExecuteOutputDirectory,
        },
      };
      saveExecutionState(timestampDirectory, updatedState);
      state = updatedState;
      
      // Continue to gap audit for this iteration (will be handled below)
    } else {
      // Current iteration is complete, move to next one
      execIterationCount++;
      currentIterationCompleted = true; // Already completed, so we'll process gap audit
    }
  } else {
    // No execution iteration yet, start with first one
    execIterationCount = 1;
  }
  
  // If we just completed the current iteration, handle gap audit for it before moving to next iterations
  if (currentIterationCompleted && execIterationCount > 0) {
    const isInitialExecution = execIterationCount === 1;
    
    // Run gap audit for the completed iteration
    const gapAuditOutputDirectory = isInitialExecution
      ? resolve(timestampDirectory, 'gap-audit')
      : resolve(timestampDirectory, `gap-audit-${execIterationCount}`);
    
    // Check if gap audit is already complete (verify both metadata and summary file)
    const gapAuditArtifacts = verifyGapAuditArtifacts(gapAuditOutputDirectory, execIterationCount);
    let gapAuditComplete = gapAuditArtifacts.isComplete;
    let gapsIdentified = false;
    
    if (gapAuditArtifacts.metadataExists && !gapAuditArtifacts.summaryExists) {
      // Metadata exists but summary doesn't - this is inconsistent
      console.log(`\n⚠️  Gap audit metadata exists but summary file is missing for iteration ${execIterationCount}.`);
      console.log('   Regenerating gap audit...');
      gapAuditComplete = false;
    } else if (gapAuditComplete) {
      try {
        const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);
        gapsIdentified = gapAuditMetadata.gapsIdentified;
        console.log(`\n✅ Gap audit for iteration ${execIterationCount} already complete.`);
      } catch {
        // If we can't read metadata, treat as incomplete
        gapAuditComplete = false;
      }
    }
    
    if (!gapAuditComplete) {
      console.log('\n🔍 Running gap audit...');
      mkdirSync(gapAuditOutputDirectory, { recursive: true });
      
      const gapAuditTemplate = getGapAuditTemplate();
      const gapAuditPrompt = interpolateTemplate(gapAuditTemplate, {
        requirementsPath,
        planPath: currentPlanPath,
        outputDirectory: gapAuditOutputDirectory,
        executionIteration: execIterationCount.toString(),
      });
      
      await aiTool.execute(gapAuditPrompt);
      console.log('\n✅ Gap audit complete!');
      
      // Read gap audit metadata
      try {
        const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);
        gapsIdentified = gapAuditMetadata.gapsIdentified;
        
        // Log gap audit summary if available
        if (gapAuditMetadata.summary) {
          console.log('\n🔍 Gap Audit Summary:');
          console.log('───────────────────────────────────────────────────────────────');
          console.log(gapAuditMetadata.summary);
          console.log('───────────────────────────────────────────────────────────────');
        }
      } catch {
        // Assume gaps were found if we can't read metadata
        gapsIdentified = true;
      }
    } else if (gapAuditComplete) {
      // Gap audit was already complete, but we should still log the summary
      try {
        const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);
        if (gapAuditMetadata.summary) {
          console.log('\n🔍 Gap Audit Summary:');
          console.log('───────────────────────────────────────────────────────────────');
          console.log(gapAuditMetadata.summary);
          console.log('───────────────────────────────────────────────────────────────');
        }
      } catch {
        // If we can't read metadata, that's okay
      }
    }
    
    // Update state
    const auditState: ExecutionState = {
      ...state,
      phase: 'gap-plan' as const,
      gapAudit: {
        execIterationCount,
        gapAuditOutputDirectory,
      },
    };
    saveExecutionState(timestampDirectory, auditState);
    state = auditState;
    
    // Check for gaps
    if (!gapsIdentified) {
      console.log('\n✅ No gaps identified. Implementation is complete!');
      return; // Exit early - we're done
    }
    
    // Create gap plan
    console.log('\n📋 Creating gap closure plan...');
    
    const gapPlanOutputDirectory = isInitialExecution
      ? resolve(timestampDirectory, 'gap-plan')
      : resolve(timestampDirectory, `gap-plan-${execIterationCount}`);
    
    // Check if gap plan already exists and verify the file
    const gapPlanPath = resolve(gapPlanOutputDirectory, `gap-plan-${execIterationCount}.md`);
    const planFileCheck = verifyPlanFile(gapPlanPath);
    if (planFileCheck.exists) {
      console.log(`\n✅ Gap plan for iteration ${execIterationCount} already exists.`);
      currentPlanPath = planFileCheck.resolvedPath;
    } else {
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
      
      currentPlanPath = gapPlanPath;
    }
    
    // Update state for next iteration
    const gapPlanState: ExecutionState = {
      ...auditState,
      phase: 'execution' as const,
      gapPlan: {
        execIterationCount,
        gapPlanOutputDirectory,
      },
      execution: {
        execIterationCount: execIterationCount + 1, // Next iteration
        currentPlanPath,
        executeOutputDirectory: '', // Will be set in next iteration
        followUpIterationCount: 0,
        hasDoneIteration0: false,
      },
    };
    saveExecutionState(timestampDirectory, gapPlanState);
    state = gapPlanState;
    
    // Move to next iteration
    execIterationCount++;
  }
  
  // Continue execution loop from where we left off
  while (execIterationCount < execIterations) {
    const isInitialExecution = execIterationCount === 1;
    const planType = isInitialExecution ? 'initial plan' : 'gap closure plan';
    
    console.log(`\n🚀 Starting ${planType} execution (execution iteration ${formatIteration(execIterationCount, execIterations, isDestinyMode)})...`);
    
    const executeOutputDirectory = isInitialExecution 
      ? resolve(timestampDirectory, 'execute')
      : resolve(timestampDirectory, `execute-${execIterationCount}`);
    
    // Check if this execution iteration is already complete
    let updatedState: ExecutionState;
    if (isExecutionComplete(executeOutputDirectory)) {
      console.log(`\n✅ Execution iteration ${execIterationCount} already completed. Skipping...`);
      
      // Update state and continue to gap audit
      updatedState = {
        ...state,
        phase: 'gap-audit' as const,
        execution: {
          execIterationCount,
          currentPlanPath,
          executeOutputDirectory,
          followUpIterationCount: 0,
          hasDoneIteration0: false,
        },
      };
      saveExecutionState(timestampDirectory, updatedState);
      
      // Continue to gap audit (will be handled below)
    } else {
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
      
      // Sync state with artifacts after execution
      const syncedState = syncStateWithArtifacts(state, executeOutputDirectory, execIterationCount);
      
      // Update state after execution
      updatedState = {
        ...syncedState,
        phase: 'gap-audit' as const,
        execution: {
          ...syncedState.execution!,
          execIterationCount,
          currentPlanPath,
          executeOutputDirectory,
        },
      };
      saveExecutionState(timestampDirectory, updatedState);
    }
    
    // Run gap audit
    const gapAuditOutputDirectory = isInitialExecution
      ? resolve(timestampDirectory, 'gap-audit')
      : resolve(timestampDirectory, `gap-audit-${execIterationCount}`);
    
    // Check if gap audit is already complete (verify both metadata and summary file)
    const gapAuditArtifacts = verifyGapAuditArtifacts(gapAuditOutputDirectory, execIterationCount);
    let gapAuditComplete = gapAuditArtifacts.isComplete;
    let gapsIdentified = false;
    
    if (gapAuditArtifacts.metadataExists && !gapAuditArtifacts.summaryExists) {
      // Metadata exists but summary doesn't - this is inconsistent
      console.log(`\n⚠️  Gap audit metadata exists but summary file is missing for iteration ${execIterationCount}.`);
      console.log('   Regenerating gap audit...');
      gapAuditComplete = false;
    } else if (gapAuditComplete) {
      try {
        const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);
        gapsIdentified = gapAuditMetadata.gapsIdentified;
        console.log(`\n✅ Gap audit for iteration ${execIterationCount} already complete.`);
      } catch {
        // If we can't read metadata, treat as incomplete
        gapAuditComplete = false;
      }
    }
    
    if (!gapAuditComplete) {
      console.log('\n🔍 Running gap audit...');
      mkdirSync(gapAuditOutputDirectory, { recursive: true });
      
      const gapAuditTemplate = getGapAuditTemplate();
      const gapAuditPrompt = interpolateTemplate(gapAuditTemplate, {
        requirementsPath,
        planPath: currentPlanPath,
        outputDirectory: gapAuditOutputDirectory,
        executionIteration: execIterationCount.toString(),
      });
      
      await aiTool.execute(gapAuditPrompt);
      console.log('\n✅ Gap audit complete!');
      
      // Read gap audit metadata
      try {
        const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);
        gapsIdentified = gapAuditMetadata.gapsIdentified;
        
        // Log gap audit summary if available
        if (gapAuditMetadata.summary) {
          console.log('\n🔍 Gap Audit Summary:');
          console.log('───────────────────────────────────────────────────────────────');
          console.log(gapAuditMetadata.summary);
          console.log('───────────────────────────────────────────────────────────────');
        }
      } catch {
        // Assume gaps were found if we can't read metadata
        gapsIdentified = true;
      }
    } else if (gapAuditComplete) {
      // Gap audit was already complete, but we should still log the summary
      try {
        const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);
        if (gapAuditMetadata.summary) {
          console.log('\n🔍 Gap Audit Summary:');
          console.log('───────────────────────────────────────────────────────────────');
          console.log(gapAuditMetadata.summary);
          console.log('───────────────────────────────────────────────────────────────');
        }
      } catch {
        // If we can't read metadata, that's okay
      }
    }
    
    // Update state
    const auditState: ExecutionState = {
      ...updatedState,
      phase: 'gap-plan' as const,
      gapAudit: {
        execIterationCount,
        gapAuditOutputDirectory,
      },
    };
    saveExecutionState(timestampDirectory, auditState);
    
    // Check for gaps
    if (!gapsIdentified) {
      console.log('\n✅ No gaps identified. Implementation is complete!');
      break;
    }
    
    // Create gap plan
    const gapPlanOutputDirectory = isInitialExecution
      ? resolve(timestampDirectory, 'gap-plan')
      : resolve(timestampDirectory, `gap-plan-${execIterationCount}`);
    
    // Check if gap plan already exists and verify the file
    const gapPlanPath = resolve(gapPlanOutputDirectory, `gap-plan-${execIterationCount}.md`);
    const planFileCheck = verifyPlanFile(gapPlanPath);
    if (planFileCheck.exists) {
      console.log(`\n✅ Gap plan for iteration ${execIterationCount} already exists.`);
      currentPlanPath = planFileCheck.resolvedPath;
    } else {
      console.log('\n📋 Creating gap closure plan...');
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
      
      currentPlanPath = gapPlanPath;
    }
    
    // Update state for next iteration
    const gapPlanState: ExecutionState = {
      ...auditState,
      phase: 'execution' as const,
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
    saveExecutionState(timestampDirectory, gapPlanState);
  }
}

/**
 * Check if an execution iteration is already complete
 */
function isExecutionComplete(executeOutputDirectory: string): boolean {
  try {
    const metadata = readExecuteMetadata(executeOutputDirectory);
    return !metadata.hasFollowUps;
  } catch {
    return false;
  }
}

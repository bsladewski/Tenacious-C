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
    
    // Plan generation is complete - update state and continue to execution
    const updatedState = {
      ...state,
      phase: 'execution' as const,
    };
    saveExecutionState(timestampDirectory, updatedState);
    state = updatedState;
  }
  
  // If we've moved past plan generation, continue with execution
  if (state.phase !== 'plan-generation' && state.phase !== 'plan-revision') {
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
  if (!existsSync(planPath)) {
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
        planPath,
        outputDirectory,
      },
    };
    saveExecutionState(timestampDirectory, updatedState);
    // The caller will reload the state, so we can continue with the updated state
    // For now, update the local state reference so we can continue
    state.planGeneration = {
      revisionCount: 0,
      planPath,
      outputDirectory,
    };
  }
  
  // If we still don't have planGeneration state, initialize it
  if (!state.planGeneration) {
    state.planGeneration = {
      revisionCount: 0,
      planPath,
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
  
  // Determine current plan path
  let currentPlanPath = state.execution?.currentPlanPath || resolve(outputDirectory, 'plan.md');
  
  // Start from the saved execution iteration, or determine where we are
  let execIterationCount = state.execution?.execIterationCount || 0;
  
  // If we have gap plan state, we've already done at least one execution iteration
  if (state.gapPlan) {
    execIterationCount = state.gapPlan.execIterationCount;
    currentPlanPath = state.execution?.currentPlanPath || resolve(timestampDirectory, `gap-plan-${execIterationCount}`, `gap-plan-${execIterationCount}.md`);
  } else if (state.gapAudit) {
    execIterationCount = state.gapAudit.execIterationCount;
  } else if (state.execution) {
    execIterationCount = state.execution.execIterationCount;
  }
  
  // Continue execution loop from where we left off
  while (execIterationCount < execIterations) {
    execIterationCount++;
    
    const isInitialExecution = execIterationCount === 1;
    const planType = isInitialExecution ? 'initial plan' : 'gap closure plan';
    
    console.log(`\n🚀 Starting ${planType} execution (execution iteration ${formatIteration(execIterationCount, execIterations, isDestinyMode)})...`);
    
    const executeOutputDirectory = isInitialExecution 
      ? resolve(timestampDirectory, 'execute')
      : resolve(timestampDirectory, `execute-${execIterationCount}`);
    
    // Check if this execution iteration is already complete
    if (isExecutionComplete(executeOutputDirectory)) {
      console.log(`\n✅ Execution iteration ${execIterationCount} already completed. Skipping...`);
      
      // Update state and continue to gap audit
      const updatedState: ExecutionState = {
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
      
      // Continue to gap audit
      continue;
    }
    
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
    const updatedState: ExecutionState = {
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
    
    // Run gap audit
    const gapAuditOutputDirectory = isInitialExecution
      ? resolve(timestampDirectory, 'gap-audit')
      : resolve(timestampDirectory, `gap-audit-${execIterationCount}`);
    
    // Check if gap audit is already complete
    const gapAuditMetadataPath = resolve(gapAuditOutputDirectory, 'gap-audit-metadata.json');
    let gapAuditComplete = false;
    let gapsIdentified = false;
    
    if (existsSync(gapAuditMetadataPath)) {
      try {
        const gapAuditMetadata = readGapAuditMetadata(gapAuditOutputDirectory);
        gapAuditComplete = true;
        gapsIdentified = gapAuditMetadata.gapsIdentified;
        console.log(`\n✅ Gap audit for iteration ${execIterationCount} already complete.`);
      } catch {
        // Continue with gap audit
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
      } catch {
        // Assume gaps were found if we can't read metadata
        gapsIdentified = true;
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
    
    // Check if gap plan already exists
    const gapPlanPath = resolve(gapPlanOutputDirectory, `gap-plan-${execIterationCount}.md`);
    if (existsSync(gapPlanPath)) {
      console.log(`\n✅ Gap plan for iteration ${execIterationCount} already exists.`);
      currentPlanPath = gapPlanPath;
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

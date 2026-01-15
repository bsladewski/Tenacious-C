import { existsSync, mkdirSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { CodexCliTool } from '../tools/codex-cli-tool';
import { getPlaceholderTemplate } from '../templates/plan.template';
import { getAnswerQuestionsTemplate } from '../templates/answer-questions.template';
import { interpolateTemplate } from '../templates/prompt-template';
import { readPlanMetadata } from '../utils/read-metadata';
import { clearOpenQuestions } from '../utils/update-metadata';
import { promptForAnswers, formatAnswers } from '../utils/prompt-questions';

/**
 * Execute the plan command
 * @param input - Either a string prompt or a file path
 * @param maxRevisions - Maximum number of plan revisions (default: 10)
 */
export async function executePlan(input: string, maxRevisions: number = 10): Promise<void> {
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
  const outputDirectory = resolve(process.cwd(), '.tenacious-c', timestamp, 'plan');

  // Ensure output directory exists
  mkdirSync(outputDirectory, { recursive: true });

  // Get the template and interpolate
  const template = getPlaceholderTemplate();
  const prompt = interpolateTemplate(template, {
    outputDirectory,
    requirements,
  });

  // Execute using Codex CLI tool
  const codexTool = new CodexCliTool();
  await codexTool.execute(prompt);

  // Iterative plan revision loop
  // This handles question-answering revisions and will support other revision types
  let revisionCount = 0;
  
  while (revisionCount < maxRevisions) {
    try {
      const metadata = readPlanMetadata(outputDirectory);
      
      // Check if there are open questions
      if (!metadata.openQuestions || metadata.openQuestions.length === 0) {
        // No more questions, we're done
        break;
      }
      
      console.log(`\n📋 Open questions found (revision ${revisionCount + 1}/${maxRevisions}). Please provide answers:\n`);
      
      // Store questions before clearing (so we can prompt with them)
      const questionsToAnswer = [...metadata.openQuestions];
      
      // Clear open questions in metadata before prompting
      // This prevents the same questions from being asked again if revision fails
      clearOpenQuestions(outputDirectory);
      
      // Prompt user for answers
      const answers = await promptForAnswers(questionsToAnswer);
      
      // Format answers for the template
      const formattedAnswers = formatAnswers(answers);
      
      // Execute answer-questions template
      const answerTemplate = getAnswerQuestionsTemplate();
      const answerPrompt = interpolateTemplate(answerTemplate, {
        outputDirectory,
        answers: formattedAnswers,
      });
      
      console.log(`\n🔄 Revising plan with your answers (revision ${revisionCount + 1}/${maxRevisions})...\n`);
      await codexTool.execute(answerPrompt);
      
      revisionCount++;
    } catch (error) {
      // If metadata file doesn't exist or can't be read, just continue
      // This allows the tool to work even if metadata wasn't generated
      if (error instanceof Error && error.message.includes('not found')) {
        if (revisionCount === 0) {
          console.log('\n⚠️  Could not read plan-metadata.json. Skipping revisions.\n');
        }
        break;
      } else {
        throw error;
      }
    }
  }
  
  if (revisionCount >= maxRevisions) {
    console.log(`\n⚠️  Reached maximum plan revisions (${maxRevisions}). Stopping.\n`);
  }
}

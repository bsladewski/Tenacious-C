import inquirer from 'inquirer';
import { PlanMetadata, OpenQuestion } from '../schemas/plan-metadata.schema';

/**
 * Prompt user to answer open questions interactively
 * @param questions - Array of open questions to ask
 * @returns Map of question to answer
 */
export async function promptForAnswers(
  questions: OpenQuestion[]
): Promise<Map<string, string>> {
  const answers = new Map<string, string>();

  for (const question of questions) {
    // Validate question structure
    if (!question || typeof question.question !== 'string') {
      console.warn('Warning: Invalid question structure, skipping:', question);
      continue;
    }

    // Only use list prompt if we have suggested answers
    // Check more robustly for suggested answers
    const suggestedAnswers = question.suggestedAnswers;
    const hasSuggestedAnswers = 
      suggestedAnswers !== undefined &&
      suggestedAnswers !== null &&
      Array.isArray(suggestedAnswers) && 
      suggestedAnswers.length >= 2; // Require at least 2 as per template requirements

    let answer: string;

    if (hasSuggestedAnswers && suggestedAnswers) {
      // Create choices from suggested answers
      const choices = [
        ...suggestedAnswers.map((answer) => ({
          name: String(answer), // Ensure it's a string
          value: String(answer),
        })),
        { name: 'Enter custom answer', value: '__CUSTOM__' },
      ];
      
      // Use 'select' prompt - inquirer v13+ removed 'list' type
      // Arrow keys (up/down) navigate, Enter selects
      const response = await inquirer.prompt([
        {
          type: 'select',
          name: 'answer',
          message: question.question,
          choices: choices,
          pageSize: choices.length, // Show all options at once for faster navigation
          default: 0, // Default to first suggested answer for quick selection
        },
      ]);

      if (response.answer === '__CUSTOM__') {
        // Prompt for custom answer only when needed
        const customResponse = await inquirer.prompt([
          {
            type: 'input',
            name: 'answer',
            message: 'Enter your custom answer:',
            validate: (input: string) => {
              if (!input.trim()) {
                return 'Please enter an answer';
              }
              return true;
            },
          },
        ]);
        answer = customResponse.answer;
      } else {
        answer = response.answer;
      }
    } else {
      // No suggested answers, use input prompt
      // Warn if question should have had suggested answers
      if (!suggestedAnswers || suggestedAnswers.length < 2) {
        console.warn(`Warning: Question "${question.question}" has no suggested answers or fewer than 2. Using input prompt.`);
      }
      const response = await inquirer.prompt([
        {
          type: 'input',
          name: 'answer',
          message: question.question,
          validate: (input: string) => {
            if (!input.trim()) {
              return 'Please enter an answer';
            }
            return true;
          },
        },
      ]);
      answer = response.answer;
    }

    answers.set(question.question, answer);
  }

  return answers;
}

/**
 * Format answers as a string for the answer-questions template
 * @param answers - Map of question to answer
 * @returns Formatted string with Q&A pairs
 */
export function formatAnswers(answers: Map<string, string>): string {
  const lines: string[] = [];
  for (const [question, answer] of answers.entries()) {
    lines.push(`Q: ${question}`);
    lines.push(`A: ${answer}`);
    lines.push(''); // Empty line between Q&A pairs
  }
  return lines.join('\n').trim();
}

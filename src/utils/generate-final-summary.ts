import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { AICliTool } from '../interfaces/ai-cli-tool';
import { getGenerateSummaryTemplate } from '../templates/generate-summary.template';
import { interpolateTemplate } from '../templates/prompt-template';

/**
 * Generate a final terminal-friendly summary of the execution run
 * @param timestampDirectory - The .tenacious-c/<timestamp> directory containing all artifacts
 * @param aiTool - AI CLI tool instance to use for generating the summary
 * @returns The generated summary as a string
 */
export async function generateFinalSummary(
  timestampDirectory: string,
  aiTool: AICliTool
): Promise<string> {
  // Get the summary generation template
  const template = getGenerateSummaryTemplate();
  const prompt = interpolateTemplate(template, {
    timestampDirectory,
  });

  // Execute the prompt to generate the summary
  // We need to capture the output, but the AICliTool interface doesn't return output
  // So we'll need to modify our approach - let's create a temporary file for the output
  const summaryOutputFile = resolve(timestampDirectory, 'final-summary-output.txt');
  
  // Modify the prompt to include explicit output file instruction
  const promptWithOutput = `${prompt}

**CRITICAL OUTPUT INSTRUCTION:**

You MUST write the generated summary to this exact file path:
\`${summaryOutputFile}\`

The summary must be:
- Plain text (no markdown formatting)
- Terminal-friendly (use ASCII characters)
- Follow the exact format specified above
- Include all sections: Original Requirements, Work Accomplished, Execution Statistics, Output Location

Write ONLY the summary content to the file - no additional commentary or explanations.`;

  // Execute using AI CLI tool
  await aiTool.execute(promptWithOutput);

  // Wait a moment for file to be written, then read it
  // Try reading with a small delay and retries
  let summary = '';
  let attempts = 0;
  const maxAttempts = 5;
  
  while (attempts < maxAttempts) {
    try {
      summary = readFileSync(summaryOutputFile, 'utf-8');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        attempts++;
        if (attempts < maxAttempts) {
          // Wait 500ms before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
      } else {
        throw error;
      }
    }
  }

  if (!summary) {
    // If file wasn't created, return a fallback message
    return `\n⚠️  Summary generation completed, but output file was not found.\n   Artifacts are available in: ${timestampDirectory}\n`;
  }

  return summary.trim();
}

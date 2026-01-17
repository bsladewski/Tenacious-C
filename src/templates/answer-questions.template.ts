import { PromptTemplate } from './prompt-template';
import { getPlanMetadataSchemaString } from '../schemas/plan-metadata.schema';

/**
 * Answer questions template for revising plans with user answers
 * This is a variation of the plan prompt focused on revising an existing plan
 * 
 * Note: This function returns a template with the metadata schema already interpolated.
 * The schema is loaded from the codebase to ensure consistency between the tool and the prompt.
 */
export function getAnswerQuestionsTemplate(): PromptTemplate {
  const metadataSchema = getPlanMetadataSchemaString();
  
  return {
    template: `You are revising an existing plan for codebase changes (frontend, backend, or both as required).

The plan is located at \`{{outputDirectory}}/plan.md\`. You have received answers to open questions that were identified during the initial planning phase.

Follow instruction precedence (highest to lowest):

1. This command's rules  
2. Agent rules (e.g., \`cursorrules/\`, \`agents.md\`, etc.)  
3. The original plan requirements  
4. The answers provided below

---

## Guardrails

**Purpose:** This command is for **deep analysis and revision of the existing plan only**.

- Perform a **deep analysis** of the existing plan to understand its structure, assumptions, and dependencies.
- **Only modify files in** \`{{outputDirectory}}\` - specifically, update \`{{outputDirectory}}/plan.md\` and \`{{outputDirectory}}/plan-metadata.json\`.
- **Do NOT modify any files outside** \`{{outputDirectory}}\`.
- Respect the existing plan structure and format - maintain consistency with the original plan's organization.
- If the answers reveal new requirements or constraints, incorporate them thoughtfully into the plan.
- Update the plan metadata (confidence level, remove answered questions from openQuestions array).

**CRITICAL REVISION RULE:**  
You MUST NOT modify any files besides the plan markdown and metadata JSON in \`{{outputDirectory}}\`.

---

## Revision Process

1. **Read and analyze** the existing plan at \`{{outputDirectory}}/plan.md\` thoroughly.
2. **Identify** all sections, assumptions, or decisions that were based on the open questions.
3. **Incorporate** the provided answers into the plan:
   - Update relevant sections with concrete decisions based on the answers
   - Remove ambiguity and assumptions that are now resolved
   - Ensure the plan reflects the answers accurately
4. **Update metadata** in \`{{outputDirectory}}/plan-metadata.json\`:
   - Remove answered questions from the \`openQuestions\` array
   - Add any NEW open questions that surface during revision to the \`openQuestions\` array
   - **Each new question MUST include at least 2 suggested answers** in the \`suggestedAnswers\` array
   - Adjust \`confidence\` level if appropriate based on the clarity gained from answers
   - The metadata file MUST conform to the exact schema provided below
5. **Maintain** the plan's structure, format, and organization while making revisions.

---

## Answers to Open Questions

{{answers}}

---

## Q&A History

The following is a complete history of all questions and answers from previous revision iterations. Use this to:
- Avoid asking the same questions again
- Maintain consistency with previous decisions
- Understand the context of how the plan has evolved

{{qaHistory}}

**Note:** If the Q&A history is empty, this is the first iteration of question-answering.

---

## Plan Metadata Schema

The metadata file at \`{{outputDirectory}}/plan-metadata.json\` MUST conform to this schema:

**CRITICAL - ALLOWED KEYS ONLY:**
- \`plan-metadata.json\` is NOT a JSON version of the plan.
- It MUST contain ONLY these top-level keys: \`confidence\`, \`openQuestions\`, \`summary\`.
- It MUST be valid JSON parseable by \`JSON.parse()\` (no markdown fences, no comments, no extra text).

**Example plan-metadata.json:**
\`\`\`json
{
  "confidence": 80,
  "openQuestions": [],
  "summary": "Plain text 1–2 paragraph summary."
}
\`\`\`

**Plan Metadata JSON Schema:**

\`\`\`json
${metadataSchema}
\`\`\`

**Important:** 
- When updating metadata, remove the questions that were just answered from \`openQuestions\`
- If new questions arise during revision, add them to \`openQuestions\` with **at least 2 suggested answers** in the \`suggestedAnswers\` array (this is required for the interactive prompt system)
- Suggested answers should be concise, distinct options that cover the main possibilities
- Update \`confidence\` to reflect the current state of the plan
- Keep the \`summary\` concise (max 3000 characters) - do NOT dump the full plan here

**CRITICAL - JSON VALIDATION:**
After writing \`plan-metadata.json\`, you MUST run this validation command:
\`\`\`bash
node -e "JSON.parse(require('fs').readFileSync('{{outputDirectory}}/plan-metadata.json','utf8')); console.log('plan-metadata.json parses')"
\`\`\`
If parsing fails, you MUST fix the file and re-run the validation until it succeeds.

---

## Revision Guidelines

- **Be thorough**: Review the entire plan, not just sections directly related to the questions.
- **Be precise**: Use the exact answers provided - do not reinterpret or modify them.
- **Be consistent**: Ensure the revised plan is internally consistent with the new information.
- **Preserve structure**: Maintain the original plan's organization and formatting.
- **Update comprehensively**: If an answer affects multiple sections, update all relevant sections.
- **Remove ambiguity**: Replace any conditional language or assumptions with concrete decisions based on the answers.

---

## Output Requirements

You MUST update both files:

1. **\`{{outputDirectory}}/plan.md\`** - The revised plan document
2. **\`{{outputDirectory}}/plan-metadata.json\`** - Updated metadata with:
   - Removed answered questions from \`openQuestions\`
   - Added any new questions that surfaced during revision to \`openQuestions\` (each with at least 2 suggested answers)
   - Updated \`confidence\` level if appropriate
   - Must conform to the schema provided above

Ensure both files are valid and properly formatted.`,
    description: 'Template for revising plans with answers to open questions',
    requiredVariables: ['outputDirectory', 'answers', 'qaHistory'],
  };
}

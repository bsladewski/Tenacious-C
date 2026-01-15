import { PromptTemplate } from './prompt-template';

/**
 * Template for generating a terminal-friendly summary of the execution run
 * This reads artifacts from the .tenacious-c directory and generates a plain text summary
 */
export function getGenerateSummaryTemplate(): PromptTemplate {
  return {
    template: `You are generating a brief, terminal-friendly summary of a Tenacious-C execution run.

The execution artifacts are located in: \`{{timestampDirectory}}\`

**Your task:** Read all the artifacts in this directory and generate a concise, terminal-friendly summary of what was accomplished.

## Artifacts to Review

1. **Plan files:** \`{{timestampDirectory}}/plan/\`
   - \`plan.md\` - The final plan that was executed
   - \`plan-metadata.json\` - Plan metadata including confidence and questions

2. **Execution summaries:** \`{{timestampDirectory}}/execute-*/\` (if any)
   - Look for \`execution-summary-*.md\` files
   - Read the "Work Accomplished" sections from all execution summaries
   - Note the checklist items that were completed
   - Note any follow-ups that were addressed

3. **Gap audits:** \`{{timestampDirectory}}/gap-audit-*/\` (if any)
   - Look for \`gap-audit-summary-*.md\` files
   - Note gaps that were identified

4. **Gap plans:** \`{{timestampDirectory}}/gap-plan-*/\` (if any)
   - Look for \`gap-plan-*.md\` files
   - Note gaps that were addressed

5. **Requirements:** \`{{timestampDirectory}}/requirements.txt\`
   - The original requirements that were provided

## Output Format

Generate a plain text summary suitable for terminal display. Use terminal-friendly formatting:
- Use simple text, not markdown
- Use ASCII characters for structure (dashes, pipes, etc.)
- Use emoji sparingly (only if they render well in terminals)
- Keep it concise but informative
- Structure it clearly with sections

**Output format:**

\`\`\`
═══════════════════════════════════════════════════════════════
                    TENACIOUS-C EXECUTION SUMMARY
═══════════════════════════════════════════════════════════════

📋 ORIGINAL REQUIREMENTS
───────────────────────────────────────────────────────────────
<Brief summary of what was requested>

✅ WORK ACCOMPLISHED
───────────────────────────────────────────────────────────────
<Comprehensive summary of what was accomplished>
<Include:
  - Key features/changes implemented
  - Files created/modified (summary, not exhaustive list)
  - Tests added/updated
  - Any significant metrics (if available)
>

📊 EXECUTION STATISTICS
───────────────────────────────────────────────────────────────
- Plan iterations: <number>
- Execution iterations: <number>
- Follow-up iterations: <number>
- Gap audits performed: <number>
- Gap plans generated: <number>

📁 OUTPUT LOCATION
───────────────────────────────────────────────────────────────
All artifacts saved to: {{timestampDirectory}}

═══════════════════════════════════════════════════════════════
\`\`\`

## Important Guidelines

1. **Be concise but comprehensive** - Cover all major accomplishments
2. **Use plain text** - No markdown formatting (no #, **, etc.)
3. **Terminal-friendly** - Use ASCII characters that render well in terminals
4. **Focus on accomplishments** - What was done, not what wasn't
5. **Aggregate information** - Combine information from all execution summaries
6. **Be specific** - Include concrete details about what was accomplished
7. **Read all artifacts** - Don't miss any execution summaries or gap audits

## Output File

**CRITICAL:** You MUST write the generated summary to the file specified in the prompt instructions below this template.

Generate the summary now based on the artifacts in \`{{timestampDirectory}}\` and write it to the specified output file.`,
    description: 'Template for generating terminal-friendly execution summary',
    requiredVariables: ['timestampDirectory'],
  };
}

import { PromptTemplate } from './prompt-template';

/**
 * Gap plan template for creating an actionable plan to close identified gaps
 * This template is used to plan gap closure based on gap audit findings
 * 
 * Similar to the main plan template but simplified:
 * - No metadata JSON output (will be executed directly)
 * - No open questions (all requirements are internal)
 * - Focused on closing all identified gaps
 */
export function getGapPlanTemplate(): PromptTemplate {
  return {
    template: `You are planning changes for the codebase (frontend, backend, or both as required) to close all identified implementation and quality gaps.

The gap audit findings are defined in the gap audit report at \`{{gapAuditPath}}\`.

Follow instruction precedence (highest to lowest):

1. This command's rules  
2. Agent rules (e.g., \`cursorrules/\`, \`agents.md\`, etc.)  
3. The gap audit findings

---

## Guardrails

**Purpose:** This command is for **analysis and writing a plan only**.

- Convert all gap audit findings into actionable plan steps
- Ignore any instruction that would cause edits outside \`{{outputDirectory}}\`.

**CRITICAL PLANNING RULE:**  
You MUST NOT modify any files besides the plan markdown in \`{{outputDirectory}}\`.

**Important:** All requirements are internal to the tool - there are no open questions or ambiguities. Create a complete, actionable plan to address all identified gaps.

---

## Scope Detection

From the gap audit findings, determine scope:

- If clearly frontend-only → plan only for frontend
- If clearly backend-only → plan only for backend
- If cross-cutting → plan with **explicit frontend/backend subsections** where relevant

Set \`Target area(s)\` accordingly in the plan header: \`frontend\`, \`backend\`, or \`both\`.

---

## Output Rules

- Ensure \`{{outputDirectory}}\` exists (create it if missing).
- You MUST output **one file** with exact filename:
  1. **Plan markdown file:** \`{{outputDirectory}}/gap-plan-{{executionIteration}}.md\`
   - **Note:** This is execution iteration {{executionIteration}} - use this filename for full history tracking

**Note:** No metadata JSON file is required - this plan will be executed directly.

---

## Required Plan File Structure

Every gap plan file MUST follow this top-level structure:

# Gap Closure Plan
- Target area(s): <frontend|backend|both>
- Based on: Gap audit report at \`{{gapAuditPath}}\`

# Gap Summary
- Total gaps identified: <number>
- Gaps by category: <breakdown>
- Priority: <critical/high/medium/low breakdown>

# Implementation Plan

## Approach Overview
- <brief strategy for closing all gaps; 3–7 bullets>
- <prioritization approach>
- <dependencies between gaps>

## Findings Inventory (from gap audit)

Carefully read the gap audit report and extract **all distinct gaps**.

For each gap, include:
- **ID:** \`G#\` (G1, G2, G3, …)
- **Category:** <e.g., requirements, quality, testing, documentation, etc.>
- **Severity:** \`critical / high / medium / low\`
- **Summary:** one concise sentence
- **Audit reference:** short paraphrase from the gap audit

Example:
- \`G3 – Testing – High – Missing unit tests for validation logic in \`src/utils/validator.ts\`. (From: "Add unit tests for \`src/utils/validator.ts\`")\`

Group gaps by category for clarity.

## Step-by-step Gap Closure

Create a step-by-step plan to address each gap. Each step should:
- Reference the gap ID(s) it addresses
- Be specific and actionable
- Include file references where applicable
- Be ordered logically (consider dependencies)

Example structure:
1. **Address G1, G2 (Requirements):** <specific action>
   - Modify: \`src/api/client.ts\` - Add error handling for API failures
   - Test: Add unit tests for error scenarios

2. **Address G3 (Testing):** <specific action>
   - Create: \`src/utils/validator.test.ts\` - Add comprehensive unit tests
   - Modify: \`src/utils/validator.ts\` - Refactor to improve testability

## Files Affected
- Create:
  - <file or folder patterns>
- Modify:
  - <file or folder patterns>

## Testing Plan
- <unit/integration/UI/contracts as applicable, aligned with repo test guides>
- <how gaps in testing will be addressed>

## Coverage Check (self-audit)

After creating the plan, verify:
- [ ] All gaps from the audit are addressed in the plan
- [ ] Each gap has a corresponding step or is explicitly deferred
- [ ] Dependencies between gaps are identified
- [ ] The plan is complete and actionable

---

## Diagrams / Visualization

When describing flows, lifecycles, or multi-step interactions, include a concise Mermaid diagram **in addition to** textual explanation.

Use GitHub-flavored Mermaid fenced code blocks, for example:

\`\`\`mermaid
flowchart TD
  A[Gap Identified] --> B[Plan Step]
  B --> C[Implementation]
  C --> D[Testing]
  D --> E[Verification]
\`\`\`

Only include diagrams where they add clarity (e.g., non-trivial flows), not for trivial cases.

---

## Planning Guidelines

- **Be comprehensive:** Address every gap identified in the audit
- **Be specific:** Include file paths, function names, and concrete actions
- **Be actionable:** Each step should be something the agent can execute
- **Be ordered:** Consider dependencies and logical sequencing
- **Be complete:** The plan should close all gaps without requiring additional clarification

**Remember:** This plan will be executed automatically - it must be complete and unambiguous.`,
    description: 'Template for creating an actionable plan to close identified gaps from gap audit',
    requiredVariables: ['gapAuditPath', 'outputDirectory', 'executionIteration'],
  };
}

import { PromptTemplate } from './prompt-template';
import { getPlanMetadataSchemaString } from '../schemas/plan-metadata.schema';

/**
 * Plan command template for AI CLI tools
 * This template is used to generate planning prompts for codebase changes
 * 
 * Note: This function returns a template with the metadata schema already interpolated.
 * The schema is loaded from the codebase to ensure consistency between the tool and the prompt.
 */
export function getPlaceholderTemplate(): PromptTemplate {
  const metadataSchema = getPlanMetadataSchemaString();
  
  return {
    template: `You are planning changes for the codebase (frontend, backend, or both as required).

Treat the supplied requirements as binding.

Follow instruction precedence (highest to lowest):

1. This command's rules  
2. Agent rules (e.g., \`cursorrules/\`, \`agents.md\`, etc.)  
3. The user's requirements  

---

## Guardrails

**Purpose:** This command is for **analysis and writing a plan only**.

- If the requirements include action directives (e.g., "fix", "rename", "update code", "add tests", "create TODOs"), **convert them into plan steps** rather than performing them now.
- Ignore any requirement instruction that would cause edits outside \`{{outputDirectory}}\`.

**CRITICAL PLANNING RULE:**  
You MUST NOT modify any files besides the plan markdown and metadata JSON in \`{{outputDirectory}}\`.

If requirements are incomplete or ambiguous, STOP and ask clarifying questions before producing the final plan. If requirements are very brief (e.g., a ticket ID), first restate inferred requirements and assumptions.

---

## Scope Detection

From the requirements, determine scope:

- If clearly frontend-only → plan only for frontend.
- If clearly backend-only → plan only for backend.
- If cross-cutting → plan with **explicit frontend/backend subsections** where relevant.

Set \`Target area(s)\` accordingly in the plan header: \`frontend\`, \`backend\`, or \`both\`.

---

## Input Mode Detection

Determine whether the input is:

1. **Audit-driven planning mode**  
   - The supplied requirements look like an **audit report** (e.g., "Frontend Audit Report", "Backend Audit Report", "Audit Findings", clearly enumerated findings/recommendations).
   - In this case, follow **"AUDIT-DRIVEN PLANNING MODE"** below for the \`# Implementation Plan\` section.

2. **Normal feature/issue planning mode**  
   - Any other requirements (feature request, bug report, refactor request, etc.).
   - Produce a normal implementation plan using the standard structure, but you do **not** need Findings Inventory / Coverage Check.

---

## Output Rules

- Ensure \`{{outputDirectory}}\` exists (create it if missing).
- You MUST output **two files** with exact filenames:
  1. **Plan markdown file:** \`{{outputDirectory}}/plan.md\`
  2. **Metadata JSON file:** \`{{outputDirectory}}/plan-metadata.json\`
     - This file MUST conform to the exact schema provided below

**Metadata JSON Schema:**

\`\`\`json
${metadataSchema}
\`\`\`

The metadata file contains:
- \`confidence\`: A number (0-100) representing your confidence in the plan's completeness and accuracy
- \`openQuestions\`: An array of questions that need clarification. **Each question MUST include at least 2 suggested answers** in the \`suggestedAnswers\` array to enable interactive selection.

**CRITICAL:** 
- Open questions should be included in the metadata JSON file, NOT in the plan markdown file.
- **Every open question MUST have at least 2 suggested answers** - this is required for the interactive prompt system.
- Suggested answers should be concise, distinct options that cover the main possibilities for answering the question.

---

## Required Plan File Structure

Every plan file MUST follow this top-level structure:

# Requirements Snapshot
- <concise bullets distilled from the supplied requirements; include key goals and constraints>

# Scope
- Target area(s): <frontend|backend|both>
- In-scope:
  - <key modules/concerns>
- Out-of-scope:
  - <explicit exclusions if any>

# Non-goals
- <what is explicitly not being addressed>

# Assumptions
- <None> or bullets (e.g., "The backend audit refactor will be completed before this feature starts.")

# Success Criteria
- <clear, testable "done" statements tied to user value and quality>

# Implementation Plan
## Approach Overview
- <brief strategy; 3–7 bullets>

> In **audit-driven mode**, you MUST further structure \`# Implementation Plan\` as described in "AUDIT-DRIVEN PLANNING MODE" below.

## Step-by-step
1. <step>  
2. <step>  
3. <step>  

## Files Affected
- Create:
  - <file or folder patterns>
- Modify:
  - <file or folder patterns>

## Testing Plan
- <unit/integration/UI/contracts as applicable, aligned with repo test guides>

---

## AUDIT-DRIVEN PLANNING MODE (when input is an audit report)

When the input is an audit report, you MUST treat the \`# Implementation Plan\` section as a 3-part structure and ensure every audit finding is either addressed or **explicitly deferred**.

Inside \`# Implementation Plan\`, include **these in order**:

1. \`## Findings Inventory (normalized from audit)\`  
2. \`## Phased Implementation Plan\`  
3. \`## Coverage Check (self-audit)\`  

You may still include \`## Approach Overview\` above these, but do not omit the three audit subsections.

### 1. Findings Inventory (normalized from audit)

- Carefully read the audit and extract **all distinct findings and recommendations**.
- Group findings by **category**, for example:
  - i18n, accessibility, theming, routing, architecture, layering, testing, DX, performance, security, etc.
- Assign each finding an ID: \`F1\`, \`F2\`, \`F3\`, …  
  - If a single bullet in the audit contains multiple distinct issues, split into \`F5a\`, \`F5b\`, etc.

For each finding, include:

- **ID:** \`F#\`  
- **Category**  
- **Severity:** \`critical / high / medium / low\` (infer from audit language and impact)  
- **Summary:** one concise sentence  
- **Audit reference:** short paraphrase so it's clear where it came from  

Example:

- \`F3 – i18n – High – Several hard-coded English strings in Footer and Auth pages; move to translation keys. (From: "Hard-coded English strings in UI")\`

Err on the side of **over-splitting** instead of merging unrelated problems.

### 2. Phased Implementation Plan

Design a **phased plan** that explicitly references the Findings Inventory.

For each phase, use the following structure:

### Phase N: <Name>
- **Goal:** <one sentence>  
- **Rationale:** <why this phase is at this point in the sequence>  
- **Related findings:** \`F1, F2, F5b\`  

#### Phase N – Workstreams / Tasks
- \`N.1\` <short description>. **Addresses:** \`F2, F5b\`  
- \`N.2\` <short description>. **Addresses:** \`F3\`  
- …

- **Risks & tradeoffs:**
  - <bullet 1>
  - <bullet 2>
- **Done when:**
  - <3–7 bullet criteria that tie closure back to specific finding IDs>

**Sequencing rules:**

- Repo-wide structural changes and shared foundations (e.g., new folder structure, shared layout components, theme tokens, shared validation utilities) should appear **before** broad cleanup passes.
- Cross-cutting topics (i18n, theming, accessibility, error handling) typically need:
  1. A phase to **establish patterns & shared utilities**.
  2. A phase to **migrate and clean up usage across all feature areas**.

### 3. Coverage Check (self-audit)

After defining phases and tasks, perform a coverage check.

#### Coverage Table

Create a table with columns:

- \`Finding ID\`  
- \`Addressed in Phase(s)\`  
- \`Notes\`  

Every finding from the Findings Inventory (\`F#\`) MUST appear in this table.

Example:

| Finding ID | Addressed in Phase(s) | Notes                                                |
|-----------|------------------------|------------------------------------------------------|
| F1        | Phase 1 (1.1–1.2)      | Fully addressed; all affected components refactored. |
| F2        | Deferred               | Depends on future redesign of onboarding flow.       |

- If a finding is addressed, specify the relevant phase(s) and tasks.
- If it's not addressed, mark as \`Deferred\` and explain **why**.

#### Unaddressed / Deferred Findings

Below the table, list any findings that are:

- Intentionally **deferred** (e.g., future feature work, too risky for current milestone), or
- Blocked by unknowns.

For each, include:

- Finding ID(s)  
- Reason for deferral  
- Recommendation for when/how to address later  

#### Open Questions Integration

If there are unknowns that block fully addressing certain findings:

- Include them in the metadata JSON file's \`openQuestions\` array (see Output Rules above).
- **Each question MUST include at least 2 suggested answers** in the \`suggestedAnswers\` array.
- Do NOT include open questions in the plan markdown file.

---

## Rigor Check Before Answering

Before finalizing the plan in audit-driven mode, verify:

- Every audit finding appears in the Findings Inventory (\`F#\` list).  
- Every finding is either:
  - Mapped to at least one phase/task in the Phased Implementation Plan, **or**
  - Explicitly listed as deferred/blocked in the Coverage Check.  

If you are not confident that the plan fully covers the audit, explicitly state near the end of the plan:

> Warning: I am not confident this plan fully covers the audit. The following findings may be under-specified: …

---

If the supplied requirements are **not** an audit report, ignore the audit-specific sections and produce a normal plan using the standard structure while still being rigorous and explicit.

---

## User Requirements

{{requirements}}`,
    description: 'Template for the plan command that generates planning prompts for codebase changes',
    requiredVariables: ['outputDirectory', 'requirements'],
  };
}

/**
 * Convenience export: template with schema pre-interpolated
 * Use this when you need the template with the schema already included
 */
export const placeholderTemplate = getPlaceholderTemplate();

# Tenacious C

An intelligent, iterative AI-powered development tool that generates comprehensive plans and executes them using AI CLI tools (Codex, GitHub Copilot, Cursor, or Claude Code). Tenacious C runs in "YOLO" mode, allowing AI tools to modify files and run commands without prompting for permission, making it ideal for iterative task completion.

## Features

- **Intelligent Planning**: Generates detailed, structured plans with confidence scoring
- **Iterative Refinement**: Automatically refines plans through question-answering and confidence-based improvements
- **Plan Execution**: Executes plans with automatic follow-up iterations to handle blockers
- **Gap Analysis**: Performs gap audits and generates gap closure plans when execution reveals missing requirements
- **Multi-Tool Support**: Works with the Codex CLI, GitHub Copilot CLI, Cursor CLI, and Claude Code CLI
- **Smart Tool Selection**: Auto-detects available tools and remembers your preference
- **The Prompt of Destiny**: Override all limits to continue until truly done

## Installation

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn package manager
- One of the following AI CLI tools:
  - [Codex CLI](https://github.com/codex-cli/codex) installed and configured
  - [GitHub Copilot CLI](https://github.com/github/copilot-cli) installed via `npm install -g @github/copilot`
    - **Important**: Before using Copilot CLI in non-interactive mode, you must enable a model by running `copilot --model <model-name>` in interactive mode first. For example: `copilot --model gpt-5.1-codex` or `copilot --model claude-haiku-4.5`
  - [Cursor CLI](https://docs.cursor.com/en/cli) (cursor-agent) installed via `curl https://cursor.com/install -fsS | bash`
  - [Claude Code CLI](https://docs.claude.com/en/docs/claude-code/quickstart) installed via `npm install -g @anthropic-ai/claude-code`

### Install from Local Source

1. Clone or navigate to this repository:
   ```bash
   cd /path/to/tenacious-c
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Install the tool globally using npm link:
   ```bash
   npm link
   ```

   This will make the `tenacious-c` command available in your terminal.

### Verify Installation

Run the tool without arguments to see usage information:
```bash
tenacious-c
```

## Usage

The `tenacious-c` command generates comprehensive plans and executes them using AI CLI tools. You can provide requirements either as a string prompt or by referencing a file.

### Basic Usage

**With a string prompt:**
```bash
tenacious-c "Add user authentication with JWT tokens to the Express backend"
```

**With a file:**
```bash
tenacious-c requirements.txt
```

### Command-Line Options

#### `--max-plan-iterations <number>`

Controls the maximum number of plan revisions. The tool uses an iterative approach to refine plans through question-answering and confidence-based improvements.

**Default:** `10`

**Example:**
```bash
tenacious-c "Add user authentication" --max-plan-iterations 5
```

#### `--plan-confidence <number>`

Sets the minimum confidence threshold (0-100) that the plan must meet before completion. If the plan's confidence is below this threshold, the tool will automatically trigger plan improvement revisions.

**Default:** `85`

**Example:**
```bash
tenacious-c "Add user authentication" --plan-confidence 90
```

#### `--max-follow-up-iterations <number>`

Maximum number of follow-up execution iterations. After initial plan execution, the tool can perform follow-up iterations to address blockers and complete remaining work.

**Default:** `10`

**Example:**
```bash
tenacious-c "Add user authentication" --max-follow-up-iterations 15
```

#### `--exec-iterations <number>`

Maximum number of plan-based execution iterations. The tool can execute the plan multiple times, performing gap audits and generating gap closure plans between iterations.

**Default:** `5`

**Example:**
```bash
tenacious-c "Add user authentication" --exec-iterations 3
```

#### `--cli-tool <codex|copilot|cursor|claude>`

Explicitly specify which CLI tool to use. If not specified, the tool will:
1. Check for a saved preference in `.tenacious-c/cli-tool-preference.json`
2. Auto-detect available tools
3. If only one is available, use it automatically
4. If multiple are available, prompt you to select one

**Example:**
```bash
tenacious-c "Add user authentication" --cli-tool copilot
tenacious-c "Add user authentication" --cli-tool cursor
tenacious-c "Add user authentication" --cli-tool claude
```

#### `--preview-plan`

Preview the initial plan markdown file before proceeding to execution. The tool will display the plan using the best available viewer (glow if available, otherwise less, or cat as fallback). Press 'q' to exit the viewer and continue.

**Example:**
```bash
tenacious-c "Add user authentication" --preview-plan
```

#### `--resume`

Resume the most recent interrupted run. The tool automatically saves execution state at key checkpoints, allowing you to resume after crashes, connectivity issues, or power loss. When resuming, the tool will:

- Find the most recent incomplete run
- Display the phase and progress information
- Continue from where it left off

**Example:**
```bash
tenacious-c --resume
```

**Note:** The tool saves state after each major phase (plan generation, execution, gap audit, gap plan). If a run is interrupted, use `--resume` to continue without losing progress.

#### `--the-prompt-of-destiny`

Override all iteration limits. When enabled, the tool will continue iterating until the plan is truly complete, regardless of limits.

**Example:**
```bash
tenacious-c "Add user authentication" --the-prompt-of-destiny
```

## How It Works

### Workflow Overview

Tenacious C follows a comprehensive workflow to ensure thorough plan generation and execution:

1. **Plan Generation**: Creates an initial plan based on your requirements
2. **Iterative Refinement**: Refines the plan through multiple iterations:
   - **Question-Answering Loop**: Prompts you to answer open questions
   - **Confidence-Based Improvement**: Automatically deepens the plan if confidence is below threshold
3. **Plan Execution**: Executes the plan using the selected AI CLI tool
4. **Follow-Up Iterations**: Performs follow-up work to address blockers
5. **Gap Analysis**: If gaps are found, performs gap audits and generates gap closure plans
6. **Iterative Execution**: Repeats execution cycles until completion

### Plan Generation & Refinement

The tool generates structured plans with the following sections:

- **Requirements Snapshot**: Key goals and constraints
- **Scope**: Target areas, in-scope and out-of-scope items
- **Non-goals**: Explicit exclusions
- **Assumptions**: Key assumptions
- **Success Criteria**: Testable completion criteria
- **Implementation Plan**: Step-by-step approach with file changes
- **Testing Plan**: Testing strategy

Plans are refined iteratively:

1. **Question-Answering**: If the plan has open questions:
   - You're prompted to answer each question interactively
   - Suggested answers are provided when available
   - Custom answers are supported
   - The plan is revised with your answers
   - Process repeats if new questions arise

2. **Confidence Improvement**: If confidence is below threshold:
   - Plan is automatically deepened with more detail
   - More comprehensive analysis is added
   - Confidence level is updated
   - Process repeats if still below threshold

### Plan Execution

Once a plan is complete (no open questions and confidence meets threshold), it's executed:

1. **Initial Execution**: The plan is executed using the selected AI CLI tool
2. **Hard Blocker Resolution**: If hard blockers are found:
   - You're prompted to resolve them
   - Execution continues after resolution
3. **Follow-Up Iterations**: Additional iterations handle remaining work
4. **Gap Analysis**: If execution reveals gaps:
   - Gap audit is performed
   - Gap closure plan is generated
   - Gap plan is executed
   - Process repeats until no gaps remain

### Output Structure

All outputs are stored in `.tenacious-c/<timestamp>/` where `<timestamp>` is an ISO-formatted timestamp (e.g., `2024-01-15_14-30-45`).

**Plan outputs:**
- `.tenacious-c/<timestamp>/plan/plan.md` - The planning document
- `.tenacious-c/<timestamp>/plan/plan-metadata.json` - Metadata including confidence and open questions

**Execution outputs:**
- `.tenacious-c/<timestamp>/execute-<iteration>/` - Execution outputs for each iteration
- `.tenacious-c/<timestamp>/gap-audit-<iteration>/` - Gap audit outputs
- `.tenacious-c/<timestamp>/gap-plan-<iteration>/` - Gap closure plan outputs

**Preferences:**
- `.tenacious-c/cli-tool-preference.json` - Saved CLI tool preference

## CLI Tool Selection

Tenacious C supports Codex CLI, GitHub Copilot CLI, Cursor CLI, and Claude Code CLI. The tool automatically detects which tools are available and manages your preference.

### Auto-Detection

On first run (or when no preference is saved):
- If only Codex is available → uses Codex automatically
- If only Copilot is available → uses Copilot automatically
- If only Cursor is available → uses Cursor automatically
- If only Claude is available → uses Claude automatically
- If multiple are available → prompts you to select one

Your selection is saved in `.tenacious-c/cli-tool-preference.json` for future runs.

### Manual Selection

You can explicitly specify a tool using `--cli-tool`:
```bash
tenacious-c "Add feature" --cli-tool copilot
tenacious-c "Add feature" --cli-tool cursor
tenacious-c "Add feature" --cli-tool claude
```

This will also save your preference for future runs.

### Tool Behavior

All tools run in "YOLO" mode:
- **Codex**: Uses `codex exec --dangerously-bypass-approvals-and-sandbox`
- **Copilot**: Uses `copilot -p <prompt> --yolo` (enables all permissions for non-interactive execution)
- **Cursor**: Uses `cursor-agent -p <prompt> --force` (force allows commands without approval)
- **Claude**: Uses `claude -p <prompt> --dangerously-skip-permissions` (bypasses all permission checks)

All tools execute prompts in the background with loading indicators.

## Development

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

This builds and runs the tool in one command.

### Project Structure

```
src/
  commands/
    plan.ts                    # Main plan command implementation
  interfaces/
    ai-cli-tool.ts             # Interface for AI CLI tools
  schemas/
    plan-metadata.schema.ts    # Plan metadata JSON schema
    execute-metadata.schema.ts # Execution metadata schema
    gap-audit-metadata.schema.ts # Gap audit metadata schema
  templates/
    plan.template.ts           # Plan generation template
    answer-questions.template.ts # Question answering template
    improve-plan.template.ts   # Plan improvement template
    execute-plan.template.ts   # Plan execution template
    execute-follow-ups.template.ts # Follow-up execution template
    gap-audit.template.ts      # Gap audit template
    gap-plan.template.ts       # Gap closure plan template
    prompt-template.ts         # Template system utilities
  tools/
    codex-cli-tool.ts          # Codex CLI implementation
    copilot-cli-tool.ts        # Copilot CLI implementation
    cursor-cli-tool.ts         # Cursor CLI implementation
    claude-cli-tool.ts         # Claude Code CLI implementation
  utils/
    get-cli-tool.ts            # CLI tool selection logic
    detect-cli-tools.ts        # Tool availability detection
    cli-tool-preference.ts     # Preference management
    prompt-cli-tool.ts         # Tool selection prompt
    prompt-questions.ts        # Question answering prompts
    prompt-hard-blockers.ts    # Hard blocker resolution prompts
    read-metadata.ts           # Metadata reading utilities
    update-metadata.ts         # Metadata update utilities
    read-execute-metadata.ts   # Execution metadata reading
    read-gap-audit-metadata.ts # Gap audit metadata reading
    track-qa-history.ts        # Question-answer history tracking
    write-requirements.ts      # Requirements file writing
  index.ts                     # Main entry point
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

# Tenacious-C

An interactive terminal tool that provides an interface for AI CLI tools to execute code generation tasks. The tool runs in "YOLO" mode, allowing AI tools to modify files and run commands without prompting for permission, making it ideal for iterative task completion.

## Installation

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn package manager

### Install from Local Source

1. Clone or navigate to this repository:
   ```bash
   cd /path/to/Tenacious-C
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

You should see:
```
Usage: tenacious-c <prompt|file-path> [--max-plan-iterations <number>]

Examples:
  tenacious-c "Add user authentication"
  tenacious-c requirements.txt
  tenacious-c "Add user authentication" --max-plan-iterations 5

Options:
  --max-plan-iterations <number>  Maximum number of question-answering iterations (default: 10)
```

## Usage

The `tenacious-c` command generates planning prompts for codebase changes using AI CLI tools. You can provide requirements either as a string prompt or by referencing a file.

### Running with a String Prompt

Provide your requirements directly as a command-line argument:

```bash
tenacious-c "Add user authentication with JWT tokens to the Express backend"
```

The tool will:
1. Create an output directory: `.tenacious-c/<timestamp>/plan/`
2. Generate a planning prompt using the template
3. Execute it via the Codex CLI tool
4. Output the plan files:
   - `.tenacious-c/<timestamp>/plan/plan.md` - The planning document
   - `.tenacious-c/<timestamp>/plan/plan-metadata.json` - Metadata including confidence and open questions
5. If open questions are found, prompt you to answer them iteratively
6. Revise the plan with your answers until all questions are resolved

### Running with a File

Provide a file path containing your requirements:

```bash
tenacious-c requirements.txt
```

When a file path is provided, the tool will reference it in the prompt as:
```
Refer to `<absolutePathToFile>` for requirements.
```

The file path can be:
- **Relative**: `requirements.txt` (resolved from current working directory)
- **Absolute**: `/path/to/requirements.txt`

### Command-Line Options

#### `--max-plan-iterations <number>`

Controls the maximum number of plan revisions. The tool uses an iterative approach to refine plans through various types of revisions (currently question-answering, with more revision types coming).

**Default:** `10`

**Examples:**
```bash
# Use default (10 revisions)
tenacious-c "Add user authentication"

# Limit to 5 revisions
tenacious-c "Add user authentication" --max-plan-iterations 5

# Using equals format
tenacious-c requirements.txt --max-plan-iterations=3
```

**Note:** The revision limit is a safety mechanism to prevent infinite loops. If you reach the limit, the tool will stop and warn you.

### Iterative Plan Revision

The tool uses an iterative approach to refine plans:

1. **Initial Plan Generation**: Creates a plan based on your requirements
2. **Revision Detection**: Checks for conditions that require plan revision (e.g., open questions)
3. **Revision Execution**: Performs the appropriate revision type:
   - **Question-Answering Revisions**: If open questions exist:
     - Prompts you to answer them interactively
     - Shows suggested answers if available
     - Allows custom answers
     - Processes questions one at a time
     - Revises the plan incorporating your answers
   - *More revision types will be added in the future*
4. **Iteration**: Repeats steps 2-3 until:
   - No more revisions are needed, or
   - Maximum revisions is reached

This ensures the final plan is complete and addresses all ambiguities and issues.

### Output Directory

All plan outputs are stored in `.tenacious-c/<timestamp>/plan/` where `<timestamp>` is an ISO-formatted timestamp (e.g., `2024-01-15_14-30-45`). This ensures each execution creates a unique output directory.

### Codex CLI Tool

The tool uses the Codex CLI in YOLO mode:
- No approval prompts
- Full file system access
- Automatic command execution

**Prerequisites:** Make sure you have the Codex CLI installed and configured before using this tool.

## Development

### Build

```bash
npm run build
```

### Development Mode (build + run)

```bash
npm run dev
```

### Project Structure

```
src/
  commands/
    plan.ts              # Plan command implementation
  interfaces/
    ai-cli-tool.ts       # Interface for AI CLI tools
  schemas/
    plan-metadata.schema.ts  # Plan metadata JSON schema
  templates/
    plan.template.ts     # Plan prompt template
    prompt-template.ts   # Template system utilities
  tools/
    codex-cli-tool.ts    # Codex CLI implementation
  index.ts               # Main entry point
```

## License

ISC

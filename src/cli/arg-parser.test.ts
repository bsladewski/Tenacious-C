/**
 * Tests for CLI Argument Parser
 */

import { describe, it, expect } from 'vitest';
import { parseArgs } from './arg-parser';

describe('parseArgs', () => {
  describe('basic functionality', () => {
    it('should parse a simple prompt', () => {
      const result = parseArgs(['node', 'script.js', 'Add user authentication']);
      expect(result.success).toBe(true);
      expect(result.args?.input).toBe('Add user authentication');
    });

    it('should parse multi-word prompts', () => {
      const result = parseArgs(['node', 'script.js', 'Add', 'user', 'authentication']);
      expect(result.success).toBe(true);
      expect(result.args?.input).toBe('Add user authentication');
    });

    it('should set help flag with --help', () => {
      const result = parseArgs(['node', 'script.js', '--help']);
      expect(result.success).toBe(true);
      expect(result.args?.help).toBe(true);
    });

    it('should set help flag with -h', () => {
      const result = parseArgs(['node', 'script.js', '-h']);
      expect(result.success).toBe(true);
      expect(result.args?.help).toBe(true);
    });

    it('should set version flag with --version', () => {
      const result = parseArgs(['node', 'script.js', '--version']);
      expect(result.success).toBe(true);
      expect(result.args?.version).toBe(true);
    });

    it('should set version flag with -v', () => {
      const result = parseArgs(['node', 'script.js', '-v']);
      expect(result.success).toBe(true);
      expect(result.args?.version).toBe(true);
    });
  });

  describe('numeric options', () => {
    it('should parse --max-plan-iterations with space', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--max-plan-iterations', '5']);
      expect(result.success).toBe(true);
      expect(result.args?.maxPlanIterations).toBe(5);
    });

    it('should parse --max-plan-iterations with equals', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--max-plan-iterations=5']);
      expect(result.success).toBe(true);
      expect(result.args?.maxPlanIterations).toBe(5);
    });

    it('should reject invalid --max-plan-iterations', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--max-plan-iterations', 'abc']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
    });

    it('should reject negative --max-plan-iterations', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--max-plan-iterations', '-1']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('positive integer');
    });

    it('should parse --plan-confidence', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--plan-confidence', '90']);
      expect(result.success).toBe(true);
      expect(result.args?.planConfidence).toBe(90);
    });

    it('should reject --plan-confidence over 100', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--plan-confidence', '150']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('between 0 and 100');
    });

    it('should reject negative --plan-confidence', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--plan-confidence', '-10']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('between 0 and 100');
    });

    it('should parse --max-follow-up-iterations', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--max-follow-up-iterations', '15']);
      expect(result.success).toBe(true);
      expect(result.args?.maxFollowUpIterations).toBe(15);
    });

    it('should parse --exec-iterations', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--exec-iterations', '3']);
      expect(result.success).toBe(true);
      expect(result.args?.execIterations).toBe(3);
    });
  });

  describe('CLI tool options', () => {
    it('should parse --cli-tool', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--cli-tool', 'cursor']);
      expect(result.success).toBe(true);
      expect(result.args?.cliTool).toBe('cursor');
    });

    it('should reject invalid --cli-tool', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--cli-tool', 'invalid']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    it('should parse --plan-cli-tool', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--plan-cli-tool', 'codex']);
      expect(result.success).toBe(true);
      expect(result.args?.planCliTool).toBe('codex');
    });

    it('should parse --execute-cli-tool', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--execute-cli-tool', 'claude']);
      expect(result.success).toBe(true);
      expect(result.args?.executeCliTool).toBe('claude');
    });

    it('should parse --audit-cli-tool', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--audit-cli-tool', 'copilot']);
      expect(result.success).toBe(true);
      expect(result.args?.auditCliTool).toBe('copilot');
    });

    it('should parse --fallback-cli-tools', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--fallback-cli-tools', 'codex,cursor,claude']);
      expect(result.success).toBe(true);
      expect(result.args?.fallbackCliTools).toEqual(['codex', 'cursor', 'claude']);
    });

    it('should reject invalid tool in --fallback-cli-tools', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--fallback-cli-tools', 'codex,invalid,claude']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid fallback tool');
    });
  });

  describe('model options', () => {
    it('should parse --plan-model', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--plan-model', 'gpt-4']);
      expect(result.success).toBe(true);
      expect(result.args?.planModel).toBe('gpt-4');
    });

    it('should parse --execute-model', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--execute-model', 'claude-3']);
      expect(result.success).toBe(true);
      expect(result.args?.executeModel).toBe('claude-3');
    });

    it('should parse --audit-model', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--audit-model', 'gpt-5']);
      expect(result.success).toBe(true);
      expect(result.args?.auditModel).toBe('gpt-5');
    });
  });

  describe('boolean flags', () => {
    it('should parse --preview-plan', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--preview-plan']);
      expect(result.success).toBe(true);
      expect(result.args?.previewPlan).toBe(true);
    });

    it('should parse --resume', () => {
      const result = parseArgs(['node', 'script.js', '--resume']);
      expect(result.success).toBe(true);
      expect(result.args?.resume).toBe(true);
    });

    it('should parse --the-prompt-of-destiny', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--the-prompt-of-destiny']);
      expect(result.success).toBe(true);
      expect(result.args?.thePromptOfDestiny).toBe(true);
      expect(result.args?.maxPlanIterations).toBe(Number.MAX_SAFE_INTEGER);
      expect(result.args?.maxFollowUpIterations).toBe(Number.MAX_SAFE_INTEGER);
      expect(result.args?.execIterations).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should parse --mock', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--mock']);
      expect(result.success).toBe(true);
      expect(result.args?.mockMode).toBe(true);
      expect(result.args?.cliTool).toBe('mock');
    });

    it('should parse --no-interactive', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--no-interactive']);
      expect(result.success).toBe(true);
      expect(result.args?.noInteractive).toBe(true);
    });

    it('should parse --verbose', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--verbose']);
      expect(result.success).toBe(true);
      expect(result.args?.verbose).toBe(true);
    });

    it('should parse --debug', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--debug']);
      expect(result.success).toBe(true);
      expect(result.args?.debug).toBe(true);
    });

    it('should parse --json', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--json']);
      expect(result.success).toBe(true);
      expect(result.args?.jsonOutput).toBe(true);
    });

    it('should parse --plan-only', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--plan-only']);
      expect(result.success).toBe(true);
      expect(result.args?.planOnly).toBe(true);
    });

    it('should combine --plan-only with other flags', () => {
      const result = parseArgs([
        'node', 'script.js', 'prompt',
        '--plan-only',
        '--plan-confidence', '95',
        '--max-plan-iterations', '5'
      ]);
      expect(result.success).toBe(true);
      expect(result.args?.planOnly).toBe(true);
      expect(result.args?.planConfidence).toBe(95);
      expect(result.args?.maxPlanIterations).toBe(5);
    });

    it('should parse combined verbosity flags', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--verbose', '--debug', '--json']);
      expect(result.success).toBe(true);
      expect(result.args?.verbose).toBe(true);
      expect(result.args?.debug).toBe(true);
      expect(result.args?.jsonOutput).toBe(true);
    });
  });

  describe('mock config', () => {
    it('should parse --mock-config with space', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--mock-config', '{"test": true}']);
      expect(result.success).toBe(true);
      expect(result.args?.mockConfigPath).toBe('{"test": true}');
    });

    it('should parse --mock-config with equals', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--mock-config=/path/to/config.json']);
      expect(result.success).toBe(true);
      expect(result.args?.mockConfigPath).toBe('/path/to/config.json');
    });
  });

  describe('error handling', () => {
    it('should reject unknown options', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--unknown-option']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown option');
    });

    it('should require value for --max-plan-iterations', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--max-plan-iterations']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires a value');
    });

    it('should handle missing value when followed by another flag', () => {
      const result = parseArgs(['node', 'script.js', 'prompt', '--max-plan-iterations', '--preview-plan']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires a value');
    });
  });

  describe('default values', () => {
    it('should use default values for unprovided options', () => {
      const result = parseArgs(['node', 'script.js', 'test prompt']);
      expect(result.success).toBe(true);
      expect(result.args?.maxPlanIterations).toBe(10);
      expect(result.args?.planConfidence).toBe(85);
      expect(result.args?.maxFollowUpIterations).toBe(10);
      expect(result.args?.execIterations).toBe(5);
      expect(result.args?.thePromptOfDestiny).toBe(false);
      expect(result.args?.cliTool).toBe(null);
      expect(result.args?.previewPlan).toBe(false);
      expect(result.args?.resume).toBe(false);
      expect(result.args?.mockMode).toBe(false);
      expect(result.args?.fallbackCliTools).toEqual([]);
      expect(result.args?.noInteractive).toBe(false);
      expect(result.args?.verbose).toBe(false);
      expect(result.args?.debug).toBe(false);
      expect(result.args?.jsonOutput).toBe(false);
      expect(result.args?.planOnly).toBe(false);
    });
  });

  describe('complex scenarios', () => {
    it('should parse multiple options together', () => {
      const result = parseArgs([
        'node', 'script.js',
        'Add authentication',
        '--max-plan-iterations', '5',
        '--plan-confidence', '90',
        '--cli-tool', 'cursor',
        '--preview-plan'
      ]);
      expect(result.success).toBe(true);
      expect(result.args?.input).toBe('Add authentication');
      expect(result.args?.maxPlanIterations).toBe(5);
      expect(result.args?.planConfidence).toBe(90);
      expect(result.args?.cliTool).toBe('cursor');
      expect(result.args?.previewPlan).toBe(true);
    });

    it('should handle options in any order', () => {
      const result = parseArgs([
        'node', 'script.js',
        '--cli-tool', 'claude',
        'Add user auth',
        '--max-plan-iterations=3'
      ]);
      expect(result.success).toBe(true);
      expect(result.args?.input).toBe('Add user auth');
      expect(result.args?.cliTool).toBe('claude');
      expect(result.args?.maxPlanIterations).toBe(3);
    });
  });
});

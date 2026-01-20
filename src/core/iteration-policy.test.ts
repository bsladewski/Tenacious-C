/**
 * Tests for Iteration Policies
 */

import { describe, it, expect } from 'vitest';
import {
  checkPlanRevisionStopCondition,
  checkFollowUpStopCondition,
  checkExecutionIterationStopCondition,
  getPlanRevisionProgress,
  getFollowUpProgress,
  getExecutionIterationProgress,
  formatLimit,
  getRemainingIterations,
} from './iteration-policy';
import { EffectiveConfig, DEFAULT_CONFIG } from '../types/effective-config';

function createTestConfig(overrides: Partial<EffectiveConfig> = {}): EffectiveConfig {
  return {
    schemaVersion: '1.0.0',
    input: 'test',
    runId: 'test-run',
    resolvedAt: new Date().toISOString(),
    limits: {
      ...DEFAULT_CONFIG.limits,
      ...(overrides.limits || {}),
    },
    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...(overrides.thresholds || {}),
    },
    tools: DEFAULT_CONFIG.tools,
    models: DEFAULT_CONFIG.models,
    verbosity: DEFAULT_CONFIG.verbosity,
    interactivity: DEFAULT_CONFIG.interactivity,
    runMode: {
      ...DEFAULT_CONFIG.runMode,
      ...(overrides.runMode || {}),
    },
    fallback: DEFAULT_CONFIG.fallback,
    paths: {
      workingDirectory: '/test',
      artifactBaseDir: '/test/.tenacious-c',
    },
    ...(overrides as Partial<EffectiveConfig>),
  };
}

describe('checkPlanRevisionStopCondition', () => {
  describe('when confidence threshold is met', () => {
    it('should stop if confidence is above threshold and no open questions', () => {
      const config = createTestConfig();
      const result = checkPlanRevisionStopCondition(config, 1, false, 90);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('CONDITION_MET');
      expect(result.message).toContain('90%');
    });

    it('should NOT stop if there are open questions even if confidence is met', () => {
      const config = createTestConfig();
      const result = checkPlanRevisionStopCondition(config, 1, true, 90);
      expect(result.shouldStop).toBe(false);
    });

    it('should stop if confidence equals threshold exactly', () => {
      const config = createTestConfig({ thresholds: { planConfidence: 85 } });
      const result = checkPlanRevisionStopCondition(config, 1, false, 85);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('CONDITION_MET');
    });
  });

  describe('when limit is reached', () => {
    it('should stop if revision count reaches max', () => {
      const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxPlanIterations: 5 } });
      const result = checkPlanRevisionStopCondition(config, 5, false, 70);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('LIMIT_REACHED');
      expect(result.nextSteps).toBeDefined();
      expect(result.nextSteps!.length).toBeGreaterThan(0);
    });

    it('should include relevant next steps when limit reached with open questions', () => {
      const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxPlanIterations: 3 } });
      const result = checkPlanRevisionStopCondition(config, 3, true, 70);
      expect(result.shouldStop).toBe(true);
      expect(result.nextSteps).toContain('Answer the remaining open questions manually or resume with --resume');
    });

    it('should include confidence-related next steps when limit reached with low confidence', () => {
      const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxPlanIterations: 3 } });
      const result = checkPlanRevisionStopCondition(config, 3, false, 70);
      expect(result.nextSteps).toBeDefined();
      expect(result.nextSteps!.some(s => s.includes('confidence'))).toBe(true);
    });
  });

  describe('unlimited mode', () => {
    it('should NOT stop due to limit in unlimited mode', () => {
      const config = createTestConfig({
        runMode: { ...DEFAULT_CONFIG.runMode, unlimitedIterations: true },
        limits: { ...DEFAULT_CONFIG.limits, maxPlanIterations: 5 },
      });
      const result = checkPlanRevisionStopCondition(config, 100, true, 50);
      expect(result.shouldStop).toBe(false);
    });

    it('should still stop when confidence met in unlimited mode', () => {
      const config = createTestConfig({
        runMode: { ...DEFAULT_CONFIG.runMode, unlimitedIterations: true },
      });
      const result = checkPlanRevisionStopCondition(config, 100, false, 90);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('CONDITION_MET');
    });
  });

  describe('continue conditions', () => {
    it('should continue if open questions remain', () => {
      const config = createTestConfig();
      const result = checkPlanRevisionStopCondition(config, 1, true, 90);
      expect(result.shouldStop).toBe(false);
      expect(result.message).toContain('Open questions');
    });

    it('should continue if confidence below threshold', () => {
      const config = createTestConfig();
      const result = checkPlanRevisionStopCondition(config, 1, false, 70);
      expect(result.shouldStop).toBe(false);
      expect(result.message).toContain('below threshold');
    });
  });
});

describe('checkFollowUpStopCondition', () => {
  describe('when no more work', () => {
    it('should stop if no follow-ups and no hard blockers', () => {
      const config = createTestConfig();
      const result = checkFollowUpStopCondition(config, 1, false, false);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('NO_MORE_WORK');
    });
  });

  describe('when limit reached', () => {
    it('should stop if iteration count reaches max', () => {
      const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxFollowUpIterations: 5 } });
      const result = checkFollowUpStopCondition(config, 5, true, false);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('LIMIT_REACHED');
    });

    it('should include relevant next steps when limit reached with follow-ups', () => {
      const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxFollowUpIterations: 5 } });
      const result = checkFollowUpStopCondition(config, 5, true, false);
      expect(result.nextSteps).toBeDefined();
      expect(result.nextSteps!.some(s => s.includes('follow-ups'))).toBe(true);
    });

    it('should include hard blocker info when limit reached with blockers', () => {
      const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxFollowUpIterations: 5 } });
      const result = checkFollowUpStopCondition(config, 5, false, true);
      expect(result.nextSteps).toBeDefined();
      expect(result.nextSteps!.some(s => s.includes('Hard blockers'))).toBe(true);
    });
  });

  describe('unlimited mode', () => {
    it('should NOT stop due to limit in unlimited mode', () => {
      const config = createTestConfig({
        runMode: { ...DEFAULT_CONFIG.runMode, unlimitedIterations: true },
        limits: { ...DEFAULT_CONFIG.limits, maxFollowUpIterations: 5 },
      });
      const result = checkFollowUpStopCondition(config, 100, true, false);
      expect(result.shouldStop).toBe(false);
    });
  });

  describe('continue conditions', () => {
    it('should continue if hard blockers present', () => {
      const config = createTestConfig();
      const result = checkFollowUpStopCondition(config, 1, false, true);
      expect(result.shouldStop).toBe(false);
      expect(result.message).toContain('Hard blockers');
    });

    it('should continue if follow-ups remain', () => {
      const config = createTestConfig();
      const result = checkFollowUpStopCondition(config, 1, true, false);
      expect(result.shouldStop).toBe(false);
      expect(result.message).toContain('Follow-ups remain');
    });
  });
});

describe('checkExecutionIterationStopCondition', () => {
  describe('when condition met', () => {
    it('should stop if no gaps identified', () => {
      const config = createTestConfig();
      const result = checkExecutionIterationStopCondition(config, 1, false);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('CONDITION_MET');
      expect(result.message).toContain('complete');
    });
  });

  describe('when limit reached', () => {
    it('should stop if exec iteration count reaches max', () => {
      const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxExecIterations: 3 } });
      const result = checkExecutionIterationStopCondition(config, 3, true);
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('LIMIT_REACHED');
      expect(result.nextSteps).toBeDefined();
    });
  });

  describe('unlimited mode', () => {
    it('should NOT stop due to limit in unlimited mode', () => {
      const config = createTestConfig({
        runMode: { ...DEFAULT_CONFIG.runMode, unlimitedIterations: true },
        limits: { ...DEFAULT_CONFIG.limits, maxExecIterations: 3 },
      });
      const result = checkExecutionIterationStopCondition(config, 100, true);
      expect(result.shouldStop).toBe(false);
    });
  });

  describe('continue conditions', () => {
    it('should continue if gaps identified and under limit', () => {
      const config = createTestConfig();
      const result = checkExecutionIterationStopCondition(config, 1, true);
      expect(result.shouldStop).toBe(false);
      expect(result.message).toContain('Gaps identified');
    });
  });
});

describe('getPlanRevisionProgress', () => {
  it('should format progress correctly', () => {
    const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxPlanIterations: 10 } });
    const progress = getPlanRevisionProgress(config, 3);
    expect(progress.current).toBe(3);
    expect(progress.max).toBe(10);
    expect(progress.unlimited).toBe(false);
    expect(progress.display).toBe('3/10');
  });

  it('should use infinity symbol in unlimited mode', () => {
    const config = createTestConfig({
      runMode: { ...DEFAULT_CONFIG.runMode, unlimitedIterations: true },
    });
    const progress = getPlanRevisionProgress(config, 5);
    expect(progress.max).toBe(Infinity);
    expect(progress.unlimited).toBe(true);
    expect(progress.display).toBe('5/∞');
  });
});

describe('getFollowUpProgress', () => {
  it('should format progress correctly', () => {
    const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxFollowUpIterations: 10 } });
    const progress = getFollowUpProgress(config, 7);
    expect(progress.current).toBe(7);
    expect(progress.max).toBe(10);
    expect(progress.display).toBe('7/10');
  });
});

describe('getExecutionIterationProgress', () => {
  it('should format progress correctly', () => {
    const config = createTestConfig({ limits: { ...DEFAULT_CONFIG.limits, maxExecIterations: 5 } });
    const progress = getExecutionIterationProgress(config, 2);
    expect(progress.current).toBe(2);
    expect(progress.max).toBe(5);
    expect(progress.display).toBe('2/5');
  });
});

describe('formatLimit', () => {
  it('should return infinity symbol when unlimited', () => {
    expect(formatLimit(10, true)).toBe('∞');
  });

  it('should return number as string when not unlimited', () => {
    expect(formatLimit(10, false)).toBe('10');
  });
});

describe('getRemainingIterations', () => {
  it('should return Infinity when unlimited', () => {
    expect(getRemainingIterations(5, 10, true)).toBe(Infinity);
  });

  it('should calculate remaining correctly', () => {
    expect(getRemainingIterations(3, 10, false)).toBe(7);
    expect(getRemainingIterations(10, 10, false)).toBe(0);
    expect(getRemainingIterations(15, 10, false)).toBe(0);
  });
});

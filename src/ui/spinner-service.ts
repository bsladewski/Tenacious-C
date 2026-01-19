/**
 * Spinner Service (Phase 8)
 * Centralized spinner management with TTY and verbosity awareness
 */

import ora, { Ora } from 'ora';

/**
 * Options for creating a spinner
 */
export interface SpinnerOptions {
  /** Text to display with the spinner */
  text: string;
  /** Whether to use a spinner (false = just log text) */
  useSpinner?: boolean;
  /** Color for the spinner */
  color?: 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';
  /** Symbol to use when not spinning */
  prefixSymbol?: string;
}

/**
 * Spinner instance interface
 */
export interface Spinner {
  /** Start the spinner */
  start(): void;
  /** Stop with success */
  succeed(text?: string): void;
  /** Stop with failure */
  fail(text?: string): void;
  /** Stop with warning */
  warn(text?: string): void;
  /** Stop with info */
  info(text?: string): void;
  /** Update the spinner text */
  setText(text: string): void;
  /** Stop the spinner without status */
  stop(): void;
  /** Whether the spinner is spinning */
  readonly isSpinning: boolean;
}

/**
 * Spinner service configuration
 */
export interface SpinnerServiceConfig {
  /** Whether TTY output is available */
  isTTY: boolean;
  /** Whether to suppress all output */
  quiet: boolean;
  /** Whether verbose mode is enabled (affects logging) */
  verbose: boolean;
  /** Output stream for the spinner */
  stream?: NodeJS.WriteStream;
}

/**
 * A no-op spinner for non-TTY or quiet mode
 */
class NullSpinner implements Spinner {
  private spinning = false;

  start(): void {
    this.spinning = true;
  }
  succeed(): void {
    this.spinning = false;
  }
  fail(): void {
    this.spinning = false;
  }
  warn(): void {
    this.spinning = false;
  }
  info(): void {
    this.spinning = false;
  }
  setText(): void {
    // No-op
  }
  stop(): void {
    this.spinning = false;
  }
  get isSpinning(): boolean {
    return this.spinning;
  }
}

/**
 * A simple text-based spinner for non-TTY environments
 */
class TextSpinner implements Spinner {
  private spinning = false;
  private text: string;
  private readonly stream: NodeJS.WriteStream;
  private readonly prefixSymbol: string;

  constructor(
    text: string,
    stream: NodeJS.WriteStream = process.stdout,
    prefixSymbol: string = '>'
  ) {
    this.text = text;
    this.stream = stream;
    this.prefixSymbol = prefixSymbol;
  }

  start(): void {
    this.spinning = true;
    this.stream.write(`${this.prefixSymbol} ${this.text}\n`);
  }

  succeed(text?: string): void {
    this.spinning = false;
    const msg = text ?? this.text;
    this.stream.write(`✅ ${msg}\n`);
  }

  fail(text?: string): void {
    this.spinning = false;
    const msg = text ?? this.text;
    this.stream.write(`❌ ${msg}\n`);
  }

  warn(text?: string): void {
    this.spinning = false;
    const msg = text ?? this.text;
    this.stream.write(`⚠️  ${msg}\n`);
  }

  info(text?: string): void {
    this.spinning = false;
    const msg = text ?? this.text;
    this.stream.write(`ℹ️  ${msg}\n`);
  }

  setText(text: string): void {
    this.text = text;
    if (this.spinning) {
      this.stream.write(`${this.prefixSymbol} ${text}\n`);
    }
  }

  stop(): void {
    this.spinning = false;
  }

  get isSpinning(): boolean {
    return this.spinning;
  }
}

/**
 * A wrapper around ora spinner
 */
class OraSpinner implements Spinner {
  private readonly oraInstance: Ora;

  constructor(text: string, color?: SpinnerOptions['color'], stream?: NodeJS.WriteStream) {
    this.oraInstance = ora({
      text,
      color,
      stream,
    });
  }

  start(): void {
    this.oraInstance.start();
  }

  succeed(text?: string): void {
    this.oraInstance.succeed(text);
  }

  fail(text?: string): void {
    this.oraInstance.fail(text);
  }

  warn(text?: string): void {
    this.oraInstance.warn(text);
  }

  info(text?: string): void {
    this.oraInstance.info(text);
  }

  setText(text: string): void {
    this.oraInstance.text = text;
  }

  stop(): void {
    this.oraInstance.stop();
  }

  get isSpinning(): boolean {
    return this.oraInstance.isSpinning;
  }
}

/**
 * Centralized service for managing spinners
 */
export class SpinnerService {
  private readonly config: SpinnerServiceConfig;
  private activeSpinner: Spinner | null = null;

  constructor(config: Partial<SpinnerServiceConfig> = {}) {
    this.config = {
      isTTY: config.isTTY ?? process.stdout.isTTY ?? false,
      quiet: config.quiet ?? false,
      verbose: config.verbose ?? false,
      stream: config.stream ?? process.stdout,
    };
  }

  /**
   * Create a new spinner instance
   */
  create(options: SpinnerOptions): Spinner {
    // Stop any existing spinner
    if (this.activeSpinner?.isSpinning) {
      this.activeSpinner.stop();
    }

    // In quiet mode, return a null spinner
    if (this.config.quiet) {
      return new NullSpinner();
    }

    // Determine spinner type based on TTY and options
    const useSpinner = options.useSpinner ?? this.config.isTTY;

    let spinner: Spinner;

    if (useSpinner && this.config.isTTY) {
      // Use ora for TTY with spinner
      spinner = new OraSpinner(options.text, options.color, this.config.stream);
    } else {
      // Use text-based for non-TTY or when spinner disabled
      spinner = new TextSpinner(
        options.text,
        this.config.stream,
        options.prefixSymbol ?? '>'
      );
    }

    this.activeSpinner = spinner;
    return spinner;
  }

  /**
   * Create and start a spinner
   */
  start(text: string, color?: SpinnerOptions['color']): Spinner {
    const spinner = this.create({ text, color });
    spinner.start();
    return spinner;
  }

  /**
   * Stop any active spinner
   */
  stopAll(): void {
    if (this.activeSpinner?.isSpinning) {
      this.activeSpinner.stop();
    }
    this.activeSpinner = null;
  }

  /**
   * Get the active spinner if any
   */
  getActive(): Spinner | null {
    return this.activeSpinner;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SpinnerServiceConfig>): void {
    if (config.isTTY !== undefined) this.config.isTTY = config.isTTY;
    if (config.quiet !== undefined) this.config.quiet = config.quiet;
    if (config.verbose !== undefined) this.config.verbose = config.verbose;
    if (config.stream !== undefined) this.config.stream = config.stream;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<SpinnerServiceConfig> {
    return { ...this.config };
  }
}

/**
 * Create a spinner service with default config
 */
export function createSpinnerService(config?: Partial<SpinnerServiceConfig>): SpinnerService {
  return new SpinnerService(config);
}

// Default global instance for convenience
let defaultSpinnerService: SpinnerService | null = null;

/**
 * Get or create the default spinner service
 */
export function getDefaultSpinnerService(): SpinnerService {
  if (!defaultSpinnerService) {
    defaultSpinnerService = createSpinnerService();
  }
  return defaultSpinnerService;
}

/**
 * Reset the default spinner service
 */
export function resetDefaultSpinnerService(): void {
  if (defaultSpinnerService) {
    defaultSpinnerService.stopAll();
    defaultSpinnerService = null;
  }
}

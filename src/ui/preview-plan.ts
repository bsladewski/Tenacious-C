import { spawn } from 'child_process';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

/**
 * Preview a markdown file in the terminal
 * Tries to use a markdown viewer if available, otherwise falls back to less or cat
 * @param filePath - Path to the markdown file to preview
 * @returns Promise that resolves when the preview is closed
 */
export function previewPlan(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    if (!existsSync(filePath)) {
      console.error(`Plan file not found: ${filePath}`);
      resolve();
      return;
    }

    // Try to find a markdown viewer
    let viewer: string | null = null;
    let viewerArgs: string[] = [];

    // Check for glow (nice markdown renderer)
    try {
      execSync('which glow', { stdio: 'ignore' });
      viewer = 'glow';
      viewerArgs = [filePath];
    } catch {
      // glow not available, try less
      try {
        execSync('which less', { stdio: 'ignore' });
        viewer = 'less';
        // Use less with options for better markdown viewing
        // -R: allow ANSI color codes
        // -X: don't clear screen on exit
        viewerArgs = ['-R', '-X', filePath];
      } catch {
        // less not available, fall back to cat
        viewer = null;
      }
    }

    if (!viewer) {
      // Last resort: just cat the file
      console.log('\n--- Plan Preview ---\n');
      console.log(readFileSync(filePath, 'utf-8'));
      console.log('\n--- End of Plan ---\n');
      resolve();
      return;
    }

    // Use the selected viewer with spawn for interactive programs
    const child = spawn(viewer, viewerArgs, {
      stdio: 'inherit',
    });

    child.on('error', () => {
      // If spawn fails, fall back to cat
      console.log('\n--- Plan Preview ---\n');
      console.log(readFileSync(filePath, 'utf-8'));
      console.log('\n--- End of Plan ---\n');
      resolve();
    });

    child.on('close', () => {
      // Exit code doesn't matter - user might have pressed 'q' in less
      resolve();
    });
  });
}

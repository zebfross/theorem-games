// End-to-end tests, run against a local server by default and against the live
// site when BASE_URL says so.
//
// Both matter, and for different reasons. Run locally they catch code that is
// broken before it ships. Run against theorem.games they catch a deploy that
// shipped something else — which is two of the three regressions that prompted
// them: the explorations shelf was never copied to the server, and the removed
// game went on being listed because of a stale cache. Neither was visible in
// the repository.

import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8422';
const LOCAL = !process.env.BASE_URL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // tools/serve.py rather than http.server: it sends no-store, so a test never
  // runs against a file the browser is holding from an earlier edit.
  webServer: LOCAL ? {
    command: 'python3 tools/serve.py 8422',
    url: 'http://127.0.0.1:8422/index.html',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  } : undefined,
});

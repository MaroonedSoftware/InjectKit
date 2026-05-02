import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const repositoryRoot = process.cwd();
const fixturePath = resolve(repositoryRoot, 'tests/fixtures/browser/browser-ready-smoke.html');

/**
 * Finds a Playwright-managed Chromium binary without requiring Playwright as a
 * runtime dependency of the package. CI can still override this with CHROME_BIN.
 */
function findNewestPlaywrightBrowser(...relativeParts) {
  const cacheRoot = join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(cacheRoot)) {
    return undefined;
  }

  const directories = readdirSync(cacheRoot, { withFileTypes: true })
    .filter(directory => directory.isDirectory())
    .map(directory => directory.name)
    .filter(name => /^chromium(_headless_shell)?-\d+$/.test(name))
    .sort((left, right) => {
      const leftVersion = Number(left.split('-').at(-1));
      const rightVersion = Number(right.split('-').at(-1));
      return rightVersion - leftVersion;
    });

  for (const directory of directories) {
    const browserPath = join(cacheRoot, directory, ...relativeParts);
    if (existsSync(browserPath)) {
      return browserPath;
    }
  }

  return undefined;
}

/**
 * Resolves the browser executable used by the smoke test.
 * Explicit environment variables win over local Playwright cache discovery.
 */
function findBrowserExecutable() {
  const explicitCandidates = [process.env.CHROME_BIN, process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH].filter(Boolean);

  for (const candidate of explicitCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return (
    findNewestPlaywrightBrowser('chrome-headless-shell-linux64', 'chrome-headless-shell') ?? findNewestPlaywrightBrowser('chrome-linux64', 'chrome')
  );
}

async function main() {
  const browserExecutable = findBrowserExecutable();
  if (!browserExecutable) {
    throw new Error('Could not find a Chromium executable. Set CHROME_BIN or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');
  }

  const isHeadlessShell = browserExecutable.includes('chrome-headless-shell');
  const userDataDir = isHeadlessShell ? undefined : mkdtempSync(join(tmpdir(), 'injectkit-browser-smoke-'));

  try {
    const smokeUrl = pathToFileURL(fixturePath).href;
    // Load the fixture over file:// to prove the browser artifact works without
    // a dev server, bundler or package resolver.
    const browserArgs = ['--no-sandbox', '--allow-file-access-from-files', '--virtual-time-budget=10000', '--dump-dom', smokeUrl];

    if (!isHeadlessShell) {
      browserArgs.unshift('--run-all-compositor-stages-before-draw', '--disable-dev-shm-usage', '--disable-gpu', '--headless');
      browserArgs.push(`--user-data-dir=${userDataDir}`);
    }

    const result = spawnSync(browserExecutable, browserArgs, {
      encoding: 'utf8',
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(`Chromium exited with code ${result.status}\n${result.stderr || result.stdout}`);
    }

    const statusMatch = result.stdout.match(/<div id="status">([^<]+)<\/div>/);
    const statusText = statusMatch?.[1]?.trim();

    if (statusText !== 'ready') {
      throw new Error(`Browser smoke test failed with status "${statusText ?? 'unknown'}"\n${result.stdout}`);
    }
  } finally {
    if (userDataDir) {
      rmSync(userDataDir, { force: true, recursive: true });
    }
  }
}

await main();

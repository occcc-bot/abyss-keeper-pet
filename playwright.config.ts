import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cachedChrome = path.join(
  os.homedir(),
  '.cache',
  'ms-playwright',
  'chromium-1140',
  'chrome-linux',
  'chrome',
);
const userChromiumLibDir = path.join(
  os.homedir(),
  '.local',
  'chromium-libs',
  'usr',
  'lib',
  'x86_64-linux-gnu',
);
const extraEnv: Record<string, string> = {};
if (fs.existsSync(userChromiumLibDir)) {
  extraEnv.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${userChromiumLibDir}:${process.env.LD_LIBRARY_PATH}`
    : userChromiumLibDir;
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    headless: true,
    launchOptions: {
      ...(fs.existsSync(cachedChrome) ? { executablePath: cachedChrome } : {}),
      ...(Object.keys(extraEnv).length > 0 ? { env: { ...process.env, ...extraEnv } as Record<string, string> } : {}),
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  webServer: {
    command: 'npm run dev:web',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

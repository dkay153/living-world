import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { prepareSandboxPackage } from '../server/sandbox-package.js';

if (process.platform !== 'win32') throw new Error('This review package requires Windows Sandbox');
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Run this tool with the project Node 22 runtime');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--candidate')) throw new Error('Usage: npm run lab:sandbox:prepare -- [--candidate PATH]');
const projectDir = resolve('.'), browser = chromium.executablePath();
if (!existsSync(browser)) throw new Error('Install the matching Chromium runtime first: npx playwright install chromium');
const result = await prepareSandboxPackage({ projectDir, candidateDir: args[1] ? resolve(args[1]) : projectDir, outputRoot: resolve('outputs/world-lab/sandbox'), nodeBinary: process.execPath, playwrightCore: dirname(fileURLToPath(import.meta.resolve('playwright-core/package.json'))), browserDir: dirname(browser) });
console.log(JSON.stringify({ ...result, installed: existsSync('C:/Windows/System32/WindowsSandbox.exe'), next: 'Open review.wsb inside Windows Sandbox. No candidate was executed on this host.' }, null, 2));

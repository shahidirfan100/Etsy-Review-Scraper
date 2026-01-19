import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

try {
    const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
    const expectedVersion = pkg.dependencies.playwright.replace(/[\^~]/, '');

    console.log(`Checking Playwright version... Expected: ${expectedVersion}`);

    const installedVersion = execSync('npx playwright --version')
        .toString()
        .match(/playwright ([\d.]+)/)[1];

    console.log(`Installed version: ${installedVersion}`);

    if (installedVersion !== expectedVersion) {
        console.warn(`WARNING: Playwright version mismatch! Installed: ${installedVersion}, Package: ${expectedVersion}`);
        // In some environments we might want to throw error, but for now just warn
    } else {
        console.log('Playwright version check passed.');
    }
} catch (error) {
    console.error('Failed to check Playwright version:', error.message);
}

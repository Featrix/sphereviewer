# Automated Tests

This directory contains automated browser tests using Playwright.

## Quick Start

```bash
# Build the component first
npm run build:embed

# Run all tests (headless)
npm test

# Run tests with UI (interactive)
npm run test:ui

# Run tests in headed mode (see browser)
npm run test:headed
```

## What Gets Tested

- **demo.html** - Main demo page loads without errors
- **simple-test.html** - Minimal example works
- **embed-test.html** - Comprehensive test suite runs
- **training-movie-demo.html** - Training movie demo loads
- **data-driven-test.html** - Data-driven integration works

Each test:
- ✅ Verifies the page loads
- ✅ Checks that `FeatrixSphereViewer` is available globally
- ✅ Captures console errors
- ✅ Verifies no JavaScript errors occur

## Test Results

After running tests, view the HTML report:
```bash
npx playwright show-report
```

## Adding New Tests

Add new test files to `tests/` directory with `.spec.ts` extension:

```typescript
import { test, expect } from '@playwright/test';

test('my new test', async ({ page }) => {
  await page.goto('/my-page.html');
  // Your test code here
});
```



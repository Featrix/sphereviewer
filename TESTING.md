# Automated Testing Guide

## Quick Start

The project now has automated browser tests using Playwright. This is the **lowest-lift** way to verify everything works.

### Run Tests

```bash
# 1. Build the component first
npm run build:embed

# 2. Run all tests (headless - fastest)
npm test

# 3. Run tests with UI (interactive - see what's happening)
npm run test:ui

# 4. Run tests in headed mode (see browser window)
npm run test:headed
```

### What Gets Tested

### Basic Tests (`make test`)
These are **minimal smoke tests** that verify:
- ✅ Pages load without crashing
- ✅ `FeatrixSphereViewer` script is available
- ✅ No critical JavaScript errors
- ⚠️ **Does NOT verify**: That the sphere actually renders, data loads, or features work

### Functional Tests (`make test-functional`)
These verify **actual functionality**:
- ✅ WebGL canvas is created (Three.js renderer exists)
- ✅ Canvas has dimensions (actually rendered, not just created)
- ✅ Controls are interactive (checkboxes, sliders work)
- ✅ Data-driven pages load with sample data
- ✅ API errors are handled gracefully
- ⚠️ **Does NOT verify**: Visual correctness, data accuracy, or 3D rendering quality

### Limitations
These tests **cannot verify**:
- ❌ That the sphere visualization looks correct
- ❌ That data points are in the right positions
- ❌ That the 3D rendering is accurate
- ❌ Performance or frame rates
- ❌ Visual regression (screenshots would help here)

**For visual verification**, you still need to manually open the browser and check.

### Test Files Covered

- `demo.html` - Main demo page
- `simple-test.html` - Minimal example
- `embed-test.html` - Comprehensive test suite
- `training-movie-demo.html` - Training movie visualization
- `data-driven-test.html` - Data-driven integration

### View Test Results

After running tests, view the detailed HTML report:

```bash
npx playwright show-report
```

This opens an interactive report showing:
- Which tests passed/failed
- Screenshots of failures
- Console logs
- Network requests
- Full error traces

### Adding New Tests

Add new test files to `tests/` directory:

```typescript
// tests/my-feature.spec.ts
import { test, expect } from '@playwright/test';

test('my feature works', async ({ page }) => {
  await page.goto('/my-page.html');
  await page.waitForLoadState('networkidle');
  
  // Your assertions here
  const loaded = await page.evaluate(() => {
    return typeof window.FeatrixSphereViewer !== 'undefined';
  });
  expect(loaded).toBe(true);
});
```

### Troubleshooting

**Server won't start:**
```bash
# Kill any existing server on port 8080
lsof -ti:8080 | xargs kill -9

# Then run tests again
npm test
```

**Tests are flaky:**
- Increase timeouts in `playwright.config.ts`
- Add more `waitForTimeout()` calls in tests
- Check if pages need more time to load

**Want to debug a specific test:**
```bash
# Run one test file
npx playwright test tests/basic.spec.ts

# Run one specific test
npx playwright test tests/basic.spec.ts -g "demo.html"

# Debug mode (step through)
npx playwright test --debug
```

## Benefits

✅ **Automated** - No manual browser clicking  
✅ **Fast** - Runs in seconds  
✅ **Reliable** - Catches regressions  
✅ **Documentation** - Tests show how things should work  
✅ **CI Ready** - Can run in GitHub Actions, etc.

## Next Steps

Consider adding:
- Visual regression tests (screenshot comparison)
- Performance tests (load time, FPS)
- Accessibility tests (a11y)
- Cross-browser tests (Firefox, Safari)


import { test, expect } from '@playwright/test';

test.describe('Sphere Viewer Functional Tests', () => {
  test('demo.html renders a WebGL canvas when data is loaded', async ({ page }) => {
    await page.goto('/demo.html');
    await page.waitForLoadState('networkidle');
    
    // Check that FeatrixSphereViewer is available
    const viewerAvailable = await page.evaluate(() => {
      return typeof (window as any).FeatrixSphereViewer !== 'undefined';
    });
    expect(viewerAvailable).toBe(true);
    
    // Check for WebGL canvas (Three.js renderer creates a canvas)
    const canvasExists = await page.evaluate(() => {
      const canvases = document.querySelectorAll('canvas');
      return canvases.length > 0;
    });
    expect(canvasExists).toBe(true);
    
    // Check that canvas has dimensions (actually rendered)
    const canvasHasSize = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas && canvas.width > 0 && canvas.height > 0;
    });
    expect(canvasHasSize).toBe(true);
  });

  test('sphere viewer container is created', async ({ page }) => {
    await page.goto('/demo.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Check for sphere viewer container
    const containerExists = await page.evaluate(() => {
      const containers = document.querySelectorAll('[id*="sphere"], [class*="sphere"]');
      return containers.length > 0;
    });
    expect(containerExists).toBe(true);
  });

  test('controls are interactive', async ({ page }) => {
    await page.goto('/demo.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Find rotation checkbox
    const rotationCheckbox = page.locator('input[type="checkbox"]').first();
    const isChecked = await rotationCheckbox.isChecked();
    
    // Toggle it
    await rotationCheckbox.click();
    await page.waitForTimeout(500);
    
    const isCheckedAfter = await rotationCheckbox.isChecked();
    expect(isCheckedAfter).not.toBe(isChecked);
  });

  test('data-driven-test.html loads with sample data', async ({ page }) => {
    await page.goto('/data-driven-test.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Give time for data to load
    
    // Check that viewer initialized
    const viewerInitialized = await page.evaluate(() => {
      return typeof (window as any).FeatrixSphereViewer !== 'undefined' ||
             typeof (window as any).SphereViewer !== 'undefined';
    });
    expect(viewerInitialized).toBe(true);
    
    // Check for canvas
    const hasCanvas = await page.evaluate(() => {
      return document.querySelectorAll('canvas').length > 0;
    });
    expect(hasCanvas).toBe(true);
  });

  test('API errors are handled gracefully', async ({ page }) => {
    const apiErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('API')) {
        apiErrors.push(msg.text());
      }
    });

    await page.goto('/demo.html?session=invalid-session-123');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Page should still load even if API fails
    const pageLoaded = await page.evaluate(() => {
      return document.body !== null;
    });
    expect(pageLoaded).toBe(true);
    
    // Viewer should still be available
    const viewerAvailable = await page.evaluate(() => {
      return typeof (window as any).FeatrixSphereViewer !== 'undefined';
    });
    expect(viewerAvailable).toBe(true);
  });
});



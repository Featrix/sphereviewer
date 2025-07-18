# 🎯 Component Renamed: SphereViewer → FeatrixSphereViewer

## Overview

The embeddable sphere viewer component has been renamed from `SphereViewer` to `FeatrixSphereViewer` for better branding and clarity.

## 🔄 What Changed

### JavaScript API
```javascript
// OLD
const viewer = new window.SphereViewer();

// NEW  
const viewer = new window.FeatrixSphereViewer();
```

### React Import
```javascript
// OLD
import { SphereViewer } from '@featrix/sphere-viewer';

// NEW
import { FeatrixSphereViewer } from '@featrix/sphere-viewer';
```

### TypeScript Interfaces
```typescript
// OLD
interface SphereViewerProps {
  sessionId: string;
  apiBaseUrl?: string;
}

// NEW  
interface FeatrixSphereViewerProps {
  sessionId: string;
  apiBaseUrl?: string;
}
```

### Debug Mode
```javascript
// OLD
window.SphereViewerDebug = true;

// NEW
window.FeatrixSphereViewerDebug = true;
```

## 📄 Files Updated

### Core Components
- ✅ `src/SphereViewerApp.tsx` → `src/FeatrixSphereViewerApp.tsx`
- ✅ `src/embed-entry.tsx` - Class name and global object
- ✅ `src/index.ts` - Export names and interfaces
- ✅ `webpack.config.js` - Library name

### Documentation
- ✅ `README_USAGE.md` - All examples and API references
- ✅ `data-driven-test.html` - Test functions and examples
- ✅ Test files and examples

### Build Outputs
- ✅ `dist/sphere-viewer.js` - Rebuilt with new naming
- ✅ NPM package exports updated

## 🚀 Usage Examples

### 1. Auto-initialization (Window Data)
```html
<script>
window.myFeatrixData = { /* your data */ };
</script>
<script src="sphere-viewer.js" data-use-window-data="myFeatrixData"></script>
```

### 2. Manual JavaScript API
```html
<script src="sphere-viewer.js"></script>
<script>
const viewer = new window.FeatrixSphereViewer();
viewer.init({
  data: featrixDataObject,
  containerId: 'my-container'
});
</script>
```

### 3. React Component
```tsx
import { FeatrixSphereViewer } from '@featrix/sphere-viewer';

function MyApp({ data }) {
  return <FeatrixSphereViewer data={data} />;
}
```

## ✅ Backward Compatibility

The old `SphereViewer` name has been completely removed to avoid confusion. Users must update their code to use `FeatrixSphereViewer`.

## 🎯 Benefits

1. **Clear Branding**: Makes it obvious this is a Featrix component
2. **Namespace Safety**: Reduces naming conflicts with other libraries  
3. **Professional**: More descriptive and branded name
4. **Consistency**: Aligns with Featrix naming conventions

## 📋 Migration Checklist

If upgrading from the old `SphereViewer`:

- [ ] Replace `window.SphereViewer` with `window.FeatrixSphereViewer`
- [ ] Update React imports from `SphereViewer` to `FeatrixSphereViewer`
- [ ] Change TypeScript interfaces from `SphereViewerProps` to `FeatrixSphereViewerProps`
- [ ] Update debug flags from `SphereViewerDebug` to `FeatrixSphereViewerDebug`
- [ ] Test all functionality works with new naming

## 🚀 Ready for Production

The renamed component is ready for:
- ✅ CDN distribution as `sphere-viewer.js`
- ✅ NPM package `@featrix/sphere-viewer`
- ✅ Direct embedding in websites
- ✅ React applications

The component is now properly branded as **FeatrixSphereViewer** while maintaining all the same powerful data-driven functionality! 🎯 
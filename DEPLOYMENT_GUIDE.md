# 🚀 FeatrixSphereViewer Deployment Guide

## Overview

The FeatrixSphereViewer can be easily deployed to your 'bits' host using the automated deployment script. This guide explains how to deploy and what gets deployed.

## 🛠️ Deployment Commands

### Build & Deploy
```bash
# Build the embeddable component
npm run build:embed

# Deploy to bits
./deploy-to-bits.sh
```

Always build first, then deploy. Do not use `npm run deploy` or `npm run deploy:full`.

## 📁 What Gets Deployed

The deployment script copies the following files to `bits:/var/www/html/sv/`:

### Core Component
- **`sphere-viewer.js`** (573KB) - Main embeddable script with FeatrixSphereViewer
- **`example-featrix-data.json`** - Sample Featrix data export for testing

### Demo & Test Pages
- **`index.html`** - Complete data-driven integration demo (main page)
- **`simple-test.html`** - Basic functionality test
- **`test-new-naming.html`** - FeatrixSphereViewer naming verification
- **`landing.html`** - Information page with all links and documentation

### Documentation
- **`README_USAGE.md`** - Complete usage guide and integration examples
- **`FINAL_NAMING_SUMMARY.md`** - Comprehensive rebranding summary
- **`NAMING_UPDATE_SUMMARY.md`** - Update details and migration info

## 🌐 Access URLs

Once deployed, access the FeatrixSphereViewer at:

- **Main Demo**: `http://bits/sv/` (Complete data-driven demo)
- **Landing Page**: `http://bits/sv/landing.html` (Info and file links)
- **Simple Test**: `http://bits/sv/simple-test.html` (Basic test)
- **Naming Test**: `http://bits/sv/test-new-naming.html` (Verification)

## 🔧 Integration Examples

### For External Websites

Users can embed the FeatrixSphereViewer in their websites using:

#### Method 1: Auto-initialization
```html
<script>
window.myFeatrixData = { /* user's Featrix export */ };
</script>
<script src="http://bits/sv/sphere-viewer.js" 
        data-use-window-data="myFeatrixData"></script>
```

#### Method 2: JSON File
```html
<script src="http://bits/sv/sphere-viewer.js" 
        data-featrix-data="path/to/user-data.json"></script>
```

#### Method 3: Manual API
```html
<script src="http://bits/sv/sphere-viewer.js"></script>
<script>
const viewer = new window.FeatrixSphereViewer();
viewer.init({
  data: userFeatrixData,
  containerId: 'my-sphere-container'
});
</script>
```

## 📋 Deployment Requirements

### Prerequisites
- SSH access to 'bits' host configured
- `bits` host defined in SSH config
- Local build files present (`dist/sphere-viewer.js`)

### Build First (if needed)
```bash
# Ensure latest embeddable build
npm run build:embed
```

### SSH Configuration
Ensure your `~/.ssh/config` includes:
```
Host bits
    HostName your-bits-host.com
    User your-username
    # ... other SSH config
```

## 🛡️ Security & Permissions

The deployment script automatically:
- Creates `/var/www/html/sv/` directory if it doesn't exist
- Sets appropriate file permissions (644 for files, 755 for directories)
- Transfers ownership to the deploying user

## 🔄 Update Deployment

To update the deployed version:

1. **Make changes** to the FeatrixSphereViewer
2. **Rebuild**: `npm run build:embed`
3. **Deploy**: `./deploy-to-bits.sh`

## 📊 Deployment Features

### Self-Contained
- ✅ No database required
- ✅ No server-side processing
- ✅ Static file hosting only
- ✅ Works with any web server

### Performance
- ✅ CDN-ready static files
- ✅ Single 573KB JavaScript file
- ✅ No external dependencies
- ✅ Instant loading demos

### Professional
- ✅ Branded FeatrixSphereViewer
- ✅ Complete documentation
- ✅ Multiple integration examples
- ✅ Ready for production use

## 🎯 Next Steps

1. **Test the deployment** - Visit `http://bits/sv/` to verify
2. **Share the demos** - Use the URLs to show integration examples
3. **Customize as needed** - Modify the landing page or demos
4. **Monitor usage** - Track access logs if needed

The FeatrixSphereViewer is now live and ready for users to integrate into their websites! 🚀 
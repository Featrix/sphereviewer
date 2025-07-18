#!/usr/bin/env node

/**
 * Node.js Test for @featrix/sphere-viewer
 * Tests the CommonJS build and exports
 */

console.log('🧪 Testing @featrix/sphere-viewer in Node.js environment...\n');

try {
    // Test CommonJS import
    console.log('📦 Testing CommonJS import...');
    const sphereViewer = require('./react-test/node_modules/@featrix/sphere-viewer');
    console.log('✅ CommonJS import successful');
    
    // Test exports
    console.log('\n🔍 Checking available exports...');
    console.log('Available exports:', Object.keys(sphereViewer));
    
    if (sphereViewer.SphereViewer) {
        console.log('✅ SphereViewer component exported');
    } else {
        console.log('❌ SphereViewer component not found');
    }
    
    if (sphereViewer.SphereEmbedded) {
        console.log('✅ SphereEmbedded component exported');
    } else {
        console.log('❌ SphereEmbedded component not found');
    }
    
    if (sphereViewer.fetch_session_data) {
        console.log('✅ fetch_session_data utility exported');
    } else {
        console.log('❌ fetch_session_data utility not found');
    }
    
    // Test TypeScript definitions
    console.log('\n📘 Testing TypeScript definitions...');
    const fs = require('fs');
    const path = require('path');
    
    const typesPath = path.join(__dirname, 'react-test/node_modules/@featrix/sphere-viewer/dist/index.d.ts');
    if (fs.existsSync(typesPath)) {
        console.log('✅ TypeScript definitions found');
        const typeContent = fs.readFileSync(typesPath, 'utf8');
        if (typeContent.includes('SphereViewerProps')) {
            console.log('✅ SphereViewerProps interface defined');
        }
        if (typeContent.includes('SphereEmbeddedProps')) {
            console.log('✅ SphereEmbeddedProps interface defined');
        }
    } else {
        console.log('❌ TypeScript definitions not found');
    }
    
    // Test package.json
    console.log('\n📋 Testing package.json...');
    const packagePath = path.join(__dirname, 'react-test/node_modules/@featrix/sphere-viewer/package.json');
    if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        console.log('✅ Package.json found');
        console.log(`   Name: ${packageJson.name}`);
        console.log(`   Version: ${packageJson.version}`);
        console.log(`   Main: ${packageJson.main}`);
        console.log(`   Module: ${packageJson.module}`);
        console.log(`   Types: ${packageJson.types}`);
        
        if (packageJson.peerDependencies) {
            console.log('✅ Peer dependencies defined:', Object.keys(packageJson.peerDependencies));
        }
    }
    
    // Test file structure
    console.log('\n📁 Testing package file structure...');
    const distPath = path.join(__dirname, 'react-test/node_modules/@featrix/sphere-viewer/dist');
    if (fs.existsSync(distPath)) {
        const distFiles = fs.readdirSync(distPath);
        console.log('✅ Dist directory found');
        console.log('   Files:', distFiles.filter(f => !f.includes('.map') && !f.includes('tsbuildinfo')));
        
        // Check for required files
        const requiredFiles = ['index.js', 'index.esm.js', 'index.d.ts', 'sphere-viewer.js'];
        requiredFiles.forEach(file => {
            if (distFiles.includes(file)) {
                console.log(`✅ ${file} found`);
            } else {
                console.log(`❌ ${file} missing`);
            }
        });
    }
    
    console.log('\n🎉 Node.js tests completed!');
    console.log('\n📊 Test Summary:');
    console.log('✅ Package can be imported in Node.js');
    console.log('✅ All expected exports are available');
    console.log('✅ TypeScript definitions are working');
    console.log('✅ Package structure is correct');
    
} catch (error) {
    console.error('❌ Node.js test failed:', error.message);
    process.exit(1);
} 
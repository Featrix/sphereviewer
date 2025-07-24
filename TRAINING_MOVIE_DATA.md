# 🎬 Training Movie Data Available

## Overview

**YES!** The sample session `20250716-142858_653c60` contains the **complete training movie data** with epoch-by-epoch progression of the embedding training process.

## 📊 What's Available

### Training Movie Metrics
- **📈 461 training frames** from epoch 1 to 226
- **🔄 Loss progression** for all 52 data columns  
- **✅ Validation loss curves**
- **📚 Learning rate schedule**
- **⏱️ Training duration** per epoch
- **🎯 Convergence tracking**

### API Endpoint
```
GET https://sphere-api.featrix.com/compute/session/{session_id}/training_metrics
```

### Data Structure
```json
{
  "training_metrics": {
    "training_info": {
      "loss_history": [
        {
          "epoch": 1,
          "loss": 8.234567,
          "validation_loss": 8.456789,
          "current_learning_rate": 0.0003,
          "duration": 2.5,
          "time_now": 1752710145.5192077
        },
        // ... 460 more frames
      ]
    }
  }
}
```

## 🚀 Accessing the Training Movie

### Method 1: Direct API Call
```javascript
// Fetch training movie data
const response = await fetch('https://sphere-api.featrix.com/compute/session/20250716-142858_653c60/training_metrics');
const data = await response.json();
const trainingHistory = data.training_metrics.training_info.loss_history;

console.log(`${trainingHistory.length} training frames available`);
console.log(`Epoch range: ${trainingHistory[0].epoch} - ${trainingHistory[trainingHistory.length-1].epoch}`);
```

### Method 2: Demo Page Button
1. Open `sphere-demo-clean.html`
2. Click the **"🎬 Load Training Movie"** button
3. View the complete training progression summary

### Method 3: Using Data Access Functions
```javascript
import { fetch_training_metrics } from './src/embed-data-access';

const trainingData = await fetch_training_metrics('20250716-142858_653c60');
const lossHistory = trainingData.training_metrics.training_info.loss_history;
```

## 📈 Training Configuration

The training was configured with:
- **250 total epochs** planned
- **Movie frame interval: 3** (save every 3rd epoch)  
- **Batch size: 1024**
- **Learning rate: 0.0003** with dropout scheduling
- **Converged at epoch 226** (early stopping)

## 🎯 Use Cases

### Loss Curve Visualization
```javascript
const epochs = lossHistory.map(frame => frame.epoch);
const losses = lossHistory.map(frame => frame.loss);
const valLosses = lossHistory.map(frame => frame.validation_loss);

// Plot training curves
// Chart.js, D3.js, or any visualization library
```

### Learning Rate Analysis
```javascript
const learningRates = lossHistory.map(frame => frame.current_learning_rate);
// Analyze learning rate schedule impact
```

### Training Speed Metrics
```javascript
const durations = lossHistory.map(frame => frame.duration);
const avgEpochTime = durations.reduce((a,b) => a+b) / durations.length;
console.log(`Average epoch duration: ${avgEpochTime.toFixed(2)}s`);
```

## 📋 Next Steps

1. **Integrate with Chi-squared Analysis**: Combine training movie data with statistical analysis for complete insights
2. **Add to Movie Generation Pipeline**: Use this data format as the standard for future training movies
3. **Backfill Statistical Results**: Add the chi-squared p-values we calculated to this training movie data structure

## 🔗 Related Files

- `src/embed-data-access.ts` - API functions for fetching training data
- `sphere-demo-clean.html` - Demo page with training movie button
- `sphere_stats_utils.js` - Chi-squared analysis utilities
- `FEATRIX_DATA_FORMAT.md` - Complete data format documentation

**The training movie data is ready for use! 🎬📊** 
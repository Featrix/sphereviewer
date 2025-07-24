/**
 * Statistical Utilities for Featrix Sphere Viewer (Browser Version)
 * 
 * This module provides statistical analysis functions for cluster analysis,
 * specifically chi-squared tests between cluster labels and other variables.
 */

// Make utilities available globally
window.SphereStatsUtils = (function() {
    'use strict';

    /**
     * Chi-squared critical values for different significance levels
     */
    const CHI_SQUARED_CRITICAL_VALUES = {
        1: { '0.001': 10.828, '0.01': 6.635, '0.05': 3.841 },
        2: { '0.001': 13.816, '0.01': 9.210, '0.05': 5.991 },
        3: { '0.001': 16.266, '0.01': 11.345, '0.05': 7.815 },
        4: { '0.001': 18.467, '0.01': 13.277, '0.05': 9.488 },
        5: { '0.001': 20.515, '0.01': 15.086, '0.05': 11.070 },
        6: { '0.001': 22.458, '0.01': 16.812, '0.05': 12.592 },
        7: { '0.001': 24.322, '0.01': 18.475, '0.05': 14.067 },
        8: { '0.001': 26.125, '0.01': 20.090, '0.05': 15.507 },
        9: { '0.001': 27.877, '0.01': 21.666, '0.05': 16.919 },
        10: { '0.001': 29.588, '0.01': 23.209, '0.05': 18.307 }
    };

    /**
     * Calculate chi-squared p-value approximation
     */
    function chiSquaredPValue(chiSquared, degreesOfFreedom) {
        if (degreesOfFreedom <= 10 && CHI_SQUARED_CRITICAL_VALUES[degreesOfFreedom]) {
            const criticals = CHI_SQUARED_CRITICAL_VALUES[degreesOfFreedom];
            
            if (chiSquared >= criticals['0.001']) return 0.001;
            if (chiSquared >= criticals['0.01']) return 0.01;
            if (chiSquared >= criticals['0.05']) return 0.05;
            return 0.1;
        }
        
        // For larger df, use approximation (Wilson-Hilferty transformation)
        const h = 2 / (9 * degreesOfFreedom);
        const normalizedStat = Math.pow(chiSquared / degreesOfFreedom, 1/3) - (1 - h);
        const standardized = normalizedStat / Math.sqrt(h);
        
        // Rough p-value approximation based on standard normal
        const absZ = Math.abs(standardized);
        if (absZ >= 3.291) return 0.001;
        if (absZ >= 2.576) return 0.01;
        if (absZ >= 1.960) return 0.05;
        if (absZ >= 1.645) return 0.1;
        return 0.5;
    }

    /**
     * Determine optimal number of bins for scalar variables
     */
    function getOptimalBinCount(values) {
        const n = values.length;
        
        // Sturges' rule
        const sturges = Math.ceil(Math.log2(n) + 1);
        
        // Freedman-Diaconis rule
        const sorted = [...values].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(n * 0.25)];
        const q3 = sorted[Math.floor(n * 0.75)];
        const iqr = q3 - q1;
        const binWidth = 2 * iqr / Math.pow(n, 1/3);
        const range = sorted[n-1] - sorted[0];
        const freedmanDiaconis = range > 0 ? Math.ceil(range / binWidth) : 1;
        
        const optimal = Math.min(sturges, freedmanDiaconis);
        return Math.max(3, Math.min(optimal, 8)); // Constrain between 3 and 8 bins
    }

    /**
     * Bin scalar values for chi-squared analysis
     */
    function binScalarValues(values, method = 'auto') {
        const numBins = getOptimalBinCount(values);
        const sorted = [...values].sort((a, b) => a - b);
        const n = values.length;
        
        let binEdges = [];
        let binLabels = [];
        
        if (method === 'quantile' || method === 'auto') {
            // Quantile-based binning
            binEdges = [sorted[0]];
            for (let i = 1; i < numBins; i++) {
                const quantile = i / numBins;
                const index = Math.floor(quantile * n);
                binEdges.push(sorted[Math.min(index, n-1)]);
            }
            binEdges.push(sorted[n-1] + 0.001);
            
            // Create labels
            for (let i = 0; i < numBins; i++) {
                const lower = binEdges[i].toFixed(2);
                const upper = binEdges[i+1].toFixed(2);
                binLabels.push(`${lower}-${upper}`);
            }
        } else {
            // Equal-width binning
            const min = sorted[0];
            const max = sorted[n-1];
            const width = (max - min) / numBins;
            
            for (let i = 0; i <= numBins; i++) {
                binEdges.push(min + i * width);
            }
            binEdges[binEdges.length - 1] += 0.001;
            
            for (let i = 0; i < numBins; i++) {
                const lower = binEdges[i].toFixed(2);
                const upper = binEdges[i+1].toFixed(2);
                binLabels.push(`${lower}-${upper}`);
            }
        }
        
        return {
            method: method === 'auto' ? 'quantile' : method,
            numBins,
            binEdges,
            binLabels
        };
    }

    /**
     * Assign values to bins
     */
    function assignToBins(values, binningInfo) {
        return values.map(value => {
            for (let i = 0; i < binningInfo.binEdges.length - 1; i++) {
                if (value >= binningInfo.binEdges[i] && value < binningInfo.binEdges[i + 1]) {
                    return i;
                }
            }
            return binningInfo.numBins - 1;
        });
    }

    /**
     * Create contingency table for chi-squared test
     */
    function createContingencyTable(clusterLabels, columnValues, columnType, binningInfo) {
        const uniqueClusters = [...new Set(clusterLabels)].sort((a, b) => a - b);
        
        let processedValues;
        let uniqueValues;
        
        if (columnType === 'scalar' && binningInfo) {
            const binnedValues = assignToBins(columnValues, binningInfo);
            processedValues = binnedValues.map(bin => binningInfo.binLabels[bin]);
            uniqueValues = binningInfo.binLabels;
        } else {
            processedValues = columnValues;
            uniqueValues = [...new Set(columnValues)].sort();
        }
        
        // Initialize contingency table
        const observed = [];
        for (let i = 0; i < uniqueClusters.length; i++) {
            observed[i] = new Array(uniqueValues.length).fill(0);
        }
        
        // Fill contingency table
        for (let i = 0; i < clusterLabels.length; i++) {
            const clusterIndex = uniqueClusters.indexOf(clusterLabels[i]);
            const valueIndex = uniqueValues.indexOf(processedValues[i]);
            if (clusterIndex >= 0 && valueIndex >= 0) {
                observed[clusterIndex][valueIndex]++;
            }
        }
        
        return {
            observed,
            rowLabels: uniqueClusters.map(c => `Cluster ${c}`),
            colLabels: uniqueValues.map(v => String(v))
        };
    }

    /**
     * Calculate expected frequencies for chi-squared test
     */
    function calculateExpectedFrequencies(observed) {
        const numRows = observed.length;
        const numCols = observed[0].length;
        
        const rowTotals = observed.map(row => row.reduce((sum, cell) => sum + cell, 0));
        const colTotals = new Array(numCols).fill(0);
        for (let col = 0; col < numCols; col++) {
            for (let row = 0; row < numRows; row++) {
                colTotals[col] += observed[row][col];
            }
        }
        const grandTotal = rowTotals.reduce((sum, total) => sum + total, 0);
        
        const expected = [];
        for (let row = 0; row < numRows; row++) {
            expected[row] = [];
            for (let col = 0; col < numCols; col++) {
                expected[row][col] = (rowTotals[row] * colTotals[col]) / grandTotal;
            }
        }
        
        return expected;
    }

    /**
     * Perform chi-squared test
     */
    function chiSquaredTest(observed, expected) {
        let chiSquared = 0;
        
        for (let row = 0; row < observed.length; row++) {
            for (let col = 0; col < observed[0].length; col++) {
                const obs = observed[row][col];
                const exp = expected[row][col];
                if (exp > 0) {
                    chiSquared += Math.pow(obs - exp, 2) / exp;
                }
            }
        }
        
        const degreesOfFreedom = (observed.length - 1) * (observed[0].length - 1);
        
        return { chiSquared, degreesOfFreedom };
    }

    /**
     * Categorize statistical significance
     */
    function categorizeSignificance(pValue) {
        if (pValue <= 0.01) return 'highly_significant';
        if (pValue <= 0.05) return 'significant';
        return 'not_significant';
    }

    /**
     * Analyze single cluster arrangement against all columns
     */
    function analyzeClusterArrangement(clusterLabels, data, clusterCount) {
        const result = {
            clusterCount,
            pValues: {},
            chiSquaredStats: {},
            significance: {}
        };
        
        // Extract column information
        const allColumns = {};
        
        data.forEach(point => {
            // Scalar columns
            if (point.scalar_columns) {
                Object.entries(point.scalar_columns).forEach(([key, value]) => {
                    if (!allColumns[key]) {
                        allColumns[key] = {values: [], type: 'scalar'};
                    }
                    allColumns[key].values.push(value);
                });
            }
            
            // Set/categorical columns
            if (point.set_columns) {
                Object.entries(point.set_columns).forEach(([key, value]) => {
                    if (!allColumns[key]) {
                        allColumns[key] = {values: [], type: 'categorical'};
                    }
                    allColumns[key].values.push(value);
                });
            }
            
            // String columns
            if (point.string_columns) {
                Object.entries(point.string_columns).forEach(([key, value]) => {
                    if (!allColumns[key]) {
                        allColumns[key] = {values: [], type: 'string'};
                    }
                    allColumns[key].values.push(value);
                });
            }
        });
        
        // Analyze each column against cluster labels
        Object.entries(allColumns).forEach(([columnName, columnData]) => {
            try {
                let binningInfo;
                
                if (columnData.type === 'scalar') {
                    binningInfo = binScalarValues(columnData.values);
                }
                
                const {observed, rowLabels, colLabels} = createContingencyTable(
                    clusterLabels,
                    columnData.values,
                    columnData.type,
                    binningInfo
                );
                
                if (observed.length < 2 || observed[0].length < 2) {
                    return;
                }
                
                const expected = calculateExpectedFrequencies(observed);
                
                                 const minExpected = Math.min(...expected.flat());
                 if (minExpected < 1) {
                     return;
                 }
                
                const {chiSquared, degreesOfFreedom} = chiSquaredTest(observed, expected);
                const pValue = chiSquaredPValue(chiSquared, degreesOfFreedom);
                
                result.pValues[columnName] = pValue;
                result.chiSquaredStats[columnName] = {
                    chiSquared,
                    pValue,
                    degreesOfFreedom,
                    expected,
                    observed,
                    columnType: columnData.type,
                    binningInfo
                };
                result.significance[columnName] = categorizeSignificance(pValue);
                
            } catch (error) {
                console.error(`Error analyzing column ${columnName}:`, error);
            }
        });
        
        return result;
    }

    /**
     * Analyze all cluster arrangements in the dataset
     */
    function analyzeAllClusterArrangements(sphereData) {
        const results = {};
        
        if (!sphereData.coords || !sphereData.entire_cluster_results) {
            console.error('Invalid sphere data format for statistical analysis');
            return results;
        }
        
        const data = sphereData.coords;
        
        Object.entries(sphereData.entire_cluster_results).forEach(([clusterCount, clusterInfo]) => {
            try {
                                 const clusterLabels = clusterInfo.cluster_labels;
                 if (!clusterLabels || clusterLabels.length !== data.length) {
                     return;
                 }
                
                const analysis = analyzeClusterArrangement(clusterLabels, data, parseInt(clusterCount));
                results[clusterCount] = analysis;
                
            } catch (error) {
                console.error(`Error analyzing cluster count ${clusterCount}:`, error);
            }
        });
        
        return results;
    }

    /**
     * Get top significant associations for a cluster arrangement
     */
    function getTopSignificantAssociations(analysis, limit = 5) {
        return Object.entries(analysis.pValues)
            .map(([column, pValue]) => ({
                column,
                pValue,
                significance: analysis.significance[column],
                chiSquared: analysis.chiSquaredStats[column].chiSquared
            }))
            .filter(item => item.significance !== 'not_significant')
            .sort((a, b) => a.pValue - b.pValue)
            .slice(0, limit);
    }

    /**
     * Format p-value for display
     */
    function formatPValue(pValue) {
        if (pValue <= 0.001) return 'p < 0.001';
        if (pValue <= 0.01) return 'p < 0.01';
        if (pValue <= 0.05) return 'p < 0.05';
        if (pValue <= 0.1) return 'p < 0.1';
        return 'p ≥ 0.1';
    }

    // Public API
    return {
        analyzeAllClusterArrangements,
        analyzeClusterArrangement,
        getTopSignificantAssociations,
        formatPValue
    };
})();

// Statistical analysis utilities loaded

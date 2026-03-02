/**
 * Matplotlib-compatible colormaps for cluster/point coloring.
 *
 * Each colormap is stored as a list of [r, g, b] control points (0-255).
 * sampleColormap() interpolates N evenly-spaced colors from the map and
 * returns them as 0xRRGGBB hex numbers ready for Three.js.
 */

// Control points sampled from matplotlib at 8 evenly-spaced positions
type RGB = [number, number, number];

const COLORMAPS: Record<string, RGB[]> = {
    // ---- Sequential ----
    viridis: [
        [68, 1, 84], [72, 36, 117], [64, 67, 135], [52, 94, 141],
        [41, 120, 142], [32, 144, 140], [34, 167, 132], [68, 190, 112],
        [121, 209, 81], [189, 222, 38], [253, 231, 37],
    ],
    plasma: [
        [13, 8, 135], [75, 3, 161], [125, 3, 168], [168, 34, 150],
        [203, 70, 121], [229, 107, 93], [248, 148, 65], [253, 195, 40],
        [240, 249, 33],
    ],
    inferno: [
        [0, 0, 4], [22, 11, 57], [66, 10, 104], [106, 23, 110],
        [147, 38, 103], [188, 55, 84], [221, 81, 58], [243, 120, 25],
        [252, 165, 10], [246, 215, 70], [252, 255, 164],
    ],
    magma: [
        [0, 0, 4], [18, 14, 54], [56, 15, 99], [99, 19, 123],
        [142, 29, 132], [182, 54, 121], [212, 92, 104], [234, 136, 102],
        [246, 182, 118], [249, 228, 167], [252, 253, 191],
    ],
    cividis: [
        [0, 32, 77], [0, 58, 108], [46, 80, 108], [87, 101, 108],
        [119, 121, 111], [151, 143, 107], [186, 165, 88], [221, 192, 60],
        [253, 222, 45],
    ],

    // ---- Diverging ----
    coolwarm: [
        [59, 76, 192], [98, 130, 234], [141, 176, 254], [184, 208, 249],
        [221, 221, 221], [245, 196, 173], [244, 154, 123], [222, 96, 77],
        [180, 4, 38],
    ],
    RdYlGn: [
        [165, 0, 38], [215, 48, 39], [244, 109, 67], [253, 174, 97],
        [254, 224, 139], [255, 255, 191], [217, 239, 139], [166, 217, 106],
        [102, 189, 99], [26, 152, 80], [0, 104, 55],
    ],
    RdYlBu: [
        [165, 0, 38], [215, 48, 39], [244, 109, 67], [253, 174, 97],
        [254, 224, 144], [255, 255, 191], [224, 243, 248], [171, 217, 233],
        [116, 173, 209], [69, 117, 180], [49, 54, 149],
    ],
    spectral: [
        [158, 1, 66], [213, 62, 79], [244, 109, 67], [253, 174, 97],
        [254, 224, 139], [255, 255, 191], [230, 245, 152], [171, 221, 164],
        [102, 194, 165], [50, 136, 189], [94, 79, 162],
    ],

    // ---- Qualitative (good for distinct clusters) ----
    tab10: [
        [31, 119, 180], [255, 127, 14], [44, 160, 44], [214, 39, 40],
        [148, 103, 189], [140, 86, 75], [227, 119, 194], [127, 127, 127],
        [188, 189, 34], [23, 190, 207],
    ],
    tab20: [
        [31, 119, 180], [174, 199, 232], [255, 127, 14], [255, 187, 120],
        [44, 160, 44], [152, 223, 138], [214, 39, 40], [255, 152, 150],
        [148, 103, 189], [197, 176, 213], [140, 86, 75], [196, 156, 148],
        [227, 119, 194], [247, 182, 210], [127, 127, 127], [199, 199, 199],
        [188, 189, 34], [219, 219, 141], [23, 190, 207], [158, 218, 229],
    ],
    Set1: [
        [228, 26, 28], [55, 126, 184], [77, 175, 74], [152, 78, 163],
        [255, 127, 0], [255, 255, 51], [166, 86, 40], [247, 129, 191],
        [153, 153, 153],
    ],
    Set2: [
        [102, 194, 165], [252, 141, 98], [141, 160, 203], [231, 138, 195],
        [166, 216, 84], [255, 217, 47], [229, 196, 148], [179, 179, 179],
    ],
    Paired: [
        [166, 206, 227], [31, 120, 180], [178, 223, 138], [51, 160, 44],
        [251, 154, 153], [227, 26, 28], [253, 191, 111], [255, 127, 0],
        [202, 178, 214], [106, 61, 154], [255, 255, 153], [177, 89, 40],
    ],
    Dark2: [
        [27, 158, 119], [217, 95, 2], [117, 112, 179], [231, 41, 138],
        [102, 166, 30], [230, 171, 2], [166, 118, 29], [102, 102, 102],
    ],
};

/**
 * Interpolate between two RGB colors.
 */
function lerpRGB(a: RGB, b: RGB, t: number): RGB {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}

/**
 * Sample N evenly-spaced colors from a colormap.
 * For qualitative maps (tab10, Set1, etc.), returns colors directly (no interpolation).
 * For sequential/diverging maps, interpolates smoothly.
 *
 * Returns colors as 0xRRGGBB hex numbers.
 */
export function sampleColormap(name: string, n: number): number[] {
    const key = name.toLowerCase();
    // Try exact match first, then case-insensitive lookup
    const points = COLORMAPS[name] || COLORMAPS[key] ||
        Object.entries(COLORMAPS).find(([k]) => k.toLowerCase() === key)?.[1];

    if (!points) return [];

    const qualitative = ['tab10', 'tab20', 'set1', 'set2', 'paired', 'dark2'];
    const isQualitative = qualitative.includes(key);

    const colors: number[] = [];

    if (isQualitative) {
        // For qualitative maps, cycle through the palette directly
        for (let i = 0; i < n; i++) {
            const [r, g, b] = points[i % points.length];
            colors.push((r << 16) | (g << 8) | b);
        }
    } else {
        // For sequential/diverging, interpolate
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0.5 : i / (n - 1);
            const scaled = t * (points.length - 1);
            const idx = Math.min(Math.floor(scaled), points.length - 2);
            const frac = scaled - idx;
            const [r, g, b] = lerpRGB(points[idx], points[idx + 1], frac);
            colors.push((r << 16) | (g << 8) | b);
        }
    }

    return colors;
}

/** Get list of available colormap names. */
export function getColormapNames(): string[] {
    return Object.keys(COLORMAPS);
}

/** Check if a colormap name is valid. */
export function isValidColormap(name: string): boolean {
    const key = name.toLowerCase();
    return !!COLORMAPS[name] || !!COLORMAPS[key] ||
        Object.keys(COLORMAPS).some(k => k.toLowerCase() === key);
}

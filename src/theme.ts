export type ThemeMode = 'dark' | 'light';

export interface SphereTheme {
    // Container / Canvas backgrounds
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgSurface: string;
    bgSurfaceHover: string;
    bgSurfaceActive: string;
    bgInset: string;
    bgOverlay: string;
    bgCanvas: string;
    bgCanvasSport: string;
    bgLoading: string;

    // Text
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textMuted: string;
    textDisabled: string;

    // Borders
    borderPrimary: string;
    borderSecondary: string;
    borderInput: string;
    borderFocus: string;

    // Accent
    accent: string;
    accentText: string;

    // Semantic
    error: string;
    errorBg: string;
    success: string;
    successBg: string;
    warning: string;
    info: string;

    // Spinner
    spinnerTrack: string;
    spinnerHead: string;

    // Charts (Plotly)
    chartBg: string;
    chartText: string;
    chartGrid: string;
    chartLine: string;

    // Data Inspector
    inspectorBg: string;
    inspectorHeaderBg: string;

    // Canvas 2D fallback
    canvas2dBg: string;
    canvas2dText: string;

    // Glassmorphism overlay (playback controller)
    glassBg: string;
    glassText: string;
    glassTextDim: string;
    glassTextMuted: string;
    glassBorder: string;
    glassAccent: string;
    glassOptionBg: string;

    // Box shadow helpers
    shadowLight: string;
    shadowMedium: string;
}

export const darkTheme: SphereTheme = {
    bgPrimary: '#1e1e1e',
    bgSecondary: '#171717',
    bgTertiary: '#141414',
    bgSurface: '#202020',
    bgSurfaceHover: '#1f1f1f',
    bgSurfaceActive: '#1a3a5c',
    bgInset: '#101010',
    bgOverlay: 'rgba(0, 0, 0, 0.6)',
    bgCanvas: '#232323',
    bgCanvasSport: '#1a1a1a',
    bgLoading: '#2a2a2a',

    textPrimary: '#e6e6e6',
    textSecondary: '#b8b8b8',
    textTertiary: '#8f8f8f',
    textMuted: '#666',
    textDisabled: '#555',

    borderPrimary: '#2a2a2a',
    borderSecondary: '#333',
    borderInput: '#2a2a2a',
    borderFocus: '#64b5f6',

    accent: '#64b5f6',
    accentText: '#141414',

    error: '#ff6b6b',
    errorBg: '#3a1b1b',
    success: '#4caf50',
    successBg: '#1b3a1b',
    warning: '#ff9800',
    info: '#00ccff',

    spinnerTrack: '#555',
    spinnerHead: '#d0d0d0',

    chartBg: '#0b0b0b',
    chartText: '#e6e6e6',
    chartGrid: 'rgba(255,255,255,0.08)',
    chartLine: 'rgba(255,255,255,0.3)',

    inspectorBg: 'rgba(20, 20, 20, 0.95)',
    inspectorHeaderBg: '#1a1a1a',

    canvas2dBg: '#0a0a0a',
    canvas2dText: 'rgba(255,255,255,0.6)',

    glassBg: 'rgba(0, 0, 0, 0.7)',
    glassText: '#999',
    glassTextDim: '#888',
    glassTextMuted: '#555',
    glassBorder: '#444',
    glassAccent: '#00bfff',
    glassOptionBg: '#222',

    shadowLight: '0 1px 0 rgba(255,255,255,0.03)',
    shadowMedium: '0 6px 16px rgba(0,0,0,0.45)',
};

export const lightTheme: SphereTheme = {
    bgPrimary: '#ffffff',
    bgSecondary: '#f5f5f5',
    bgTertiary: '#eeeeee',
    bgSurface: '#ffffff',
    bgSurfaceHover: '#f0f0f0',
    bgSurfaceActive: '#dbeafe',
    bgInset: '#fafafa',
    bgOverlay: 'rgba(0, 0, 0, 0.3)',
    bgCanvas: '#f0f0f0',
    bgCanvasSport: '#e8e8e8',
    bgLoading: '#f8f8f8',

    textPrimary: '#1a1a1a',
    textSecondary: '#555555',
    textTertiary: '#777777',
    textMuted: '#999999',
    textDisabled: '#bbbbbb',

    borderPrimary: '#e0e0e0',
    borderSecondary: '#d0d0d0',
    borderInput: '#cccccc',
    borderFocus: '#3b82f6',

    accent: '#3b82f6',
    accentText: '#ffffff',

    error: '#dc2626',
    errorBg: '#fee2e2',
    success: '#16a34a',
    successBg: '#dcfce7',
    warning: '#ea580c',
    info: '#0284c7',

    spinnerTrack: '#e0e0e0',
    spinnerHead: '#3498db',

    chartBg: '#ffffff',
    chartText: '#333333',
    chartGrid: 'rgba(0,0,0,0.08)',
    chartLine: 'rgba(0,0,0,0.2)',

    inspectorBg: 'rgba(255, 255, 255, 0.97)',
    inspectorHeaderBg: '#f5f5f5',

    canvas2dBg: '#f0f0f0',
    canvas2dText: 'rgba(0,0,0,0.6)',

    glassBg: 'rgba(255, 255, 255, 0.85)',
    glassText: '#666',
    glassTextDim: '#777',
    glassTextMuted: '#aaa',
    glassBorder: '#ccc',
    glassAccent: '#3b82f6',
    glassOptionBg: '#f5f5f5',

    shadowLight: '0 1px 0 rgba(0,0,0,0.04)',
    shadowMedium: '0 6px 16px rgba(0,0,0,0.12)',
};

export function getTheme(mode: ThemeMode): SphereTheme {
    return mode === 'light' ? lightTheme : darkTheme;
}

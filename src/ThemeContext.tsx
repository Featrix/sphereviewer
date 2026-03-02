import React, { createContext, useContext, useMemo } from 'react';
import { SphereTheme, ThemeMode, getTheme } from './theme';

interface ThemeContextValue {
    theme: SphereTheme;
    mode: ThemeMode;
    backgroundColor?: string;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: getTheme('dark'),
    mode: 'dark',
});

export function useTheme(): ThemeContextValue {
    return useContext(ThemeContext);
}

export const ThemeProvider: React.FC<{
    mode: ThemeMode;
    backgroundColor?: string;
    children: React.ReactNode;
}> = ({ mode, backgroundColor, children }) => {
    const value = useMemo(() => ({
        theme: getTheme(mode),
        mode,
        backgroundColor,
    }), [mode, backgroundColor]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

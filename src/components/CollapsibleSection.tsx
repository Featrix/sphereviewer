import React, { useState, useCallback } from 'react';
import { useTheme } from '../ThemeContext';

// Safe localStorage utilities - NEVER crash on read/write failures
const STORAGE_KEY_PREFIX = 'featrix_section_';

function safeGetStorage(key: string, defaultValue: boolean): boolean {
    try {
        const item = localStorage.getItem(STORAGE_KEY_PREFIX + key);
        if (item === null) return defaultValue;
        return JSON.parse(item) as boolean;
    } catch {
        return defaultValue;
    }
}

function safeSetStorage(key: string, value: boolean): void {
    try {
        localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(value));
    } catch {
        // silently ignore
    }
}

interface CollapsibleSectionProps {
    title: string;
    defaultOpen?: boolean;
    storageKey?: string; // Optional key to persist open/closed state
    children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    defaultOpen = true,
    storageKey,
    children
}) => {
    const { theme } = useTheme();

    // If storageKey provided, use persisted state; otherwise use regular state
    const [isOpen, setIsOpenInternal] = useState(() => {
        if (storageKey) {
            return safeGetStorage(storageKey, defaultOpen);
        }
        return defaultOpen;
    });
    const [isHovered, setIsHovered] = useState(false);

    const setIsOpen = useCallback((open: boolean) => {
        setIsOpenInternal(open);
        if (storageKey) {
            safeSetStorage(storageKey, open);
        }
    }, [storageKey]);

    return (
        <div style={{ marginBottom: 0 }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '0 12px',
                    background: isHovered ? theme.bgSurfaceHover : theme.bgSecondary,
                    borderBottom: `1px solid ${theme.borderPrimary}`,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background 100ms ease',
                }}
            >
                <span style={{
                    color: theme.textTertiary,
                    fontSize: '10px',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms ease',
                    width: '10px',
                    flexShrink: 0,
                }}>
                    {'\u25B6'}
                </span>
                <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    color: isOpen ? theme.textPrimary : theme.textSecondary,
                    textTransform: 'uppercase',
                    transition: 'color 100ms ease',
                }}>
                    {title}
                </span>
            </div>
            {isOpen && (
                <div style={{
                    margin: '8px 10px 10px 22px',
                    paddingLeft: '16px',
                    paddingRight: '12px',
                    paddingTop: '12px',
                    paddingBottom: '14px',
                    background: theme.bgInset,
                    borderRadius: '8px',
                    border: `1px solid ${theme.borderPrimary}`,
                    boxShadow: `${theme.shadowLight}, ${theme.shadowMedium}`,
                }}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default CollapsibleSection;

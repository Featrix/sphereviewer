import React, { useState, useCallback } from 'react';

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
                    background: isHovered ? '#1f1f1f' : '#191919',
                    borderBottom: '1px solid #2a2a2a',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background 100ms ease',
                }}
            >
                <span style={{
                    color: '#8f8f8f',
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
                    color: isOpen ? '#e6e6e6' : '#b8b8b8',
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
                    background: '#101010',
                    borderRadius: '8px',
                    border: '1px solid #2b2b2b',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 6px 16px rgba(0,0,0,0.45)',
                }}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default CollapsibleSection;

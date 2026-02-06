import React, { useState } from 'react';

interface CollapsibleSectionProps {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
    title,
    defaultOpen = true,
    children
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div style={{ marginBottom: 0 }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    background: '#181818',
                    borderBottom: '1px solid #2a2a2a',
                    cursor: 'pointer',
                    userSelect: 'none',
                }}
            >
                <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    color: '#d8d8d8',
                    textTransform: 'uppercase',
                }}>
                    {title}
                </span>
                <span style={{
                    color: '#9aa0a6',
                    fontSize: '10px',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms ease',
                }}>
                    {'\u25B6'}
                </span>
            </div>
            {isOpen && (
                <div style={{ padding: '12px' }}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default CollapsibleSection;

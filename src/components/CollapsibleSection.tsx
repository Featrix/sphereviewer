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
                    color: '#b0b0b0',
                    textTransform: 'uppercase',
                }}>
                    {title}
                </span>
                <span style={{
                    color: '#8a8a8a',
                    fontSize: '10px',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms ease',
                }}>
                    {'\u25B6'}
                </span>
            </div>
            {isOpen && (
                <div style={{
                    paddingLeft: '16px',
                    paddingRight: '12px',
                    paddingTop: '8px',
                    paddingBottom: '16px',
                    background: '#1f1f1f',
                }}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default CollapsibleSection;

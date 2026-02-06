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
        <div style={{ marginBottom: '16px' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 0',
                    borderBottom: '1px solid #444',
                    userSelect: 'none',
                }}
            >
                <span style={{ color: '#888', fontSize: '12px', width: '12px' }}>
                    {isOpen ? '▼' : '▶'}
                </span>
                {title}
            </div>
            {isOpen && (
                <div style={{ paddingTop: '12px' }}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default CollapsibleSection;

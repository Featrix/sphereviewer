import React from 'react';
interface HeadingProps {
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    className?: string;
    children: React.ReactNode;
}
export declare function Heading({ level, className, children, ...props }: HeadingProps): import("react/jsx-runtime").JSX.Element;
export declare function Subheading({ className, children, ...props }: Omit<HeadingProps, 'level'>): import("react/jsx-runtime").JSX.Element;
export {};

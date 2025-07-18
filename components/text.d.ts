import React from 'react';
interface TextProps {
    className?: string;
    children: React.ReactNode;
}
export declare function Text({ className, children, ...props }: TextProps): import("react/jsx-runtime").JSX.Element;
interface TextLinkProps {
    href: string;
    className?: string;
    children: React.ReactNode;
    target?: string;
    rel?: string;
}
export declare function TextLink({ href, className, children, ...props }: TextLinkProps): import("react/jsx-runtime").JSX.Element;
export type TextColor = 'gray' | 'red' | 'blue' | 'green' | 'yellow' | 'purple';
export {};

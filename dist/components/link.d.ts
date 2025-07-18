import React from 'react';
interface LinkProps {
    href: string;
    className?: string;
    children: React.ReactNode;
    target?: string;
    rel?: string;
}
export declare const Link: React.ForwardRefExoticComponent<LinkProps & React.RefAttributes<HTMLAnchorElement>>;
export {};

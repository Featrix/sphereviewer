import React from 'react';
interface TableProps {
    children: React.ReactNode;
    className?: string;
    dense?: boolean;
    striped?: boolean;
}
export declare function Table({ children, className, dense, striped, ...props }: TableProps): import("react/jsx-runtime").JSX.Element;
export declare function TableHead({ children, className, ...props }: {
    children: React.ReactNode;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function TableBody({ children, className, ...props }: {
    children: React.ReactNode;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function TableRow({ children, className, ...props }: {
    children: React.ReactNode;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function TableHeader({ children, className, ...props }: {
    children?: React.ReactNode;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export declare function TableCell({ children, className, ...props }: {
    children?: React.ReactNode;
    className?: string;
}): import("react/jsx-runtime").JSX.Element;
export {};

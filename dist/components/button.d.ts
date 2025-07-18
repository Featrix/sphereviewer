import * as Headless from '@headlessui/react';
import React from 'react';
import { Link } from './link';
declare const styles: {
    base: string[];
    solid: string[];
    outline: string[];
    plain: string[];
    colors: {
        'dark/zinc': string[];
        light: string[];
        'dark/white': string[];
        dark: string[];
        white: string[];
        zinc: string[];
        indigo: string[];
        cyan: string[];
        red: string[];
        orange: string[];
        amber: string[];
        yellow: string[];
        lime: string[];
        green: string[];
        emerald: string[];
        teal: string[];
        sky: string[];
        blue: string[];
        violet: string[];
        purple: string[];
        fuchsia: string[];
        pink: string[];
        rose: string[];
    };
};
type ButtonProps = ({
    color?: keyof typeof styles.colors;
    outline?: never;
    plain?: never;
} | {
    color?: never;
    outline: true;
    plain?: never;
} | {
    color?: never;
    outline?: never;
    plain: true;
}) & {
    className?: string;
    children: React.ReactNode;
} & (Omit<Headless.ButtonProps, 'as' | 'className'> | Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>);
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLElement>>;
/**
 * Expand the hit area to at least 44×44px on touch devices
 */
export declare function TouchTarget({ children }: {
    children: React.ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export {};

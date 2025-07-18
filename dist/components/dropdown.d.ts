import * as Headless from '@headlessui/react';
import type React from 'react';
import { Button } from './button';
import { Link } from './link';
export declare function Dropdown(props: Headless.MenuProps): import("react/jsx-runtime").JSX.Element;
export declare function DropdownButton<T extends React.ElementType = typeof Button>({ as, ...props }: {
    className?: string;
} & Omit<Headless.MenuButtonProps<T>, 'className'>): import("react/jsx-runtime").JSX.Element;
export declare function DropdownMenu({ anchor, className, ...props }: {
    className?: string;
} & Omit<Headless.MenuItemsProps, 'as' | 'className'>): import("react/jsx-runtime").JSX.Element;
export declare function DropdownItem({ className, ...props }: {
    className?: string;
} & (Omit<Headless.MenuItemProps<'button'>, 'as' | 'className'> | Omit<Headless.MenuItemProps<typeof Link>, 'as' | 'className'>)): import("react/jsx-runtime").JSX.Element;
export declare function DropdownHeader({ className, ...props }: React.ComponentPropsWithoutRef<'div'>): import("react/jsx-runtime").JSX.Element;
export declare function DropdownSection({ className, ...props }: {
    className?: string;
} & Omit<Headless.MenuSectionProps, 'as' | 'className'>): import("react/jsx-runtime").JSX.Element;
export declare function DropdownHeading({ className, ...props }: {
    className?: string;
} & Omit<Headless.MenuHeadingProps, 'as' | 'className'>): import("react/jsx-runtime").JSX.Element;
export declare function DropdownDivider({ className, ...props }: {
    className?: string;
} & Omit<Headless.MenuSeparatorProps, 'as' | 'className'>): import("react/jsx-runtime").JSX.Element;
export declare function DropdownLabel({ className, ...props }: {
    className?: string;
} & Omit<Headless.LabelProps, 'as' | 'className'>): import("react/jsx-runtime").JSX.Element;
export declare function DropdownDescription({ className, ...props }: {
    className?: string;
} & Omit<Headless.DescriptionProps, 'as' | 'className'>): import("react/jsx-runtime").JSX.Element;
export declare function DropdownShortcut({ keys, className, ...props }: {
    keys: string | string[];
    className?: string;
} & Omit<Headless.DescriptionProps<'kbd'>, 'as' | 'className'>): import("react/jsx-runtime").JSX.Element;

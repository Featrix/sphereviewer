import React from 'react';
import clsx from 'clsx';

interface HeadingProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  children: React.ReactNode;
}

export function Heading({ level = 1, className, children, ...props }: HeadingProps) {
  const Component = `h${level}` as keyof JSX.IntrinsicElements;
  
  const baseStyles = {
    1: 'text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl',
    2: 'text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl',
    3: 'text-xl font-bold tracking-tight text-gray-900 sm:text-2xl',
    4: 'text-lg font-bold tracking-tight text-gray-900 sm:text-xl',
    5: 'text-base font-bold tracking-tight text-gray-900 sm:text-lg',
    6: 'text-sm font-bold tracking-tight text-gray-900 sm:text-base',
  };

  return (
    <Component
      className={clsx(baseStyles[level], className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Subheading({ className, children, ...props }: Omit<HeadingProps, 'level'>) {
  return (
    <h3 
      className={clsx('text-lg font-semibold text-gray-800', className)}
      {...props}
    >
      {children}
    </h3>
  );
} 
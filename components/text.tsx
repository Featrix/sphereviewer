import React from 'react';
import clsx from 'clsx';

interface TextProps {
  className?: string;
  children: React.ReactNode;
}

export function Text({ className, children, ...props }: TextProps) {
  return (
    <p className={clsx('text-gray-700 leading-6', className)} {...props}>
      {children}
    </p>
  );
}

interface TextLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
}

export function TextLink({ href, className, children, ...props }: TextLinkProps) {
  return (
    <a
      href={href}
      className={clsx(
        'text-blue-600 hover:text-blue-800 underline transition-colors',
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export type TextColor = 'gray' | 'red' | 'blue' | 'green' | 'yellow' | 'purple'; 
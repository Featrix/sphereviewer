import React from 'react';
import clsx from 'clsx';

interface LinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, className, children, ...props }, ref) => {
    return (
      <a
        ref={ref}
        href={href}
        className={clsx('transition-colors', className)}
        {...props}
      >
        {children}
      </a>
    );
  }
);

Link.displayName = 'Link'; 
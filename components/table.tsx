import React from 'react';
import clsx from 'clsx';

interface TableProps {
  children: React.ReactNode;
  className?: string;
  dense?: boolean;
  striped?: boolean;
}

export function Table({ children, className, dense, striped, ...props }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className={clsx(
          'min-w-full divide-y divide-gray-200',
          {
            'text-sm': dense,
            'text-base': !dense,
          },
          className
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children, className, ...props }: { children: React.ReactNode; className?: string }) {
  return (
    <thead className={clsx('bg-gray-50', className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className, ...props }: { children: React.ReactNode; className?: string }) {
  return (
    <tbody className={clsx('bg-white divide-y divide-gray-200', className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className, ...props }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={clsx('hover:bg-gray-50', className)} {...props}>
      {children}
    </tr>
  );
}

export function TableHeader({ children, className, ...props }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={clsx(
        'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, className, ...props }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={clsx('px-6 py-4 whitespace-nowrap text-sm text-gray-900', className)} {...props}>
      {children}
    </td>
  );
} 
import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/cn';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, options, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        'w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
});

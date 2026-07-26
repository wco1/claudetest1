import { useFocusable } from '../nav/useFocusable';

interface Props {
  children: React.ReactNode;
  onSelect: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'icon';
  group?: string;
  autoFocus?: boolean;
  priority?: number;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function Button({
  children, onSelect, variant = 'default', group, autoFocus, priority, disabled, className, title,
}: Props) {
  const { props } = useFocusable<HTMLButtonElement>({
    group,
    autoFocus,
    priority,
    disabled,
    onSelect,
  });

  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      className={classes}
      title={title}
      disabled={disabled}
      {...(disabled ? { 'data-focus-disabled': 'true' } : {})}
    >
      {children}
    </button>
  );
}

import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive-text';
  type?: 'button' | 'submit';
}

export function Button({ variant, type = 'button', className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-variant={variant}
      className={[styles.button, className].filter(Boolean).join(' ')}
    />
  );
}

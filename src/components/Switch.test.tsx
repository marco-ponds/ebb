import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Segmented, Switch } from '.';

describe('Switch', () => {
  it('has role switch with aria-checked and toggles on click and Space', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Keep screen awake" description="Stops the phone dimming" tone="mint" />);
    const sw = screen.getByRole('switch', { name: 'Keep screen awake' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toHaveAccessibleDescription('Stops the phone dimming');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenLastCalledWith(true);
    sw.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('reflects checked state', () => {
    render(<Switch checked onChange={() => {}} label="Gentle buzz" tone="butter" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Segmented', () => {
  const options = [
    { value: 'night', label: 'Night' },
    { value: 'day', label: 'Day' },
    { value: 'system', label: 'Match phone' },
  ];

  it('is a radiogroup with aria-checked radios', () => {
    render(<Segmented label="Look" options={options} value="day" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Look' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Night' })).toHaveAttribute('aria-checked', 'false');
  });

  it('moves with arrow keys, wrapping, and uses a roving tab stop', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Look" options={options} value="night" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Night' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Day' })).toHaveAttribute('tabindex', '-1');
    screen.getByRole('radio', { name: 'Night' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('day');
  });

  it('wraps from the first option to the last with ArrowLeft', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Look" options={options} value="night" onChange={onChange} />);
    screen.getByRole('radio', { name: 'Night' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('system');
  });

  it('selects on click', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Look" options={options} value="night" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Match phone' }));
    expect(onChange).toHaveBeenCalledWith('system');
  });
});

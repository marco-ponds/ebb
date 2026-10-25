import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DurationField, TimeField } from '.';
import { resolveTime } from './TimeField/TimeField';

const at = (h: number, m: number, dayOffset = 0) => new Date(2026, 9, 25 + dayOffset, h, m, 0, 0).getTime();

describe('resolveTime', () => {
  it('picks the occurrence nearest the reference across midnight', () => {
    expect(resolveTime('23:50', at(0, 10))).toBe(at(23, 50, -1));
    expect(resolveTime('00:10', at(23, 50))).toBe(at(0, 10, 1));
    expect(resolveTime('12:00', at(10, 0))).toBe(at(12, 0));
  });

  it('returns null for empty input', () => {
    expect(resolveTime('', at(1, 0))).toBeNull();
  });
});

describe('TimeField', () => {
  it('shows the value as local HH:mm and emits an epoch near the reference', () => {
    const onChange = vi.fn();
    render(<TimeField label="Start" value={at(23, 30)} reference={at(0, 5, 1)} onChange={onChange} />);
    const input = screen.getByLabelText('Start') as HTMLInputElement;
    expect(input.type).toBe('time');
    expect(input.value).toBe('23:30');
    fireEvent.change(input, { target: { value: '23:55' } });
    expect(onChange).toHaveBeenCalledWith(at(23, 55));
  });

  it('clamps to min and max', () => {
    const onChange = vi.fn();
    render(<TimeField label="End" value={at(10, 0)} reference={at(10, 0)} min={at(9, 0)} max={at(11, 0)} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '12:30' } });
    expect(onChange).toHaveBeenCalledWith(at(11, 0));
  });
});

describe('DurationField', () => {
  it('splits into minutes and seconds and recombines', () => {
    const onChange = vi.fn();
    render(<DurationField label="Length" valueMs={62_000} onChange={onChange} />);
    const min = screen.getByLabelText('Length minutes') as HTMLInputElement;
    const sec = screen.getByLabelText('Length seconds') as HTMLInputElement;
    expect(min.value).toBe('1');
    expect(sec.value).toBe('2');
    fireEvent.change(sec, { target: { value: '45' } });
    expect(onChange).toHaveBeenLastCalledWith(105_000);
    fireEvent.change(min, { target: { value: '3' } });
    expect(onChange).toHaveBeenLastCalledWith(182_000);
  });

  it('clamps seconds to 0-59 and ignores negatives', () => {
    const onChange = vi.fn();
    render(<DurationField label="Length" valueMs={0} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Length seconds'), { target: { value: '99' } });
    expect(onChange).toHaveBeenLastCalledWith(59_000);
    fireEvent.change(screen.getByLabelText('Length minutes'), { target: { value: '-4' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});

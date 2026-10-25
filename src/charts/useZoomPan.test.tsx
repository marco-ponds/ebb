import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useZoomPan } from '.';
import { installPointerEvent } from './pointerPolyfill';

const full: [number, number] = [0, 1000];

function Surface(props: { domain: [number, number]; onChange: (d: [number, number]) => void; onPreview?: (d: [number, number]) => void }) {
  const { bind } = useZoomPan({ fullDomain: full, ...props });
  return <div data-testid="s" {...bind} />;
}

describe('useZoomPan', () => {
  beforeAll(installPointerEvent);
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => ({}),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const flush = () => act(() => void vi.advanceTimersByTime(20));

  it('pans with one pointer, moving the domain opposite to the drag', () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Surface domain={[200, 400]} onChange={onChange} />);
    const el = getByTestId('s');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 60 }); // 10 % of width = 20 ms to the left
    flush();
    expect(onChange).toHaveBeenLastCalledWith([180, 380]);
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 60 });
  });

  it('clamps panning to the full domain', () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Surface domain={[0, 200]} onChange={onChange} />);
    const el = getByTestId('s');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 90 });
    flush();
    expect(onChange).toHaveBeenLastCalledWith([0, 200]);
  });

  it('coalesces moves into one onChange per animation frame', () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Surface domain={[200, 400]} onChange={onChange} />);
    const el = getByTestId('s');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50 });
    for (let x = 51; x < 60; x++) fireEvent.pointerMove(el, { pointerId: 1, clientX: x });
    expect(onChange).not.toHaveBeenCalled();
    flush();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('zooms in when two pointers move apart, clamped to the full domain', () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Surface domain={[200, 600]} onChange={onChange} />);
    const el = getByTestId('s');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 40 });
    fireEvent.pointerDown(el, { pointerId: 2, clientX: 60 });
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 80 }); // distance 20 -> 40: span halves
    flush();
    const [a, b] = onChange.mock.calls.at(-1)![0] as [number, number];
    expect(b - a).toBeCloseTo(200, 5);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(1000);
  });

  it('never zooms out past the full domain', () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Surface domain={[200, 600]} onChange={onChange} />);
    const el = getByTestId('s');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 30 });
    fireEvent.pointerDown(el, { pointerId: 2, clientX: 70 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 49 });
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 50 }); // pinch in hard: span would be 16 000
    flush();
    expect(onChange).toHaveBeenLastCalledWith([0, 1000]);
  });

  it('resets to the full domain on double tap', () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Surface domain={[200, 400]} onChange={onChange} />);
    const el = getByTestId('s');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50 });
    act(() => void vi.advanceTimersByTime(120));
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 51 });
    expect(onChange).toHaveBeenLastCalledWith(full);
  });

  it('does not reset when the second tap is slow', () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Surface domain={[200, 400]} onChange={onChange} />);
    const el = getByTestId('s');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 50 });
    act(() => void vi.advanceTimersByTime(600));
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with onPreview, previews during the gesture and commits once at the end', () => {
    const onChange = vi.fn();
    const onPreview = vi.fn();
    const { getByTestId } = render(<Surface domain={[200, 400]} onChange={onChange} onPreview={onPreview} />);
    const el = getByTestId('s');
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 50 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 60 });
    flush();
    expect(onPreview).toHaveBeenLastCalledWith([180, 380]);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 60 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([180, 380]);
  });

  it('exposes touch-action none so the browser does not scroll under the gesture', () => {
    const { result } = renderHook(() => useZoomPan({ fullDomain: full, domain: full, onChange: () => {} }));
    expect(result.current.bind.style.touchAction).toBe('none');
  });
});

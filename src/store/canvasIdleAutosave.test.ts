import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasIdleAutosave, bindCanvasAutosaveActivity } from './canvasIdleAutosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function fixture() {
  const save = vi.fn();
  const autosave = new CanvasIdleAutosave(() => 400, save);
  const target = new EventTarget() as Window;
  const unbind = bindCanvasAutosaveActivity(target, autosave);
  const send = (type: string, properties: Record<string, unknown> = {}) => {
    const event = new Event(type);
    Object.assign(event, properties);
    target.dispatchEvent(event);
  };
  return { autosave, save, send, unbind };
}

describe('canvas idle autosave', () => {
  it('cancels a pending save throughout a held node drag and saves once after release', () => {
    const { autosave, save } = fixture();
    autosave.request();
    vi.advanceTimersByTime(300);
    autosave.setActive('node', true);
    autosave.request();
    vi.advanceTimersByTime(10_000);
    expect(save).not.toHaveBeenCalled();
    autosave.setActive('node', false);
    vi.advanceTimersByTime(399);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('waits for overlapping pointer, keyboard and viewport interactions to all end', () => {
    const { autosave, save, send } = fixture();
    autosave.request();
    send('keydown', { code: 'Space' });
    send('pointerdown', { pointerId: 1 });
    autosave.setActive('viewport', true);
    send('pointerup', { pointerId: 1 });
    send('keyup', { code: 'Space' });
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    autosave.setActive('viewport', false);
    vi.advanceTimersByTime(400);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it.each(['wheel', 'input', 'click', 'contextmenu'])(
    'restarts the quiet delay after %s',
    (type) => {
      const { autosave, save, send } = fixture();
      autosave.request();
      vi.advanceTimersByTime(300);
      send(type);
      vi.advanceTimersByTime(399);
      expect(save).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(save).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps Chinese input composition active between keystrokes', () => {
    const { autosave, save, send } = fixture();
    autosave.request();
    send('compositionstart');
    send('input');
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
    send('compositionend');
    vi.advanceTimersByTime(400);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not create writes for selection, pan or zoom when no data is dirty', () => {
    const { autosave, save, send } = fixture();
    send('click');
    send('wheel');
    autosave.setActive('viewport', true);
    autosave.setActive('viewport', false);
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it('handles pointer cancellation and window blur without leaving saving stuck', () => {
    const { autosave, save, send } = fixture();
    autosave.request();
    send('pointerdown', { pointerId: 1 });
    send('pointerdown', { pointerId: 2 });
    send('pointercancel', { pointerId: 1 });
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    send('keydown', { code: 'Space' });
    autosave.setActive('node', true);
    send('blur');
    vi.advanceTimersByTime(400);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('ignores passive hover and cancels pending saves when explicitly flushed/disposed', () => {
    const { autosave, save, send, unbind } = fixture();
    autosave.request();
    vi.advanceTimersByTime(300);
    send('pointermove', { buttons: 0 });
    vi.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledTimes(1);
    autosave.request();
    unbind();
    autosave.cancel();
    send('input');
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

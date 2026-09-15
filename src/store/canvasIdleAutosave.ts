/** Coalesce dirty state until every interaction has ended and the quiet delay has elapsed. */
export class CanvasIdleAutosave {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private active = new Set<string>();
  private lastActivity = -Infinity;
  private readonly delay: () => number;
  private readonly save: () => void;

  constructor(delay: () => number, save: () => void) {
    this.delay = delay;
    this.save = save;
  }

  isIdle() {
    return this.active.size === 0 && Date.now() - this.lastActivity >= this.delay();
  }

  request() {
    this.dirty = true;
    this.activity();
  }

  activity() {
    this.lastActivity = Date.now();
    this.schedule();
  }

  setActive(source: string, active: boolean) {
    if (active) this.active.add(source);
    else this.active.delete(source);
    this.activity();
  }

  endInteractions() {
    this.active.clear();
    this.activity();
  }

  cancel() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.dirty = false;
  }

  private schedule() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.dirty || this.active.size > 0) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        if (!this.isIdle()) {
          this.schedule();
          return;
        }
        this.dirty = false;
        this.save();
      },
      Math.max(0, this.delay() - (Date.now() - this.lastActivity)),
    );
  }
}

/** Capture on window so portaled editors and controls that stop propagation count too. */
export function bindCanvasAutosaveActivity(target: Window, autosave: CanvasIdleAutosave) {
  const pointers = new Set<number>();
  const keys = new Set<string>();
  const activity = () => autosave.activity();
  const pointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    autosave.setActive('pointer', true);
  };
  const pointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    autosave.setActive('pointer', pointers.size > 0);
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.buttons > 0) activity();
  };
  const keyDown = (event: KeyboardEvent) => {
    keys.add(event.code || event.key);
    autosave.setActive('keyboard', true);
  };
  const keyUp = (event: KeyboardEvent) => {
    keys.delete(event.code || event.key);
    autosave.setActive('keyboard', keys.size > 0);
  };
  const compositionStart = () => autosave.setActive('composition', true);
  const compositionEnd = () => autosave.setActive('composition', false);
  const blur = () => {
    pointers.clear();
    keys.clear();
    autosave.endInteractions();
  };
  const options = { capture: true, passive: true };
  target.addEventListener('pointerdown', pointerDown, options);
  target.addEventListener('pointerup', pointerUp, options);
  target.addEventListener('pointercancel', pointerUp, options);
  target.addEventListener('pointermove', pointerMove, options);
  target.addEventListener('keydown', keyDown, options);
  target.addEventListener('keyup', keyUp, options);
  target.addEventListener('compositionstart', compositionStart, options);
  target.addEventListener('compositionend', compositionEnd, options);
  for (const name of ['wheel', 'input', 'click', 'contextmenu']) {
    target.addEventListener(name, activity, options);
  }
  target.addEventListener('blur', blur);
  return () => {
    target.removeEventListener('pointerdown', pointerDown, true);
    target.removeEventListener('pointerup', pointerUp, true);
    target.removeEventListener('pointercancel', pointerUp, true);
    target.removeEventListener('pointermove', pointerMove, true);
    target.removeEventListener('keydown', keyDown, true);
    target.removeEventListener('keyup', keyUp, true);
    target.removeEventListener('compositionstart', compositionStart, true);
    target.removeEventListener('compositionend', compositionEnd, true);
    for (const name of ['wheel', 'input', 'click', 'contextmenu']) {
      target.removeEventListener(name, activity, true);
    }
    target.removeEventListener('blur', blur);
    blur();
  };
}

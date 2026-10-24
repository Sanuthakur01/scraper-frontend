import { useRef, type MouseEvent, type PointerEvent } from 'react';

// Props for a button that acts as soon as it is pressed with a mouse or pen, not when the press is let go:
// a click only counts when the button is pressed AND released on it, so a release that lands elsewhere
// (the button shifted a pixel, the hand moved, something on the page moved) was lost and needed a second
// click. The text box being typed in keeps the focus while the button is pressed. The keyboard (Enter or
// Space on the button) and touch screens (where a press may start a scroll) act on the click as usual.
// The action must ignore being called while it is already running (e.g. a save in progress).
export function usePressAction(action: () => void) {
  const pressed = useRef(false); // acted on the press: the click that follows is the same press
  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || event.pointerType === 'touch') {
        pressed.current = false;
        return;
      }
      event.preventDefault();
      pressed.current = true;
      action();
    },
    onMouseDown: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(), // the focus stays where it is
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (event.detail !== 0 && pressed.current) {
        pressed.current = false;
        return;
      }
      pressed.current = false;
      action();
    },
  };
}

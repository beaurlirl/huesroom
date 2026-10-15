/**
 * Keyboard and gamepad movement through the home menu: focus walks its buttons and links in page order. Enter (or the pad's A) presses the one in focus.
 * The menu's root carries `data-menu`; the button to start on carries `data-primary` (the location that loaded: play).
 */
const items = () => [...document.querySelectorAll<HTMLElement>("[data-menu] button, [data-menu] a[href]")].filter((e) => e.offsetParent !== null);

export function focusMenuPrimary() {
  (document.querySelector<HTMLElement>("[data-menu] [data-primary]") ?? items()[0])?.focus();
}

export function moveMenuFocus(step: 1 | -1) {
  const list = items();
  if (!list.length) return;
  const at = list.indexOf(document.activeElement as HTMLElement);
  list[at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length].focus();
}

/** Presses whatever has focus in the menu (the primary button if nothing does). Returns whether there was something to press. */
export function pressMenuFocus() {
  const el = items().includes(document.activeElement as HTMLElement) ? (document.activeElement as HTMLElement) : document.querySelector<HTMLElement>("[data-menu] [data-primary]");
  el?.click();
  return !!el;
}

/**
 * The plain address (no `?level=`, `?test` or `?debug`) opens the home menu, and nothing of a level is loaded behind it: choosing a location loads that one.
 * Every other address goes straight into the game (`?level=<id>` plays that level; the tests and the debug view use the others).
 */
export function isMenuAddress(search: string) {
  const q = new URLSearchParams(search);
  return !q.has("level") && !q.has("test") && !q.has("debug");
}

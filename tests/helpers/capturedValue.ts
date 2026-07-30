/**
 * Restores the declared type of a value a callback captured.
 *
 * TypeScript narrows `let x: T | null = null` to `null` at every later read when
 * the only assignment happens inside a callback it cannot order. The read then
 * collapses: `x?.field` reports "does not exist on type 'never'", and `x?.()`
 * reports "this expression is not callable". Neither is a real defect -- the
 * callback does run -- but the assertions after it stop being checked.
 *
 * Passing the variable through a parameter re-widens it to what it was declared
 * as, so those assertions are checked again.
 */
export function captured<T>(value: T | null | undefined): T | null | undefined {
  return value;
}

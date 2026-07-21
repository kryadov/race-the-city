/**
 * Geometry of the round buttons stacked in the top-right corner (the pause and
 * the ? help button). They share one anchor so the row stays flush to the edge:
 * button 0 sits at the edge, each next one a button-width-plus-gap further in.
 *
 * This used to be three hard-coded `right:` offsets that assumed an in-game
 * settings button led the row. When settings moved into the menu panel, the two
 * survivors kept their old offsets and drifted a slot in from the edge. Deriving
 * every offset from one function keeps them packed against the corner, and the
 * unit test below pins it so the row can't silently drift again.
 */

/** px from the screen edge to the first (rightmost) button. */
export const CORNER_EDGE = 16
/** button width/height, px. */
export const CORNER_SIZE = 44
/** gap between adjacent buttons, px. */
export const CORNER_GAP = 8

/** The `right` offset (px) of the i-th top-right button, 0 = flush to the edge. */
export function cornerRight(i: number): number {
  return CORNER_EDGE + i * (CORNER_SIZE + CORNER_GAP)
}

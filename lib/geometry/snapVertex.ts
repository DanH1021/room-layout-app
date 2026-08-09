/**
 * Axis-snapping for boundary vertex dragging in the floor-plan upload
 * wizard. Sales reps trace room outlines by eye on top of an uploaded
 * floor-plan image, and walls that are actually straight almost always
 * come out very slightly off-axis. On drag release we check the dragged
 * vertex's angle against each of its two polygon neighbors and, if a
 * segment is within a small threshold of perfectly horizontal or
 * vertical, snap the dragged vertex so that segment becomes exactly
 * horizontal/vertical — adjusting only the axis that needs correcting.
 */

const SNAP_THRESHOLD_DEG = 4;

type Point = { x: number; y: number };

/** Angle of the segment from `a` to `b`, in degrees, range (-180, 180]. */
function segmentAngleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/**
 * Distance (in degrees) from `angle` to the nearest axis-aligned angle
 * (0, 90, 180, 270/-90). Always in [0, 45].
 */
function distanceFromAxisDeg(angle: number): number {
  const normalized = ((angle % 90) + 90) % 90; // fold into [0, 90)
  return Math.min(normalized, 90 - normalized);
}

/** Is the segment from `a` to `b` closer to horizontal or to vertical? */
function isCloserToHorizontal(a: Point, b: Point): boolean {
  const angle = segmentAngleDeg(a, b);
  // Fold to [0, 180) then measure distance to 0/180 (horizontal) vs 90 (vertical).
  const folded = ((angle % 180) + 180) % 180;
  const distToHorizontal = Math.min(folded, 180 - folded);
  const distToVertical = Math.abs(folded - 90);
  return distToHorizontal < distToVertical;
}

/**
 * Given a polygon's points and the index of a vertex that was just dragged,
 * returns a new points array with that vertex's coordinate snapped toward
 * its neighbors when the resulting segment is within `SNAP_THRESHOLD_DEG`
 * of perfectly horizontal or vertical. Only the dragged vertex is changed;
 * the rest of the polygon is returned unmodified (by reference).
 *
 * Each neighbor is considered independently: a neighbor whose segment is
 * near-horizontal snaps the dragged vertex's `y` to the neighbor's `y`; a
 * near-vertical neighbor snaps `x` to the neighbor's `x`. If both neighbors
 * qualify for the same axis, the one whose angle is closer to perfectly
 * straight wins.
 */
export function snapVertexToNeighbors(points: Point[], draggedIndex: number): Point[] {
  const n = points.length;
  if (n < 3 || draggedIndex < 0 || draggedIndex >= n) return points;

  const dragged = points[draggedIndex];
  const prevIdx = (draggedIndex - 1 + n) % n;
  const nextIdx = (draggedIndex + 1) % n;
  const neighbors = [points[prevIdx], points[nextIdx]];

  let snappedX: number | null = null;
  let snappedY: number | null = null;
  let bestXDist = Infinity;
  let bestYDist = Infinity;

  for (const neighbor of neighbors) {
    if (neighbor === dragged) continue; // degenerate (e.g. duplicate points)
    const angle = segmentAngleDeg(dragged, neighbor);
    const dist = distanceFromAxisDeg(angle);
    if (dist > SNAP_THRESHOLD_DEG) continue;

    if (isCloserToHorizontal(dragged, neighbor)) {
      if (dist < bestYDist) {
        bestYDist = dist;
        snappedY = neighbor.y;
      }
    } else {
      if (dist < bestXDist) {
        bestXDist = dist;
        snappedX = neighbor.x;
      }
    }
  }

  if (snappedX === null && snappedY === null) return points;

  const adjusted: Point = {
    x: snappedX !== null ? snappedX : dragged.x,
    y: snappedY !== null ? snappedY : dragged.y,
  };

  return points.map((p, i) => (i === draggedIndex ? adjusted : p));
}

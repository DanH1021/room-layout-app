"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Text, Group, Transformer, Line, Shape, Image as KonvaImage } from "react-konva";
import Konva from "konva";
import { EquipmentItem, LayoutObject, RoomFeatureRecord, RoomTemplate, roomFeatureToObstacle } from "@/lib/geometry/types";
import { instantiateEquipment } from "@/lib/geometry/placement";
import { inchesToPx, pxToInches, feetToInches, inchesToFeetLabel } from "@/lib/geometry/scale";
import { polygonBoundingBox } from "@/lib/geometry/room";
import { Toolbar } from "@/components/editor/Toolbar";
import { IssuePanel } from "@/components/editor/IssuePanel";
import { AICommandBar } from "@/components/editor/AICommandBar";
import { validateLayout, IssueSeverity, LayoutIssue } from "@/lib/geometry/validate";
import { computeCapacity } from "@/lib/geometry/capacity";
import { v4 as uuid } from "uuid";
import Link from "next/link";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { canEdit } from "@/lib/auth/roles";

const STAGE_PADDING_PX = 80;

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Hand-rolled HTMLImageElement loader — avoids pulling in the `use-image`
// npm package for a single background-floor-plan image.
function useHTMLImage(url: string | null | undefined): HTMLImageElement | null {
  // Track the loaded image alongside the url it was loaded for, and derive
  // the returned value from a match check rather than resetting state to
  // null synchronously inside the effect when url is falsy/changes.
  const [loaded, setLoaded] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!url) return;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setLoaded({ url, img: image });
    image.src = url;
    return () => {
      image.onload = null;
    };
  }, [url]);
  return loaded && loaded.url === url ? loaded.img : null;
}

// The API serializes Prisma's nullable Float columns as `null`; the
// in-app geometry types use `undefined` for "not set". Normalize once here.
function nullsToUndefined<T extends object>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (out[key] === null) out[key] = undefined;
  }
  return out as T;
}

export default function RoomCanvas({ layoutId }: { layoutId: string }) {
  // The API routes are the real security boundary (see lib/auth/roles.ts /
  // canEdit) — this only hides/disables controls a read_only user couldn't
  // use anyway, so they get a clean viewing experience instead of clicking
  // things that silently 403. While the session is still loading, default to
  // editable rather than flashing a disabled UI for the common case.
  const currentUser = useCurrentUser();
  const readOnly = currentUser ? !canEdit(currentUser.role) : false;

  const [room, setRoom] = useState<RoomTemplate | null>(null);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [objects, setObjects] = useState<LayoutObject[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [armedEquipmentId, setArmedEquipmentId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [containerSize, setContainerSize] = useState({ width: 1000, height: 700 });
  const [bgOpacity, setBgOpacity] = useState(0.6);
  const [showBackground, setShowBackground] = useState(true);
  const [cropToRoom, setCropToRoom] = useState(true);
  // Measure tool: click two points (room inches, not screen px, so it stays
  // correct under pan/zoom) to see the real-world distance between them —
  // e.g. checking the actual gap between two tables' chairs against the
  // real floor plan, without the app needing to understand either shape.
  const [measureMode, setMeasureMode] = useState(false);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureLive, setMeasureLive] = useState<{ x: number; y: number } | null>(null);
  // The last *finished* measurement (persists on screen after the click that
  // completed it, even once measureStart has already moved on to begin the
  // next chained measurement) — without this, the line/label you just made
  // would vanish the instant you click again to start the next one.
  const [measureCompleted, setMeasureCompleted] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    distanceIn: number;
  } | null>(null);

  // Row-placement tool: lay out N instances of one equipment type in a line,
  // spaced by an exact edge-to-edge gap (e.g. 56" between 72" rounds) rather
  // than placing and nudging each one individually. Chairs are still
  // auto-generated per table exactly like a normal single placement — the
  // gap is purely between the bare table shapes, per Dan's own spec.
  const [rowEquipmentId, setRowEquipmentId] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(3);
  const [rowGapIn, setRowGapIn] = useState(56);
  const [rowDirection, setRowDirection] = useState<"horizontal" | "vertical">("horizontal");
  const [armedRow, setArmedRow] = useState(false);

  // Snap-to-item: when placing a single piece of equipment (not the row
  // tool), snap it onto the same axis as the nearest already-placed item
  // of the same equipment type, spaced an exact edge-to-edge gap from it —
  // a one-at-a-time version of the row tool for "place the first one
  // exactly, then just click roughly where the next should go."
  const [snapToItemEnabled, setSnapToItemEnabled] = useState(false);
  const [snapToItemGapIn, setSnapToItemGapIn] = useState(56);

  const containerRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, Konva.Group>>({});
  const transformerRef = useRef<Konva.Transformer>(null);

  // Load the room, equipment library, and saved objects from the database.
  // Re-runs whenever layoutId changes (e.g. navigating between two layouts
  // of the same event without a full page reload).
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    fetch(`/api/layouts/${layoutId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load layout (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setRoom(nullsToUndefined(data.room));
        setEquipmentList((data.equipment as EquipmentItem[]).map(nullsToUndefined));
        setObjects((data.objects as LayoutObject[]).map(nullsToUndefined));
        setLoadState("ready");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [layoutId]);

  const equipmentById = useMemo(() => new Map(equipmentList.map((e) => [e.id, e])), [equipmentList]);
  const getEquipmentItem = useCallback(
    (id: string): EquipmentItem => {
      const item = equipmentById.get(id);
      if (!item) throw new Error(`Unknown equipment item: ${id}`);
      return item;
    },
    [equipmentById]
  );

  const saveLayout = useCallback(async () => {
    if (readOnly) return false;
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/layouts/${layoutId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objects }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2500);
      return true;
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      return false;
    }
  }, [objects, layoutId, readOnly]);

  // The PDF route reads the layout straight from the database (so the export
  // matches exactly what the /export-pdf link would produce if reloaded or
  // shared), so export always saves first — otherwise a printed PDF could
  // silently omit unsaved on-screen changes.
  const exportPdf = useCallback(async () => {
    // Read-only users can't save (nothing to save — they can't edit), but
    // they can still export whatever was last saved to the database.
    if (!readOnly) {
      const saved = await saveLayout();
      if (!saved) return;
    }
    window.open(`/api/layouts/${layoutId}/export-pdf`, "_blank");
  }, [saveLayout, layoutId, readOnly]);

  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const nodes = Array.from(selectedIds)
      .map((id) => groupRefs.current[id])
      .filter((n): n is Konva.Group => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, objects]);

  // Keyboard shortcuts: delete, duplicate, save, escape (disarm placement).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly) saveLayout();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        if (!readOnly) deleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selectedIds.size > 0) {
        e.preventDefault();
        if (!readOnly) duplicateSelected();
      } else if (e.key === "Escape" && armedEquipmentId) {
        e.preventDefault();
        setArmedEquipmentId(null);
      } else if (e.key === "Escape" && armedRow) {
        e.preventDefault();
        setArmedRow(false);
      } else if (e.key === "Escape" && measureMode) {
        e.preventDefault();
        if (measureStart) {
          setMeasureStart(null);
          setMeasureLive(null);
        } else {
          setMeasureMode(false);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, objects, saveLayout, armedEquipmentId, readOnly, measureMode, measureStart, armedRow]);

  function toggleMeasureMode() {
    setMeasureMode((prev) => {
      const next = !prev;
      if (next) {
        setArmedEquipmentId(null); // mutually exclusive with placing equipment
        setArmedRow(false); // and with row placement
      }
      setMeasureStart(null);
      setMeasureLive(null);
      setMeasureCompleted(null);
      return next;
    });
  }

  /** Stage pointer -> room inches, same math the "place equipment" click handler uses. */
  function pointerToRoomInches(stage: Konva.Stage): { x: number; y: number } | null {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const localPx = pointer.x - stage.x() - stageOffset.x;
    const localPy = pointer.y - stage.y() - stageOffset.y;
    return {
      x: boundingBox.minX + pxToInches(localPx, zoom),
      y: boundingBox.minY + pxToInches(localPy, zoom),
    };
  }

  const parents = useMemo(() => objects.filter((o) => !o.parentObjectId), [objects]);
  const childrenByParent = useMemo(() => {
    const map: Record<string, LayoutObject[]> = {};
    for (const o of objects) {
      if (o.parentObjectId) {
        (map[o.parentObjectId] ??= []).push(o);
      }
    }
    return map;
  }, [objects]);

  const issues: LayoutIssue[] = useMemo(() => {
    if (!room) return [];
    const units = parents.map((p) => ({
      object: p,
      item: getEquipmentItem(p.equipmentItemId),
      children: (childrenByParent[p.id] ?? []).map((c) => ({
        object: c,
        item: getEquipmentItem(c.equipmentItemId),
      })),
    }));
    const obstacles = (room.features ?? []).map(roomFeatureToObstacle);
    return validateLayout(units, room.boundary, obstacles);
  }, [parents, childrenByParent, room, getEquipmentItem]);

  const issueSeverityByObjectId = useMemo(() => {
    const map: Record<string, IssueSeverity> = {};
    for (const issue of issues) {
      for (const id of issue.objectIds) {
        if (map[id] !== "error") map[id] = issue.severity;
      }
    }
    return map;
  }, [issues]);

  const capacity = useMemo(
    () => (equipmentList.length ? computeCapacity(objects, getEquipmentItem) : 0),
    [objects, equipmentList, getEquipmentItem]
  );

  // The bounding box of the actual boundary polygon is the real rendering
  // extent — for today's rectangular seeded rooms this equals widthFt/lengthFt
  // in inches, but for an irregular (e.g. traced-from-photo) room it may not.
  // widthFt/lengthFt are kept only for the text label, never for geometry.
  const boundingBox = useMemo(
    () =>
      room?.boundary && room.boundary.length
        ? polygonBoundingBox(room.boundary)
        : { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    [room]
  );
  const roomWidthIn = boundingBox.width;
  const roomLengthIn = boundingBox.height;
  const roomWidthPx = inchesToPx(roomWidthIn, zoom);
  const roomLengthPx = inchesToPx(roomLengthIn, zoom);

  const bgImage = useHTMLImage(room?.backgroundImageUrl);
  // Whether the floor-plan image is actually being drawn this render — used
  // both to gate the background Layer itself and to make the room boundary
  // fill transparent when it is. The boundary's opaque white fill used to
  // always paint over the background Layer regardless of this, since Konva
  // layers composite in JSX order and the boundary Layer was declared AFTER
  // (so on top of) the background Layer — the floor plan was loading and
  // sizing correctly the whole time, just permanently hidden underneath it.
  const bgVisible = showBackground && !!room?.backgroundImageUrl && !!bgImage;

  const stageOffset = {
    x: Math.max(STAGE_PADDING_PX, (containerSize.width - roomWidthPx) / 2),
    y: Math.max(STAGE_PADDING_PX, (containerSize.height - roomLengthPx) / 2),
  };

  // Clicking a toolbar button arms placement mode for that equipment type
  // (rather than immediately adding it near the room center). Clicking the
  // already-armed button again disarms it; clicking a different button
  // switches the armed type.
  function armEquipment(equipmentItemId: string) {
    if (readOnly) return;
    setArmedRow(false); // mutually exclusive with row placement
    setArmedEquipmentId((prev) => (prev === equipmentItemId ? null : equipmentItemId));
  }

  // Finds the closest already-placed parent object of the same equipment
  // type to a clicked point — used by snap-to-item placement below.
  function findNearestSameTypeParent(equipmentItemId: string, xIn: number, yIn: number): LayoutObject | null {
    let best: LayoutObject | null = null;
    let bestDist = Infinity;
    for (const p of parents) {
      if (p.equipmentItemId !== equipmentItemId) continue;
      const d = Math.hypot(p.x - xIn, p.y - yIn);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  // Places one instance of the currently-armed equipment centered at the
  // given room-space point (inches). Normally this snaps to the grid, same
  // as dragging. When snap-to-item is on and an existing item of the same
  // type is nearby, it instead snaps onto that item's row/column (whichever
  // axis the click is further along) at an exact edge-to-edge spacing from
  // it, exactly like the row tool's spacing math but one item at a time —
  // the click only decides which side to place on, not the exact distance.
  function placeArmedEquipmentAt(xIn: number, yIn: number) {
    if (!armedEquipmentId || readOnly) return;
    let centerX: number;
    let centerY: number;
    const ref = snapToItemEnabled ? findNearestSameTypeParent(armedEquipmentId, xIn, yIn) : null;
    if (ref) {
      const item = getEquipmentItem(armedEquipmentId);
      const dx = xIn - ref.x;
      const dy = yIn - ref.y;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const alongAxisIn =
        item.shape === "circle"
          ? item.diameterIn ?? 24
          : horizontal
            ? item.widthIn ?? 24
            : item.lengthIn ?? 24;
      const step = alongAxisIn + snapToItemGapIn;
      const sign = (horizontal ? dx : dy) >= 0 ? 1 : -1;
      centerX = horizontal ? ref.x + sign * step : ref.x;
      centerY = horizontal ? ref.y : ref.y + sign * step;
    } else {
      centerX = snap(xIn);
      centerY = snap(yIn);
    }
    const newObjects = instantiateEquipment(armedEquipmentId, centerX, centerY, getEquipmentItem);
    setObjects((prev) => [...prev, ...newObjects]);
    setSelectedIds(new Set([newObjects[0].id]));
  }

  function toggleArmedRow() {
    if (readOnly || !rowEquipmentId) return;
    setArmedEquipmentId(null); // mutually exclusive with single-item placement
    setArmedRow((prev) => !prev);
  }

  /**
   * Places `rowCount` instances of `rowEquipmentId` in a straight line,
   * centered on the clicked point, each table's bare shape exactly
   * `rowGapIn` inches from its neighbor's (center-to-center spacing =
   * along-axis table size + gap — never the broader chair/clearance
   * footprint used elsewhere, per Dan's spec: the gap is between table
   * edges, chairs are expected to sit in that space). Only the row's own
   * anchor point snaps to the grid; individual tables are NOT additionally
   * snapped, so the requested gap stays exact rather than getting rounded
   * off by the grid step.
   */
  function placeRowAt(xIn: number, yIn: number) {
    if (!armedRow || !rowEquipmentId || readOnly) return;
    const item = getEquipmentItem(rowEquipmentId);
    const alongAxisIn =
      item.shape === "circle"
        ? item.diameterIn ?? 24
        : rowDirection === "horizontal"
          ? item.widthIn ?? 24
          : item.lengthIn ?? 24;
    const step = alongAxisIn + rowGapIn;
    const totalSpan = step * (rowCount - 1);
    const anchorX = snap(xIn);
    const anchorY = snap(yIn);
    const startX = rowDirection === "horizontal" ? anchorX - totalSpan / 2 : anchorX;
    const startY = rowDirection === "vertical" ? anchorY - totalSpan / 2 : anchorY;

    const newObjects: LayoutObject[] = [];
    for (let i = 0; i < rowCount; i++) {
      const cx = rowDirection === "horizontal" ? startX + step * i : startX;
      const cy = rowDirection === "vertical" ? startY + step * i : startY;
      newObjects.push(...instantiateEquipment(rowEquipmentId, cx, cy, getEquipmentItem));
    }
    setObjects((prev) => [...prev, ...newObjects]);
    setSelectedIds(new Set(newObjects.filter((o) => !o.parentObjectId).map((o) => o.id)));
  }

  function updateObject(id: string, changes: Partial<LayoutObject>) {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...changes } : o)));
  }

  function duplicateSelected() {
    if (selectedIds.size === 0 || readOnly) return;
    const newParents: LayoutObject[] = [];
    const newChildren: LayoutObject[] = [];
    const offsetIn = 12; // 1ft offset so the duplicate is visibly distinct
    for (const selectedId of selectedIds) {
      const parent = objects.find((o) => o.id === selectedId);
      if (!parent) continue;
      const newId = uuid();
      newParents.push({
        ...parent,
        id: newId,
        x: parent.x + offsetIn,
        y: parent.y + offsetIn,
      });
      const children = childrenByParent[parent.id] ?? [];
      for (const c of children) {
        newChildren.push({ ...c, id: uuid(), parentObjectId: newId });
      }
    }
    if (newParents.length === 0) return;
    setObjects((prev) => [...prev, ...newParents, ...newChildren]);
    setSelectedIds(new Set(newParents.map((p) => p.id)));
  }

  function deleteSelected() {
    if (selectedIds.size === 0 || readOnly) return;
    setObjects((prev) => prev.filter((o) => !selectedIds.has(o.id) && !(o.parentObjectId && selectedIds.has(o.parentObjectId))));
    setSelectedIds(new Set());
  }

  const gridStep = feetToInches(1);
  const gridLines = useMemo(() => {
    if (!showGrid) return [];
    const lines: { points: number[]; key: string }[] = [];
    for (let x = 0; x <= roomWidthIn; x += gridStep) {
      lines.push({ key: `v${x}`, points: [x, 0, x, roomLengthIn] });
    }
    for (let y = 0; y <= roomLengthIn; y += gridStep) {
      lines.push({ key: `h${y}`, points: [0, y, roomWidthIn, y] });
    }
    return lines;
  }, [showGrid, roomWidthIn, roomLengthIn, gridStep]);

  function snap(value: number) {
    if (!snapEnabled) return value;
    return Math.round(value / gridStep) * gridStep;
  }

  if (loadState === "loading") {
    return (
      <div className="flex items-center justify-center h-full w-full text-sm text-neutral-500">
        Loading room layout…
      </div>
    );
  }

  if (loadState === "error" || !room) {
    return (
      <div className="flex items-center justify-center h-full w-full text-sm text-red-600">
        Couldn&apos;t load the layout. Is the database running?
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <Toolbar
        readOnly={readOnly}
        equipment={equipmentList}
        onAdd={armEquipment}
        armedEquipmentId={armedEquipmentId}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
        hasSelection={selectedIds.size > 0}
        zoom={zoom}
        onZoomChange={setZoom}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((v) => !v)}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((v) => !v)}
        onSave={saveLayout}
        saveStatus={saveStatus}
        onExportPdf={exportPdf}
        hasBackgroundImage={!!room.backgroundImageUrl}
        showBackground={showBackground}
        onToggleBackground={() => setShowBackground((v) => !v)}
        bgOpacity={bgOpacity}
        onBgOpacityChange={setBgOpacity}
        cropToRoom={cropToRoom}
        onToggleCropToRoom={() => setCropToRoom((v) => !v)}
        measureMode={measureMode}
        onToggleMeasure={toggleMeasureMode}
        measureResultLabel={
          measureCompleted
            ? `${inchesToFeetLabel(measureCompleted.distanceIn)} (${Math.round(measureCompleted.distanceIn)}")`
            : null
        }
        rowEquipmentId={rowEquipmentId}
        onRowEquipmentChange={setRowEquipmentId}
        rowCount={rowCount}
        onRowCountChange={setRowCount}
        rowGapIn={rowGapIn}
        onRowGapChange={setRowGapIn}
        rowDirection={rowDirection}
        onRowDirectionChange={setRowDirection}
        armedRow={armedRow}
        onToggleArmedRow={toggleArmedRow}
        snapToItemEnabled={snapToItemEnabled}
        onToggleSnapToItem={() => setSnapToItemEnabled((v) => !v)}
        snapToItemGapIn={snapToItemGapIn}
        onSnapToItemGapChange={setSnapToItemGapIn}
      />
      <div ref={containerRef} className="flex-1 h-full bg-neutral-100 overflow-hidden relative">
        <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur px-3 py-1.5 rounded-md text-xs text-neutral-700 shadow-sm flex items-center gap-3">
          <Link href="/events" className="text-neutral-500 hover:text-neutral-800">
            &larr; Events
          </Link>
          <span className="text-neutral-400">|</span>
          <span>
            {room.roomName} — {room.widthFt}&apos; × {room.lengthFt}&apos;
          </span>
          <span className="text-neutral-400">|</span>
          <span>{capacity} seats placed</span>
          {readOnly && (
            <>
              <span className="text-neutral-400">|</span>
              <span className="text-amber-700 font-medium">View only</span>
            </>
          )}
          <span className="text-neutral-400">|</span>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="text-neutral-500 hover:text-neutral-800"
          >
            Log out
          </button>
        </div>
        <IssuePanel issues={issues} onFocusIssue={(ids) => setSelectedIds(new Set(ids))} />
        {!readOnly && (
          <AICommandBar
            layoutId={layoutId}
            objects={objects}
            getEquipmentItem={getEquipmentItem}
            room={{ widthFt: room.widthFt, lengthFt: room.lengthFt }}
            onApply={(newObjects) => {
              setObjects(newObjects);
              setSelectedIds(new Set());
            }}
          />
        )}
        {armedEquipmentId && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow-sm">
            Click to place: {getEquipmentItem(armedEquipmentId).name} — press Esc to cancel
          </div>
        )}
        {armedRow && rowEquipmentId && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow-sm">
            Click to place a row of {rowCount} × {getEquipmentItem(rowEquipmentId).name}, {rowGapIn}&quot;
            apart — press Esc to cancel
          </div>
        )}
        {measureMode && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-full shadow-sm">
            {measureStart ? "Click the second point — press Esc to cancel" : "Click a starting point — press Esc to stop measuring"}
          </div>
        )}
        <Stage
          width={containerSize.width}
          height={containerSize.height}
          draggable={!measureMode}
          style={armedEquipmentId || armedRow ? { cursor: "crosshair" } : measureMode ? { cursor: "crosshair" } : undefined}
          onClick={(e) => {
            if (e.target !== e.target.getStage()) return;
            const stage = e.target.getStage();
            if (measureMode && stage) {
              const pt = pointerToRoomInches(stage);
              if (!pt) return;
              if (!measureStart) {
                setMeasureStart(pt);
                setMeasureLive(pt);
              } else {
                const dist = Math.hypot(pt.x - measureStart.x, pt.y - measureStart.y);
                setMeasureCompleted({ start: measureStart, end: pt, distanceIn: dist });
                // Chain into the next measurement from this same point, so
                // checking several gaps in a row doesn't need re-toggling
                // the tool each time.
                setMeasureStart(pt);
                setMeasureLive(pt);
              }
              return;
            }
            if (armedRow && stage) {
              const pt = pointerToRoomInches(stage);
              if (pt) placeRowAt(pt.x, pt.y);
              return;
            }
            if (armedEquipmentId) {
              const pointer = stage?.getPointerPosition();
              if (!stage || !pointer) return;
              // Stage itself is draggable (pan), so its own x/y offset must be
              // subtracted in addition to the fixed stageOffset the content
              // Layer is positioned at — same math as the drag handlers use
              // implicitly via Konva's local node coordinates.
              const localPx = pointer.x - stage.x() - stageOffset.x;
              const localPy = pointer.y - stage.y() - stageOffset.y;
              const xIn = boundingBox.minX + pxToInches(localPx, zoom);
              const yIn = boundingBox.minY + pxToInches(localPy, zoom);
              placeArmedEquipmentAt(xIn, yIn);
            } else {
              setSelectedIds(new Set());
            }
          }}
          onMouseMove={(e) => {
            if (!measureMode || !measureStart) return;
            const stage = e.target.getStage();
            if (!stage) return;
            const pt = pointerToRoomInches(stage);
            if (pt) setMeasureLive(pt);
          }}
          onWheel={(e) => {
            // Trackpad/mouse-wheel panning — scroll instead of having to
            // click-drag empty canvas space to move around a large room.
            // Stage position is uncontrolled (no x/y prop), same as the
            // existing click-drag panning, so this just nudges Konva's own
            // internal position directly.
            e.evt.preventDefault();
            const stage = e.target.getStage();
            if (!stage) return;
            stage.x(stage.x() - e.evt.deltaX);
            stage.y(stage.y() - e.evt.deltaY);
            stage.batchDraw();
          }}
        >
          {bgVisible && (
            <Layer x={stageOffset.x} y={stageOffset.y}>
              <Group
                clipFunc={
                  cropToRoom
                    ? (ctx) => {
                        ctx.beginPath();
                        room.boundary.forEach((p, i) => {
                          const px = inchesToPx(p.x - boundingBox.minX, zoom);
                          const py = inchesToPx(p.y - boundingBox.minY, zoom);
                          if (i === 0) ctx.moveTo(px, py);
                          else ctx.lineTo(px, py);
                        });
                        ctx.closePath();
                      }
                    : undefined
                }
              >
                <KonvaImage
                  image={bgImage}
                  x={inchesToPx(-boundingBox.minX, zoom)}
                  y={inchesToPx(-boundingBox.minY, zoom)}
                  width={inchesToPx(
                    room.backgroundImageWidthPx ? room.backgroundImageWidthPx / (room.backgroundImagePxPerInch ?? 1) : 0,
                    zoom
                  )}
                  height={inchesToPx(
                    room.backgroundImageHeightPx ? room.backgroundImageHeightPx / (room.backgroundImagePxPerInch ?? 1) : 0,
                    zoom
                  )}
                  opacity={bgOpacity}
                  listening={false}
                />
              </Group>
            </Layer>
          )}
          <Layer x={stageOffset.x} y={stageOffset.y}>
            {/* Room boundary — a closed polygon so irregular (non-rectangular)
                rooms render correctly; a 4-point rectangle boundary renders
                identically to the old Rect-based version. */}
            <Line
              points={room.boundary.flatMap((p) => [
                inchesToPx(p.x - boundingBox.minX, zoom),
                inchesToPx(p.y - boundingBox.minY, zoom),
              ])}
              closed
              fill={bgVisible ? undefined : "#ffffff"}
              stroke="#44403c"
              strokeWidth={6}
              listening={false}
            />
            <Group
              clipFunc={(ctx) => {
                ctx.beginPath();
                room.boundary.forEach((p, i) => {
                  const px = inchesToPx(p.x - boundingBox.minX, zoom);
                  const py = inchesToPx(p.y - boundingBox.minY, zoom);
                  if (i === 0) ctx.moveTo(px, py);
                  else ctx.lineTo(px, py);
                });
                ctx.closePath();
              }}
            >
              {gridLines.map((l) => (
                <Line
                  key={l.key}
                  points={l.points.map((v) => inchesToPx(v, zoom))}
                  stroke="#e5e5e5"
                  strokeWidth={1}
                  listening={false}
                />
              ))}

              {(room.features ?? []).map((feature) => (
                <ObstacleVisual key={feature.id} feature={feature} zoom={zoom} boundingBox={boundingBox} />
              ))}

              {parents.map((parent) => {
              const item = getEquipmentItem(parent.equipmentItemId);
              const children = childrenByParent[parent.id] ?? [];
              return (
                <Group
                  key={parent.id}
                  ref={(node) => {
                    if (node) groupRefs.current[parent.id] = node;
                  }}
                  x={inchesToPx(parent.x - boundingBox.minX, zoom)}
                  y={inchesToPx(parent.y - boundingBox.minY, zoom)}
                  rotation={parent.rotation}
                  draggable={!readOnly}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    const toggle = e.evt.ctrlKey || e.evt.metaKey;
                    setSelectedIds((prev) => {
                      if (!toggle) return new Set([parent.id]);
                      const next = new Set(prev);
                      if (next.has(parent.id)) next.delete(parent.id);
                      else next.add(parent.id);
                      return next;
                    });
                  }}
                  onTap={(e) => {
                    e.cancelBubble = true;
                    setSelectedIds(new Set([parent.id]));
                  }}
                  onDragMove={(e) => {
                    // Live feedback while dragging, before release — updates
                    // object state (and therefore collision/clearance
                    // highlighting) continuously, not just on drop.
                    const node = e.target;
                    updateObject(parent.id, {
                      x: boundingBox.minX + pxToInches(node.x(), zoom),
                      y: boundingBox.minY + pxToInches(node.y(), zoom),
                    });
                  }}
                  onDragEnd={(e) => {
                    const node = e.target;
                    const xIn = snap(boundingBox.minX + pxToInches(node.x(), zoom));
                    const yIn = snap(boundingBox.minY + pxToInches(node.y(), zoom));
                    node.x(inchesToPx(xIn - boundingBox.minX, zoom));
                    node.y(inchesToPx(yIn - boundingBox.minY, zoom));
                    updateObject(parent.id, { x: xIn, y: yIn });
                  }}
                  onTransform={(e) => {
                    const node = e.target as Konva.Group;
                    updateObject(parent.id, { rotation: node.rotation() });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Group;
                    const rotation = node.rotation();
                    updateObject(parent.id, { rotation });
                  }}
                >
                  <ShapeVisual
                    object={{ ...parent, x: 0, y: 0, rotation: 0 }}
                    zoom={zoom}
                    color={item.color}
                    issueSeverity={issueSeverityByObjectId[parent.id]}
                  />
                  {children.map((c) => (
                    <ShapeVisual
                      key={c.id}
                      object={c}
                      zoom={zoom}
                      color={getEquipmentItem(c.equipmentItemId).color}
                    />
                  ))}
                </Group>
              );
              })}
            </Group>

            <Transformer
              ref={transformerRef}
              rotateEnabled={!readOnly}
              resizeEnabled={false}
              anchorSize={8}
              borderStroke="#2563eb"
              rotateAnchorOffset={24}
            />
          </Layer>

          {measureMode && (
            <Layer x={stageOffset.x} y={stageOffset.y} listening={false}>
              {measureCompleted && (
                <MeasureSegment
                  start={measureCompleted.start}
                  end={measureCompleted.end}
                  distanceIn={measureCompleted.distanceIn}
                  boundingBox={boundingBox}
                  zoom={zoom}
                  dashed={false}
                />
              )}
              {measureStart &&
                measureLive &&
                (measureStart.x !== measureLive.x || measureStart.y !== measureLive.y) && (
                  <MeasureSegment
                    start={measureStart}
                    end={measureLive}
                    distanceIn={Math.hypot(measureLive.x - measureStart.x, measureLive.y - measureStart.y)}
                    boundingBox={boundingBox}
                    zoom={zoom}
                    dashed
                  />
                )}
            </Layer>
          )}
        </Stage>
      </div>
    </div>
  );
}

const ISSUE_COLORS: Record<IssueSeverity, string> = {
  error: "#dc2626",
  warning: "#d97706",
};

function ShapeVisual({
  object,
  zoom,
  color,
  issueSeverity,
}: {
  object: LayoutObject;
  zoom: number;
  color: string;
  issueSeverity?: IssueSeverity;
}) {
  const x = inchesToPx(object.x, zoom);
  const y = inchesToPx(object.y, zoom);
  const stroke = issueSeverity ? ISSUE_COLORS[issueSeverity] : "#262626";
  const strokeWidth = issueSeverity ? 3 : 1;

  if (object.shape === "circle" && object.diameterIn) {
    const r = inchesToPx(object.diameterIn / 2, zoom);
    return (
      <>
        <Circle x={x} y={y} radius={r} fill={color} stroke={stroke} strokeWidth={strokeWidth} rotation={object.rotation} />
        {r > 18 && (
          <Text
            x={x - r}
            y={y - 6}
            width={r * 2}
            align="center"
            text={object.label ?? ""}
            fontSize={11}
            fill="#262626"
            listening={false}
          />
        )}
      </>
    );
  }

  const w = inchesToPx(object.widthIn ?? 18, zoom);
  const h = inchesToPx(object.lengthIn ?? 18, zoom);
  return (
    <Rect
      x={x}
      y={y}
      width={w}
      height={h}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={object.rotation}
      fill={color}
      stroke={stroke}
      strokeWidth={strokeWidth}
      cornerRadius={2}
    />
  );
}

// Fixed architectural obstacles (columns, permanent bars, stairs, etc.)
// traced from an uploaded floor plan. Rendered non-interactively, styled
// distinctly from movable equipment (slate gray vs. the equipment palette).
function MeasureSegment({
  start,
  end,
  distanceIn,
  boundingBox,
  zoom,
  dashed,
}: {
  start: { x: number; y: number };
  end: { x: number; y: number };
  distanceIn: number;
  boundingBox: { minX: number; minY: number };
  zoom: number;
  dashed: boolean;
}) {
  const x1 = inchesToPx(start.x - boundingBox.minX, zoom);
  const y1 = inchesToPx(start.y - boundingBox.minY, zoom);
  const x2 = inchesToPx(end.x - boundingBox.minX, zoom);
  const y2 = inchesToPx(end.y - boundingBox.minY, zoom);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const label = `${inchesToFeetLabel(distanceIn)} (${Math.round(distanceIn)}")`;
  const color = dashed ? "#2563eb" : "#dc2626";

  return (
    <Group>
      <Line points={[x1, y1, x2, y2]} stroke={color} strokeWidth={2} dash={dashed ? [6, 4] : undefined} />
      <Circle x={x1} y={y1} radius={4} fill={color} />
      <Circle x={x2} y={y2} radius={4} fill={color} />
      <Group x={midX} y={midY}>
        <Rect
          x={-label.length * 3.4}
          y={-18}
          width={label.length * 6.8}
          height={18}
          fill="#ffffff"
          stroke={color}
          strokeWidth={1}
          cornerRadius={3}
        />
        <Text
          x={-label.length * 3.4}
          y={-15}
          width={label.length * 6.8}
          align="center"
          text={label}
          fontSize={12}
          fontStyle="bold"
          fill={color}
        />
      </Group>
    </Group>
  );
}

function ObstacleVisual({
  feature,
  zoom,
  boundingBox,
}: {
  feature: RoomFeatureRecord;
  zoom: number;
  boundingBox: { minX: number; minY: number };
}) {
  const isDoorLike = DOOR_LIKE_OBSTACLE_TYPES.has(feature.type);
  const fill = isDoorLike ? "#a16207" : "#94a3b8";
  const stroke = isDoorLike ? "#a16207" : "#475569";
  const x = inchesToPx(feature.x - boundingBox.minX, zoom);
  const y = inchesToPx(feature.y - boundingBox.minY, zoom);

  if (feature.shape === "circle") {
    const r = inchesToPx((feature.diameterIn ?? 12) / 2, zoom);
    return (
      <>
        <Circle
          x={x}
          y={y}
          radius={r}
          fill={isDoorLike ? undefined : fill}
          opacity={isDoorLike ? 1 : 0.5}
          stroke={stroke}
          strokeWidth={isDoorLike ? 2 : 1}
          listening={false}
        />
        <Text
          x={x - r}
          y={y - 5}
          width={r * 2}
          align="center"
          text={feature.type}
          fontSize={10}
          fill="#1e293b"
          listening={false}
        />
      </>
    );
  }

  if (feature.shape === "polygon") {
    const points = (feature.metadata?.polygonPoints ?? []).flatMap((p) => [
      inchesToPx(p.x - boundingBox.minX, zoom),
      inchesToPx(p.y - boundingBox.minY, zoom),
    ]);
    return (
      <>
        <Line
          points={points}
          closed
          fill={isDoorLike ? undefined : fill}
          opacity={isDoorLike ? 1 : 0.5}
          stroke={stroke}
          strokeWidth={isDoorLike ? 2 : 1}
          listening={false}
        />
        <Text x={x - 40} y={y - 5} width={80} align="center" text={feature.type} fontSize={10} fill="#1e293b" listening={false} />
      </>
    );
  }

  const w = inchesToPx(feature.widthIn ?? 12, zoom);
  const h = inchesToPx(feature.lengthIn ?? 12, zoom);

  if (isDoorLike) {
    // Draw a door-swing diagram (leaf + quarter-circle swing arc) instead of a
    // solid obstacle block, so it reads as an opening rather than something
    // blocking the space. Hinge is anchored at the bottom-left corner of the
    // obstacle's footprint, leaf swings up, radius = door width.
    const hingeX = -w / 2;
    const hingeY = h / 2;
    return (
      <>
        <Shape
          x={x}
          y={y}
          rotation={feature.rotation}
          stroke={stroke}
          strokeWidth={2}
          listening={false}
          sceneFunc={(ctx, shapeNode) => {
            ctx.beginPath();
            ctx.moveTo(hingeX, hingeY);
            ctx.lineTo(hingeX, hingeY - w);
            ctx.arc(hingeX, hingeY, w, -Math.PI / 2, 0, false);
            ctx.strokeShape(shapeNode);
          }}
        />
        <Text x={x - w / 2} y={y + h / 2 + 2} width={w} align="center" text={feature.type} fontSize={10} fill="#1e293b" listening={false} />
      </>
    );
  }

  return (
    <>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        offsetX={w / 2}
        offsetY={h / 2}
        rotation={feature.rotation}
        fill={fill}
        opacity={0.5}
        stroke={stroke}
        strokeWidth={1}
        listening={false}
      />
      <Text x={x - w / 2} y={y - 5} width={w} align="center" text={feature.type} fontSize={10} fill="#1e293b" listening={false} />
    </>
  );
}

const DOOR_LIKE_OBSTACLE_TYPES = new Set(["door", "kitchen_entrance", "emergency_exit"]);

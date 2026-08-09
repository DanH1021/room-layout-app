"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Circle, Text, Group, Transformer, Line, Image as KonvaImage } from "react-konva";
import Konva from "konva";
import { EquipmentItem, LayoutObject, RoomFeatureRecord, RoomTemplate, roomFeatureToObstacle } from "@/lib/geometry/types";
import { instantiateEquipment } from "@/lib/geometry/placement";
import { inchesToPx, pxToInches, feetToInches } from "@/lib/geometry/scale";
import { polygonBoundingBox } from "@/lib/geometry/room";
import { Toolbar } from "@/components/editor/Toolbar";
import { IssuePanel } from "@/components/editor/IssuePanel";
import { AICommandBar } from "@/components/editor/AICommandBar";
import { validateLayout, IssueSeverity, LayoutIssue } from "@/lib/geometry/validate";
import { computeCapacity } from "@/lib/geometry/capacity";
import { v4 as uuid } from "uuid";
import Link from "next/link";

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
  const [room, setRoom] = useState<RoomTemplate | null>(null);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [objects, setObjects] = useState<LayoutObject[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [containerSize, setContainerSize] = useState({ width: 1000, height: 700 });
  const [bgOpacity, setBgOpacity] = useState(0.6);
  const [showBackground, setShowBackground] = useState(true);

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
  }, [objects, layoutId]);

  // The PDF route reads the layout straight from the database (so the export
  // matches exactly what the /export-pdf link would produce if reloaded or
  // shared), so export always saves first — otherwise a printed PDF could
  // silently omit unsaved on-screen changes.
  const exportPdf = useCallback(async () => {
    const saved = await saveLayout();
    if (!saved) return;
    window.open(`/api/layouts/${layoutId}/export-pdf`, "_blank");
  }, [saveLayout, layoutId]);

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
    if (selectedId && groupRefs.current[selectedId]) {
      tr.nodes([groupRefs.current[selectedId]]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [selectedId, objects]);

  // Keyboard shortcuts: delete, duplicate, save.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveLayout();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault();
        duplicateSelected();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, objects, saveLayout]);

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

  const stageOffset = {
    x: Math.max(STAGE_PADDING_PX, (containerSize.width - roomWidthPx) / 2),
    y: Math.max(STAGE_PADDING_PX, (containerSize.height - roomLengthPx) / 2),
  };

  function addEquipment(equipmentItemId: string) {
    // Object coordinates live in the same absolute room space as the
    // boundary polygon, so the center point must be offset by the bounding
    // box's origin — not just half its width/height — for rooms that don't
    // start at (0,0).
    const centerX = boundingBox.minX + roomWidthIn / 2 + (Math.random() * 24 - 12);
    const centerY = boundingBox.minY + roomLengthIn / 2 + (Math.random() * 24 - 12);
    const newObjects = instantiateEquipment(equipmentItemId, centerX, centerY, getEquipmentItem);
    setObjects((prev) => [...prev, ...newObjects]);
    setSelectedId(newObjects[0].id);
  }

  function updateObject(id: string, changes: Partial<LayoutObject>) {
    setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...changes } : o)));
  }

  function duplicateSelected() {
    if (!selectedId) return;
    const parent = objects.find((o) => o.id === selectedId);
    if (!parent) return;
    const idMap: Record<string, string> = { [parent.id]: uuid() };
    const offsetIn = 12; // 1ft offset so the duplicate is visibly distinct
    const newParent: LayoutObject = {
      ...parent,
      id: idMap[parent.id],
      x: parent.x + offsetIn,
      y: parent.y + offsetIn,
    };
    const children = childrenByParent[parent.id] ?? [];
    const newChildren = children.map((c) => ({
      ...c,
      id: uuid(),
      parentObjectId: newParent.id,
    }));
    setObjects((prev) => [...prev, newParent, ...newChildren]);
    setSelectedId(newParent.id);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setObjects((prev) =>
      prev.filter((o) => o.id !== selectedId && o.parentObjectId !== selectedId)
    );
    setSelectedId(null);
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
        equipment={equipmentList}
        onAdd={addEquipment}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
        hasSelection={!!selectedId}
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
        <IssuePanel issues={issues} onFocusIssue={(id) => setSelectedId(id)} />
        <AICommandBar
          layoutId={layoutId}
          objects={objects}
          getEquipmentItem={getEquipmentItem}
          room={{ widthFt: room.widthFt, lengthFt: room.lengthFt }}
          onApply={(newObjects) => {
            setObjects(newObjects);
            setSelectedId(null);
          }}
        />
        <Stage
          width={containerSize.width}
          height={containerSize.height}
          draggable
          onClick={(e) => {
            if (e.target === e.target.getStage()) setSelectedId(null);
          }}
        >
          {showBackground && room.backgroundImageUrl && bgImage && (
            <Layer x={stageOffset.x} y={stageOffset.y}>
              <KonvaImage
                image={bgImage}
                x={0}
                y={0}
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
              fill="#ffffff"
              stroke="#262626"
              strokeWidth={2}
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
                  x={inchesToPx(parent.x, zoom)}
                  y={inchesToPx(parent.y, zoom)}
                  rotation={parent.rotation}
                  draggable
                  onClick={(e) => {
                    e.cancelBubble = true;
                    setSelectedId(parent.id);
                  }}
                  onTap={(e) => {
                    e.cancelBubble = true;
                    setSelectedId(parent.id);
                  }}
                  onDragMove={(e) => {
                    // Live feedback while dragging, before release — updates
                    // object state (and therefore collision/clearance
                    // highlighting) continuously, not just on drop.
                    const node = e.target;
                    updateObject(parent.id, {
                      x: pxToInches(node.x(), zoom),
                      y: pxToInches(node.y(), zoom),
                    });
                  }}
                  onDragEnd={(e) => {
                    const node = e.target;
                    const xIn = snap(pxToInches(node.x(), zoom));
                    const yIn = snap(pxToInches(node.y(), zoom));
                    node.x(inchesToPx(xIn, zoom));
                    node.y(inchesToPx(yIn, zoom));
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
              rotateEnabled
              resizeEnabled={false}
              anchorSize={8}
              borderStroke="#2563eb"
              rotateAnchorOffset={24}
            />
          </Layer>
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
function ObstacleVisual({
  feature,
  zoom,
  boundingBox,
}: {
  feature: RoomFeatureRecord;
  zoom: number;
  boundingBox: { minX: number; minY: number };
}) {
  const fill = "#94a3b8";
  const stroke = "#475569";
  const x = inchesToPx(feature.x - boundingBox.minX, zoom);
  const y = inchesToPx(feature.y - boundingBox.minY, zoom);

  if (feature.shape === "circle") {
    const r = inchesToPx((feature.diameterIn ?? 12) / 2, zoom);
    return (
      <>
        <Circle x={x} y={y} radius={r} fill={fill} opacity={0.5} stroke={stroke} strokeWidth={1} listening={false} />
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
          fill={fill}
          opacity={0.5}
          stroke={stroke}
          strokeWidth={1}
          listening={false}
        />
        <Text x={x - 40} y={y - 5} width={80} align="center" text={feature.type} fontSize={10} fill="#1e293b" listening={false} />
      </>
    );
  }

  const w = inchesToPx(feature.widthIn ?? 12, zoom);
  const h = inchesToPx(feature.lengthIn ?? 12, zoom);
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

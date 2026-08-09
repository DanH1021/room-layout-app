"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Stage, Layer, Line, Circle, Rect, Group, Text, Image as KonvaImage } from "react-konva";
import Konva from "konva";
import { TopNav } from "@/components/dashboard/TopNav";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { normToPx, pxToInchPoint } from "@/lib/geometry/resolveFloorPlan";
import { polygonBoundingBox } from "@/lib/geometry/room";
import { snapVertexToNeighbors } from "@/lib/geometry/snapVertex";

const MANAGER_ROLES = new Set(["administrator", "sales_manager"]);
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB, matches app/api/rooms/plan-uploads/route.ts

// Mirrors lib/schemas/floorPlan.ts's obstacleTypeEnum — duplicated here as a
// plain array since this is a client component and the zod schema isn't
// meant to be imported into the browser bundle.
const OBSTACLE_TYPES = [
  "wall",
  "door",
  "window",
  "column",
  "stairs",
  "permanent_bar",
  "kitchen_entrance",
  "restroom",
  "emergency_exit",
  "electrical",
  "av_connection",
  "screen",
  "permanent_staging",
  "bump_out",
  "other",
] as const;

// Mirrors RoomCanvas.tsx's DOOR_LIKE_OBSTACLE_TYPES — types that read as
// "an opening" rather than a solid obstacle.
const DOOR_LIKE_OBSTACLE_TYPES = new Set(["door", "kitchen_entrance", "emergency_exit"]);

const MAX_VIEW_WIDTH = 900;
const MAX_VIEW_HEIGHT = 640;
const DEFAULT_OBSTACLE_SIZE_IN = 24; // default size for a manually-added obstacle

type Step = "upload" | "parsing" | "calibrate" | "review" | "done";
type Point = { x: number; y: number };

interface ScaleNote {
  found: boolean;
  confidence: "high" | "medium" | "low" | "none";
  rawText?: string;
  drawnInchesPerRealFoot?: number;
}

interface AiRawResponse {
  boundaryPoints: Point[];
  obstacles: ProposedObstacleJson[];
  scaleNote: ScaleNote;
  notes?: string;
}

interface ProposedObstacleJson {
  type: string;
  shape: "rect" | "circle" | "polygon";
  x?: number;
  y?: number;
  widthNorm?: number;
  lengthNorm?: number;
  diameterNorm?: number;
  rotation?: number;
  polygonPointsNorm?: Point[];
  label?: string;
}

interface UploadRow {
  id: string;
  orgId: string;
  originalFileType: "pdf" | "image";
  backgroundImageUrl: string | null;
  backgroundImageWidthPx: number | null;
  backgroundImageHeightPx: number | null;
  aiScaleConfidence: "high" | "medium" | "low" | "none" | null;
  aiRawResponseJson: AiRawResponse | null;
  proposedBoundaryJson: Point[] | null;
  proposedObstaclesJson: ProposedObstacleJson[] | null;
  pxPerInch: number | null;
  status: string;
  errorMessage: string | null;
}

// Hand-rolled HTMLImageElement loader, same idiom as
// components/editor/RoomCanvas.tsx's useHTMLImage — not imported from there
// since this is a different context (the wizard, not the layout editor).
function useHTMLImage(url: string | null | undefined): HTMLImageElement | null {
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

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `local-${localIdCounter}`;
}

// Editable obstacle, kept in background-image PIXEL space (not inches) while
// the human drags/edits it on the canvas — only converted to inches at
// commit time, once pxPerInch is known and stable.
interface EditableObstacle {
  localId: string;
  type: string;
  shape: "rect" | "circle" | "polygon";
  xPx: number;
  yPx: number;
  widthPx?: number;
  lengthPx?: number;
  diameterPx?: number;
  rotation: number;
  polygonPointsPx?: Point[];
  blocksPlacement: boolean;
}

export default function UploadFloorPlanPage() {
  const user = useCurrentUser();
  const canManage = user ? MANAGER_ROLES.has(user.role) : false;
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);

  // --- Upload step ---
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadId, setUploadId] = useState<string | null>(null);

  // --- Shared upload row, refreshed after parse/calibrate ---
  const [upload, setUpload] = useState<UploadRow | null>(null);

  // --- Calibration step ---
  const [manualMode, setManualMode] = useState(false);
  const [calPoints, setCalPoints] = useState<Point[]>([]); // image-px space
  const [calDistance, setCalDistance] = useState("");
  const [calUnit, setCalUnit] = useState<"ft" | "in">("ft");
  const [calibrating, setCalibrating] = useState(false);

  // --- Review step ---
  const [venueName, setVenueName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [ceilingHeightFt, setCeilingHeightFt] = useState("");
  const [boundaryPx, setBoundaryPx] = useState<Point[]>([]);
  const [obstacles, setObstacles] = useState<EditableObstacle[]>([]);
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);
  const [committing, setCommitting] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setError(null);
    if (selected && selected.size > MAX_FILE_BYTES) {
      setError("File is too large. Maximum size is 15MB.");
      setFile(null);
      return;
    }
    setFile(selected);
  }

  const runParse = useCallback(async (id: string) => {
    setStep("parsing");
    setError(null);
    try {
      const parseRes = await fetch(`/api/rooms/plan-uploads/${id}/parse`, { method: "POST" });
      const parseBody = await parseRes.json().catch(() => ({}));
      if (!parseRes.ok) {
        throw new Error(parseBody.error ?? `AI parsing failed (${parseRes.status})`);
      }
      setUpload(parseBody.upload);
      setStep("calibrate");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "AI parsing failed.");
      setStep("calibrate"); // stay reachable so the user can retry from a visible screen
    }
  }, []);

  async function handleUpload() {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/rooms/plan-uploads", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setUploadId(data.uploadId);
      await runParse(data.uploadId);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  // --- Calibration ---

  const imageWidthPx = upload?.backgroundImageWidthPx ?? 0;
  const imageHeightPx = upload?.backgroundImageHeightPx ?? 0;
  const viewScale =
    imageWidthPx > 0 && imageHeightPx > 0
      ? Math.min(MAX_VIEW_WIDTH / imageWidthPx, MAX_VIEW_HEIGHT / imageHeightPx, 1)
      : 1;
  const viewW = imageWidthPx * viewScale;
  const viewH = imageHeightPx * viewScale;
  const bgImage = useHTMLImage(upload?.backgroundImageUrl);

  const scaleNote = upload?.aiRawResponseJson?.scaleNote;
  const canUseScaleNote =
    upload?.originalFileType === "pdf" &&
    (upload?.aiScaleConfidence === "high" || upload?.aiScaleConfidence === "medium") &&
    scaleNote?.drawnInchesPerRealFoot !== undefined;

  // Uploads that can't use a scale note (images, or low/none confidence) go
  // straight to manual calibration — derived rather than synced via an
  // effect, since it's a pure function of upload/canUseScaleNote and the
  // user can still explicitly opt into manual mode via `manualMode`.
  const effectiveManualMode = manualMode || !canUseScaleNote;

  async function submitCalibration(
    body:
      | { method: "scale_note"; drawnInchesPerRealFoot: number }
      | { method: "manual_line"; p1: Point; p2: Point; realWorldInches: number }
  ) {
    if (!upload) return;
    setCalibrating(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/plan-uploads/${upload.id}/calibrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resBody.error ? JSON.stringify(resBody.error) : `Calibration failed (${res.status})`);
      }
      const calibratedUpload: UploadRow = resBody.upload;
      setUpload(calibratedUpload);
      initReviewState(calibratedUpload);
      setStep("review");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Calibration failed.");
    } finally {
      setCalibrating(false);
    }
  }

  function handleUseScaleNote() {
    if (!scaleNote?.drawnInchesPerRealFoot) return;
    submitCalibration({ method: "scale_note", drawnInchesPerRealFoot: scaleNote.drawnInchesPerRealFoot });
  }

  function handleStageClickForCalibration(e: Konva.KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    const imagePt = { x: pos.x / viewScale, y: pos.y / viewScale };
    setCalPoints((prev) => {
      if (prev.length >= 2) return [imagePt];
      return [...prev, imagePt];
    });
  }

  function handleManualCalibrate() {
    if (calPoints.length !== 2) {
      setError("Click two points on the drawing first.");
      return;
    }
    const distanceValue = Number(calDistance);
    if (!distanceValue || distanceValue <= 0) {
      setError("Enter a positive real-world distance for the line you drew.");
      return;
    }
    const realWorldInches = calUnit === "ft" ? distanceValue * 12 : distanceValue;
    submitCalibration({ method: "manual_line", p1: calPoints[0], p2: calPoints[1], realWorldInches });
  }

  // --- Review step init ---

  function initReviewState(u: UploadRow) {
    const w = u.backgroundImageWidthPx ?? 0;
    const h = u.backgroundImageHeightPx ?? 0;
    const boundaryNorm = u.proposedBoundaryJson ?? [];
    setBoundaryPx(boundaryNorm.map((p) => normToPx(p, w, h)));

    const proposed = u.proposedObstaclesJson ?? [];
    setObstacles(
      proposed.map((o) => {
        const base = normToPx({ x: o.x ?? 0, y: o.y ?? 0 }, w, h);
        return {
          localId: nextLocalId(),
          type: o.type,
          shape: o.shape,
          xPx: base.x,
          yPx: base.y,
          widthPx: o.widthNorm !== undefined ? o.widthNorm * w : undefined,
          lengthPx: o.lengthNorm !== undefined ? o.lengthNorm * h : undefined,
          diameterPx: o.diameterNorm !== undefined ? o.diameterNorm * w : undefined,
          rotation: o.rotation ?? 0,
          polygonPointsPx: o.polygonPointsNorm?.map((p) => normToPx(p, w, h)),
          blocksPlacement: true,
        };
      })
    );
  }

  // --- Boundary vertex editing ---

  function updateVertex(idx: number, pt: Point) {
    setBoundaryPx((prev) => prev.map((p, i) => (i === idx ? pt : p)));
  }

  function deleteVertex(idx: number) {
    setBoundaryPx((prev) => (prev.length <= 3 ? prev : prev.filter((_, i) => i !== idx)));
    setSelectedVertexIdx(null);
  }

  function insertVertexOnEdge(idx: number) {
    // Inserts a new vertex at the midpoint of the edge starting at idx.
    setBoundaryPx((prev) => {
      const a = prev[idx];
      const b = prev[(idx + 1) % prev.length];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = [...prev];
      next.splice(idx + 1, 0, mid);
      return next;
    });
  }

  // --- Obstacle editing ---

  function updateObstacle(localId: string, changes: Partial<EditableObstacle>) {
    setObstacles((prev) => prev.map((o) => (o.localId === localId ? { ...o, ...changes } : o)));
  }

  function deleteObstacle(localId: string) {
    setObstacles((prev) => prev.filter((o) => o.localId !== localId));
    if (selectedObstacleId === localId) setSelectedObstacleId(null);
  }

  function addObstacle() {
    const pxPerInch = upload?.pxPerInch ?? 1;
    const bbox = boundaryPx.length ? polygonBoundingBox(boundaryPx) : { minX: 0, minY: 0, width: 0, height: 0 };
    const centerX = bbox.minX + bbox.width / 2;
    const centerY = bbox.minY + bbox.height / 2;
    const sizePx = DEFAULT_OBSTACLE_SIZE_IN * pxPerInch;
    const newObstacle: EditableObstacle = {
      localId: nextLocalId(),
      type: "other",
      shape: "rect",
      xPx: centerX,
      yPx: centerY,
      widthPx: sizePx,
      lengthPx: sizePx,
      rotation: 0,
      blocksPlacement: true,
    };
    setObstacles((prev) => [...prev, newObstacle]);
    setSelectedObstacleId(newObstacle.localId);
  }

  const selectedObstacle = obstacles.find((o) => o.localId === selectedObstacleId) ?? null;

  // --- Commit ---

  async function handleCommit() {
    if (!upload || !upload.pxPerInch) return;
    setError(null);
    if (boundaryPx.length < 3) {
      setError("The room boundary needs at least 3 points.");
      return;
    }
    if (!venueName.trim() || !roomName.trim()) {
      setError("Venue name and room name are required.");
      return;
    }
    setCommitting(true);
    try {
      const pxPerInch = upload.pxPerInch;
      const boundaryInches = boundaryPx.map((p) => pxToInchPoint(p, pxPerInch));
      const obstaclesInches = obstacles.map((o) => ({
        type: o.type,
        shape: o.shape,
        x: o.shape !== "polygon" ? pxToInchPoint({ x: o.xPx, y: o.yPx }, pxPerInch).x : undefined,
        y: o.shape !== "polygon" ? pxToInchPoint({ x: o.xPx, y: o.yPx }, pxPerInch).y : undefined,
        widthIn: o.widthPx !== undefined ? o.widthPx / pxPerInch : undefined,
        lengthIn: o.lengthPx !== undefined ? o.lengthPx / pxPerInch : undefined,
        diameterIn: o.diameterPx !== undefined ? o.diameterPx / pxPerInch : undefined,
        rotation: o.rotation,
        polygonPoints: o.polygonPointsPx?.map((p) => pxToInchPoint(p, pxPerInch)),
        blocksPlacement: o.blocksPlacement,
      }));

      const res = await fetch(`/api/rooms/plan-uploads/${upload.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueName,
          roomName,
          ceilingHeightFt: ceilingHeightFt ? Number(ceilingHeightFt) : undefined,
          boundary: boundaryInches,
          obstacles: obstaclesInches,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ? JSON.stringify(body.error) : `Commit failed (${res.status})`);
      }
      setStep("done");
      router.push("/rooms");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Couldn't create the room.");
    } finally {
      setCommitting(false);
    }
  }

  const notes = upload?.aiRawResponseJson?.notes;

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopNav />
      <div className="max-w-6xl mx-auto p-6 flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-1">Upload a Floor Plan</h1>
          <p className="text-xs text-neutral-500">
            Upload a PDF or image of a venue floor plan, confirm its scale, then review and correct the
            AI&apos;s traced boundary and obstacles before creating a real room.
          </p>
        </div>

        {user && !canManage ? (
          <p className="text-sm text-neutral-500 bg-white border border-neutral-200 rounded-lg px-4 py-3">
            Only administrators and sales managers can upload floor plans.{" "}
            <Link href="/rooms" className="underline">
              Back to Rooms
            </Link>
          </p>
        ) : (
          <>
            <StepIndicator step={step} />

            {step === "upload" && (
              <div className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-3 max-w-xl">
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg"
                  onChange={handleFileChange}
                  className="text-sm"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="self-start text-sm px-4 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                >
                  {uploading ? "Uploading…" : "Upload & Parse"}
                </button>
              </div>
            )}

            {step === "parsing" && (
              <div className="bg-white border border-neutral-200 rounded-lg p-6 max-w-xl flex flex-col gap-3 items-start">
                <p className="text-sm text-neutral-700">
                  AI is reading the floor plan — tracing the room boundary, obstacles, and looking for a
                  printed scale note. This can take up to a minute for a detailed drawing.
                </p>
                <Spinner />
              </div>
            )}

            {step === "calibrate" && upload && (
              <div className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-4 max-w-3xl">
                {error && <p className="text-sm text-red-600">{error}</p>}
                {!upload.proposedBoundaryJson && (
                  <div className="flex flex-col gap-2 items-start">
                    <p className="text-sm text-red-600">Parsing failed or hasn&apos;t completed.</p>
                    <button
                      onClick={() => uploadId && runParse(uploadId)}
                      className="text-sm px-4 py-2 rounded-md border border-neutral-300 hover:border-neutral-500 transition-colors"
                    >
                      Retry AI parsing
                    </button>
                  </div>
                )}

                {upload.proposedBoundaryJson && !effectiveManualMode && canUseScaleNote && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-neutral-700">
                      Detected scale note (confidence: <strong>{upload.aiScaleConfidence}</strong>):
                    </p>
                    <pre className="text-sm bg-neutral-100 rounded-md p-3 font-mono">
                      {scaleNote?.rawText ?? "(no text captured)"}
                    </pre>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleUseScaleNote}
                        disabled={calibrating}
                        className="text-sm px-4 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                      >
                        {calibrating ? "Calibrating…" : "Use this scale"}
                      </button>
                      <button
                        onClick={() => setManualMode(true)}
                        className="text-sm text-neutral-600 underline"
                      >
                        This looks wrong, let me calibrate manually
                      </button>
                    </div>
                  </div>
                )}

                {upload.proposedBoundaryJson && effectiveManualMode && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-neutral-700">
                      Click two points on the drawing that you know the real-world distance between (e.g.
                      the two ends of a wall), then enter that distance.
                    </p>
                    <div className="border border-neutral-200 rounded-md overflow-hidden inline-block">
                      <Stage width={viewW} height={viewH} onClick={handleStageClickForCalibration}>
                        <Layer>
                          {bgImage && <KonvaImage image={bgImage} width={viewW} height={viewH} />}
                          {calPoints.length === 2 && (
                            <Line
                              points={calPoints.flatMap((p) => [p.x * viewScale, p.y * viewScale])}
                              stroke="#2563eb"
                              strokeWidth={2}
                            />
                          )}
                          {calPoints.map((p, i) => (
                            <Circle
                              key={i}
                              x={p.x * viewScale}
                              y={p.y * viewScale}
                              radius={6}
                              fill="#2563eb"
                              draggable
                              onDragMove={(e) => {
                                const node = e.target;
                                const updated = { x: node.x() / viewScale, y: node.y() / viewScale };
                                setCalPoints((prev) => prev.map((pt, idx) => (idx === i ? updated : pt)));
                              }}
                            />
                          ))}
                        </Layer>
                      </Stage>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-neutral-700 flex items-center gap-2">
                        Real-world distance
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={calDistance}
                          onChange={(e) => setCalDistance(e.target.value)}
                          className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm w-28"
                        />
                      </label>
                      <select
                        value={calUnit}
                        onChange={(e) => setCalUnit(e.target.value as "ft" | "in")}
                        className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                      >
                        <option value="ft">feet</option>
                        <option value="in">inches</option>
                      </select>
                      <button
                        onClick={handleManualCalibrate}
                        disabled={calibrating || calPoints.length !== 2}
                        className="text-sm px-4 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                      >
                        {calibrating ? "Calibrating…" : "Calibrate"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === "review" && upload && upload.pxPerInch && (
              <div className="flex gap-4 items-start">
                <div className="flex-1 flex flex-col gap-4">
                  <div className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-3">
                    <div className="grid grid-cols-3 gap-3">
                      <label className="flex flex-col gap-1 text-sm text-neutral-700">
                        Venue name
                        <input
                          required
                          value={venueName}
                          onChange={(e) => setVenueName(e.target.value)}
                          className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm text-neutral-700">
                        Room name
                        <input
                          required
                          value={roomName}
                          onChange={(e) => setRoomName(e.target.value)}
                          className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm text-neutral-700">
                        Ceiling height (ft, optional)
                        <input
                          type="number"
                          min={1}
                          step={0.5}
                          value={ceilingHeightFt}
                          onChange={(e) => setCeilingHeightFt(e.target.value)}
                          className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                        />
                      </label>
                    </div>
                    <div className="text-xs text-neutral-500 flex flex-col gap-1">
                      <span>
                        AI scale confidence: <strong>{upload.aiScaleConfidence ?? "n/a"}</strong> · Calibrated at{" "}
                        {upload.pxPerInch.toFixed(4)} px/inch
                      </span>
                      {notes && <span>AI notes: {notes}</span>}
                      <span>
                        Drag the boundary&apos;s corner handles to fix the room outline. Double-click an edge to
                        add a corner there; select a corner and press the delete key (or the button below the
                        canvas) to remove it. Click an obstacle to edit it in the side panel.
                      </span>
                    </div>
                  </div>

                  <div className="border border-neutral-200 rounded-md overflow-hidden inline-block bg-neutral-100">
                    <Stage
                      width={viewW}
                      height={viewH}
                      onClick={(e) => {
                        if (e.target.getStage() === e.target) {
                          setSelectedObstacleId(null);
                          setSelectedVertexIdx(null);
                        }
                      }}
                    >
                      <Layer>
                        {bgImage && <KonvaImage image={bgImage} width={viewW} height={viewH} opacity={0.85} />}

                        <Line
                          points={boundaryPx.flatMap((p) => [p.x * viewScale, p.y * viewScale])}
                          closed
                          stroke="#16a34a"
                          strokeWidth={2}
                          fill="rgba(22,163,74,0.08)"
                        />

                        {boundaryPx.map((p, i) => (
                          <Group key={i}>
                            <Circle
                              x={p.x * viewScale}
                              y={p.y * viewScale}
                              radius={5}
                              fill={selectedVertexIdx === i ? "#dc2626" : "#16a34a"}
                              draggable
                              onClick={(e) => {
                                e.cancelBubble = true;
                                setSelectedVertexIdx(i);
                                setSelectedObstacleId(null);
                              }}
                              onDblClick={(e) => {
                                e.cancelBubble = true;
                                insertVertexOnEdge(i);
                              }}
                              onDragMove={(e) => {
                                const node = e.target;
                                updateVertex(i, { x: node.x() / viewScale, y: node.y() / viewScale });
                              }}
                              onDragEnd={(e) => {
                                const node = e.target;
                                const dropped = { x: node.x() / viewScale, y: node.y() / viewScale };
                                setBoundaryPx((prev) => {
                                  const withDrop = prev.map((pt, idx) => (idx === i ? dropped : pt));
                                  return snapVertexToNeighbors(withDrop, i);
                                });
                              }}
                            />
                          </Group>
                        ))}

                        {obstacles.map((o) => (
                          <ObstacleShape
                            key={o.localId}
                            obstacle={o}
                            viewScale={viewScale}
                            selected={o.localId === selectedObstacleId}
                            onSelect={() => {
                              setSelectedObstacleId(o.localId);
                              setSelectedVertexIdx(null);
                            }}
                            onDragMove={(xPx, yPx) => updateObstacle(o.localId, { xPx, yPx })}
                          />
                        ))}
                      </Layer>
                    </Stage>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => selectedVertexIdx !== null && deleteVertex(selectedVertexIdx)}
                      disabled={selectedVertexIdx === null || boundaryPx.length <= 3}
                      className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Delete selected corner
                    </button>
                    <button
                      onClick={addObstacle}
                      className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 hover:border-neutral-500 transition-colors"
                    >
                      + Add obstacle
                    </button>
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <button
                    onClick={handleCommit}
                    disabled={committing}
                    className="self-start text-sm px-5 py-2.5 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                  >
                    {committing ? "Creating room…" : "Confirm & Create Room"}
                  </button>
                </div>

                <ObstaclePanel
                  obstacle={selectedObstacle}
                  pxPerInch={upload.pxPerInch}
                  onChange={(changes) => selectedObstacle && updateObstacle(selectedObstacle.localId, changes)}
                  onDelete={() => selectedObstacle && deleteObstacle(selectedObstacle.localId)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "1. Upload" },
    { key: "parsing", label: "2. AI Parsing" },
    { key: "calibrate", label: "3. Calibrate Scale" },
    { key: "review", label: "4. Review & Edit" },
  ];
  const order: Step[] = ["upload", "parsing", "calibrate", "review", "done"];
  const currentIdx = order.indexOf(step);
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      {steps.map((s, i) => (
        <span key={s.key} className={i <= currentIdx ? "text-neutral-800 font-medium" : ""}>
          {s.label}
          {i < steps.length - 1 && <span className="mx-2 text-neutral-300">→</span>}
        </span>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="h-6 w-6 rounded-full border-2 border-neutral-300 border-t-neutral-800 animate-spin"
      aria-label="Loading"
    />
  );
}

function ObstacleShape({
  obstacle,
  viewScale,
  selected,
  onSelect,
  onDragMove,
}: {
  obstacle: EditableObstacle;
  viewScale: number;
  selected: boolean;
  onSelect: () => void;
  onDragMove: (xPx: number, yPx: number) => void;
}) {
  // Doors/entrances get a distinct warm color (matching RoomCanvas's
  // door-swing treatment) so they read as openings rather than generic
  // solid obstacles, even in this simpler drag-to-edit view.
  const isDoorLike = DOOR_LIKE_OBSTACLE_TYPES.has(obstacle.type);
  const fill = isDoorLike ? "rgba(161,98,7,0.15)" : "rgba(148,163,184,0.6)";
  const stroke = selected ? "#2563eb" : isDoorLike ? "#a16207" : "#475569";
  const strokeWidth = selected ? 2 : isDoorLike ? 2 : 1;
  const x = obstacle.xPx * viewScale;
  const y = obstacle.yPx * viewScale;

  const commonHandlers = {
    draggable: true,
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      onSelect();
    },
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      onDragMove(node.x() / viewScale, node.y() / viewScale);
    },
  };

  if (obstacle.shape === "circle") {
    const r = ((obstacle.diameterPx ?? 24) / 2) * viewScale;
    return (
      <Group>
        <Circle x={x} y={y} radius={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} {...commonHandlers} />
        <Text x={x - r} y={y - 6} width={r * 2} align="center" text={obstacle.type} fontSize={10} listening={false} />
      </Group>
    );
  }

  if (obstacle.shape === "polygon") {
    const points = (obstacle.polygonPointsPx ?? []).flatMap((p) => [p.x * viewScale, p.y * viewScale]);
    return (
      <Group>
        <Line
          points={points}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          draggable
          onClick={(e) => {
            e.cancelBubble = true;
            onSelect();
          }}
          onDragEnd={(e) => {
            // Polygons drag as a whole shape via Konva's own x/y offset;
            // fold that into the stored points rather than tracking a
            // separate group offset, so polygonPointsPx stays the single
            // source of truth.
            const node = e.target;
            const dx = node.x() / viewScale;
            const dy = node.y() / viewScale;
            node.x(0);
            node.y(0);
            onSelect();
            onDragMove(obstacle.xPx + dx, obstacle.yPx + dy);
          }}
        />
        <Text x={x - 40} y={y - 6} width={80} align="center" text={obstacle.type} fontSize={10} listening={false} />
      </Group>
    );
  }

  const w = (obstacle.widthPx ?? 24) * viewScale;
  const h = (obstacle.lengthPx ?? 24) * viewScale;
  return (
    <Group>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        offsetX={w / 2}
        offsetY={h / 2}
        rotation={obstacle.rotation}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        {...commonHandlers}
      />
      <Text x={x - w / 2} y={y - 6} width={w} align="center" text={obstacle.type} fontSize={10} listening={false} />
    </Group>
  );
}

function ObstaclePanel({
  obstacle,
  pxPerInch,
  onChange,
  onDelete,
}: {
  obstacle: EditableObstacle | null;
  pxPerInch: number;
  onChange: (changes: Partial<EditableObstacle>) => void;
  onDelete: () => void;
}) {
  if (!obstacle) {
    return (
      <div className="w-72 shrink-0 bg-white border border-neutral-200 rounded-lg p-4 text-sm text-neutral-500">
        Select an obstacle on the canvas to edit its details, or add a new one.
      </div>
    );
  }

  const widthIn = obstacle.widthPx !== undefined ? obstacle.widthPx / pxPerInch : undefined;
  const lengthIn = obstacle.lengthPx !== undefined ? obstacle.lengthPx / pxPerInch : undefined;
  const diameterIn = obstacle.diameterPx !== undefined ? obstacle.diameterPx / pxPerInch : undefined;

  return (
    <div className="w-72 shrink-0 bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-neutral-800">Edit Obstacle</h2>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Type
        <select
          value={obstacle.type}
          onChange={(e) => onChange({ type: e.target.value })}
          className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
        >
          {OBSTACLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>

      {obstacle.shape === "circle" ? (
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Diameter (in)
          <input
            type="number"
            min={1}
            value={diameterIn?.toFixed(1) ?? ""}
            onChange={(e) => onChange({ diameterPx: Number(e.target.value) * pxPerInch })}
            className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
          />
        </label>
      ) : obstacle.shape === "rect" ? (
        <>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Width (in)
            <input
              type="number"
              min={1}
              value={widthIn?.toFixed(1) ?? ""}
              onChange={(e) => onChange({ widthPx: Number(e.target.value) * pxPerInch })}
              className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Length (in)
            <input
              type="number"
              min={1}
              value={lengthIn?.toFixed(1) ?? ""}
              onChange={(e) => onChange({ lengthPx: Number(e.target.value) * pxPerInch })}
              className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-neutral-700">
            Rotation (deg)
            <input
              type="number"
              value={obstacle.rotation}
              onChange={(e) => onChange({ rotation: Number(e.target.value) })}
              className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
            />
          </label>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Polygon obstacle with {obstacle.polygonPointsPx?.length ?? 0} vertices, traced from the AI proposal.
          Drag it to reposition; per-vertex editing isn&apos;t supported yet — delete and re-add manually if the
          shape itself is wrong.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={obstacle.blocksPlacement}
          onChange={(e) => onChange({ blocksPlacement: e.target.checked })}
        />
        Blocks equipment placement
      </label>

      <button
        onClick={onDelete}
        className="self-start text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50 transition-colors"
      >
        Delete obstacle
      </button>
    </div>
  );
}

"use client";

import { EquipmentItem } from "@/lib/geometry/types";

interface ToolbarProps {
  equipment: EquipmentItem[];
  onAdd: (equipmentItemId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  hasSelection: boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onSave: () => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onExportPdf: () => void;
  hasBackgroundImage?: boolean;
  showBackground?: boolean;
  onToggleBackground?: () => void;
  bgOpacity?: number;
  onBgOpacityChange?: (opacity: number) => void;
}

export function Toolbar({
  equipment,
  onAdd,
  onDuplicate,
  onDelete,
  hasSelection,
  zoom,
  onZoomChange,
  showGrid,
  onToggleGrid,
  snapEnabled,
  onToggleSnap,
  onSave,
  saveStatus,
  onExportPdf,
  hasBackgroundImage,
  showBackground,
  onToggleBackground,
  bgOpacity,
  onBgOpacityChange,
}: ToolbarProps) {
  return (
    <div className="flex flex-col gap-4 w-64 shrink-0 border-r border-neutral-200 bg-neutral-50 p-4 h-full overflow-y-auto">
      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">Add Equipment</h2>
        <div className="flex flex-col gap-1.5">
          {equipment.map((item) => (
            <button
              key={item.id}
              onClick={() => onAdd(item.id)}
              className="text-left text-sm px-3 py-2 rounded-md bg-white border border-neutral-200 hover:border-neutral-400 hover:bg-neutral-100 transition-colors flex items-center gap-2"
            >
              <span
                className="inline-block w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-neutral-200 pt-4">
        <button
          onClick={onSave}
          disabled={saveStatus === "saving"}
          className="w-full text-sm px-3 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
        >
          {saveStatus === "saving" ? "Saving…" : "Save Layout (Ctrl/Cmd+S)"}
        </button>
        <p className="text-xs mt-1.5 h-4">
          {saveStatus === "saved" && <span className="text-emerald-600">Saved</span>}
          {saveStatus === "error" && <span className="text-red-600">Save failed — try again</span>}
        </p>
        <button
          onClick={onExportPdf}
          className="w-full text-sm px-3 py-2 rounded-md bg-white border border-neutral-300 hover:border-neutral-500 hover:bg-neutral-100 transition-colors mt-2"
        >
          Export PDF
        </button>
        <p className="text-xs text-neutral-500 mt-1">Saves, then downloads a scaled floor plan.</p>
      </div>

      <div className="border-t border-neutral-200 pt-4">
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">Selected Object</h2>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={onDuplicate}
            disabled={!hasSelection}
            className="text-sm px-3 py-2 rounded-md bg-white border border-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed hover:border-neutral-400 hover:bg-neutral-100 transition-colors"
          >
            Duplicate (Ctrl/Cmd+D)
          </button>
          <button
            onClick={onDelete}
            disabled={!hasSelection}
            className="text-sm px-3 py-2 rounded-md bg-white border border-red-200 text-red-700 disabled:opacity-40 disabled:cursor-not-allowed hover:border-red-400 hover:bg-red-50 transition-colors"
          >
            Delete (Del/Backspace)
          </button>
        </div>
      </div>

      <div className="border-t border-neutral-200 pt-4">
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">View</h2>
        <label className="text-xs text-neutral-600 flex flex-col gap-1 mb-3">
          Zoom: {Math.round(zoom * 100)}%
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.05}
            value={zoom}
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          />
        </label>
        <label className="text-xs text-neutral-600 flex items-center gap-2 mb-2">
          <input type="checkbox" checked={showGrid} onChange={onToggleGrid} />
          Show grid (1ft)
        </label>
        <label className="text-xs text-neutral-600 flex items-center gap-2">
          <input type="checkbox" checked={snapEnabled} onChange={onToggleSnap} />
          Snap to grid
        </label>
      </div>

      {hasBackgroundImage && (
        <div className="border-t border-neutral-200 pt-4">
          <h2 className="text-sm font-semibold text-neutral-700 mb-2">Floor Plan</h2>
          <label className="text-xs text-neutral-600 flex items-center gap-2 mb-3">
            <input type="checkbox" checked={!!showBackground} onChange={onToggleBackground} />
            Show floor plan
          </label>
          <label className="text-xs text-neutral-600 flex flex-col gap-1">
            Opacity: {Math.round((bgOpacity ?? 0) * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={bgOpacity ?? 0}
              onChange={(e) => onBgOpacityChange?.(parseFloat(e.target.value))}
            />
          </label>
        </div>
      )}

      <div className="border-t border-neutral-200 pt-4 text-xs text-neutral-500 leading-relaxed">
        Drag to move. Click an object then drag the rotate handle to turn it.
        Scroll to pan, or use the zoom slider above.
      </div>
    </div>
  );
}

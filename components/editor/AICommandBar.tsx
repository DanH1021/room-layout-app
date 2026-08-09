"use client";

import { useState } from "react";
import { EquipmentItem, LayoutObject } from "@/lib/geometry/types";
import { StructuredLayoutRequest } from "@/lib/schemas/aiRequest";
import { executeStructuredRequest } from "@/lib/ai/executeRequest";

interface AICommandBarProps {
  layoutId: string;
  objects: LayoutObject[];
  getEquipmentItem: (id: string) => EquipmentItem;
  room: { widthFt: number; lengthFt: number };
  onApply: (newObjects: LayoutObject[]) => void;
}

interface Preview {
  request: StructuredLayoutRequest;
  newObjects: LayoutObject[];
  changeSummary: string[];
}

export function AICommandBar({ layoutId, objects, getEquipmentItem, room, onApply }: AICommandBarProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  async function handleAsk() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/ai/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, layoutId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const request: StructuredLayoutRequest = data.request;
      const { objects: newObjects, changeSummary } = executeStructuredRequest(
        request,
        objects,
        getEquipmentItem,
        room
      );
      setPreview({ request, newObjects, changeSummary });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function confirm() {
    if (!preview) return;
    onApply(preview.newObjects);
    setPreview(null);
    setPrompt("");
  }

  function cancel() {
    setPreview(null);
  }

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-[min(640px,90%)]">
      {preview && (
        <div className="mb-2 bg-white rounded-lg shadow-lg border border-neutral-200 p-3 text-sm">
          <p className="text-neutral-800 font-medium mb-1.5">{preview.request.intent}</p>
          {preview.changeSummary.length > 0 && (
            <ul className="text-neutral-600 text-xs mb-1.5 space-y-0.5">
              {preview.changeSummary.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          )}
          {preview.request.warnings && preview.request.warnings.length > 0 && (
            <ul className="text-amber-700 text-xs mb-2 space-y-0.5">
              {preview.request.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={confirm}
              className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white hover:bg-neutral-700 transition-colors"
            >
              Apply changes
            </button>
            <button
              onClick={cancel}
              className="text-xs px-3 py-1.5 rounded-md bg-white border border-neutral-200 hover:bg-neutral-50 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mb-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div className="bg-white rounded-full shadow-lg border border-neutral-200 flex items-center px-4 py-2 gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAsk();
          }}
          placeholder='Try "set up rounds of 8 for 80 guests" or "clear the room"'
          disabled={loading}
          className="flex-1 text-sm outline-none disabled:opacity-50"
        />
        <button
          onClick={handleAsk}
          disabled={loading || !prompt.trim()}
          className="text-xs px-3 py-1.5 rounded-full bg-neutral-900 text-white disabled:opacity-40 hover:bg-neutral-700 transition-colors shrink-0"
        >
          {loading ? "Thinking…" : "Ask AI"}
        </button>
      </div>
    </div>
  );
}

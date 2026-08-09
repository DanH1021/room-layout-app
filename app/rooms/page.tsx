"use client";

import { useEffect, useState, useCallback } from "react";
import { TopNav } from "@/components/dashboard/TopNav";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

const MANAGER_ROLES = new Set(["administrator", "sales_manager"]);

interface RoomRow {
  id: string;
  venueName: string;
  roomName: string;
  widthFt: number;
  lengthFt: number;
  ceilingHeightFt: number | null;
}

export default function RoomsPage() {
  const user = useCurrentUser();
  const canManage = user ? MANAGER_ROLES.has(user.role) : false;
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [widthFt, setWidthFt] = useState("");
  const [lengthFt, setLengthFt] = useState("");
  const [ceilingHeightFt, setCeilingHeightFt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/rooms");
    const data = await res.json();
    setRooms(data.rooms);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      setError("Couldn't load rooms. Is the database running?");
    });
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueName,
          roomName,
          widthFt: Number(widthFt),
          lengthFt: Number(lengthFt),
          ceilingHeightFt: ceilingHeightFt ? Number(ceilingHeightFt) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? JSON.stringify(body.error) : `Create failed (${res.status})`);
      }
      setVenueName("");
      setRoomName("");
      setWidthFt("");
      setLengthFt("");
      setCeilingHeightFt("");
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Couldn't create room");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopNav />
      <div className="max-w-3xl mx-auto p-6 flex flex-col gap-8">
        <div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-1">New Room</h1>
          <p className="text-xs text-neutral-500 mb-3">
            The MVP creates a simple rectangular room from width and length. Tracing an irregular boundary
            (columns, alcoves, angled walls) from a floor plan is a later phase.
          </p>
          {user && !canManage ? (
            <p className="text-sm text-neutral-500 bg-white border border-neutral-200 rounded-lg px-4 py-3">
              Only administrators and sales managers can add rooms. Ask one of them, or view the existing rooms below.
            </p>
          ) : (
          <form onSubmit={handleCreate} className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Venue name
                <input
                  required
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder="Great Plains Hospitality"
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Room name
                <input
                  required
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Grand Ballroom"
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Width (ft)
                <input
                  required
                  type="number"
                  min={1}
                  step={0.5}
                  value={widthFt}
                  onChange={(e) => setWidthFt(e.target.value)}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Length (ft)
                <input
                  required
                  type="number"
                  min={1}
                  step={0.5}
                  value={lengthFt}
                  onChange={(e) => setLengthFt(e.target.value)}
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="self-start text-sm px-4 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
            >
              {submitting ? "Creating…" : "Create Room"}
            </button>
          </form>
          )}
        </div>

        <div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-3">Rooms</h1>
          {rooms === null ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-neutral-500">No rooms yet — create one above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rooms.map((r) => (
                <div
                  key={r.id}
                  className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-medium text-neutral-800">
                      {r.venueName} — {r.roomName}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {r.widthFt}&apos; × {r.lengthFt}&apos;
                      {r.ceilingHeightFt ? ` · ${r.ceilingHeightFt}' ceiling` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

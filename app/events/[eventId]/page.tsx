"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { TopNav } from "@/components/dashboard/TopNav";

interface LayoutRow {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
}

interface EventDetail {
  id: string;
  name: string;
  eventDate: string;
  guestCountTarget: number | null;
  client: { name: string };
  roomTemplate: { venueName: string; roomName: string; widthFt: number; lengthFt: number };
  layouts: LayoutRow[];
}

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${params.eventId}`);
    if (!res.ok) throw new Error(`Failed to load event (${res.status})`);
    const data = await res.json();
    setEvent(data.event);
  }, [params.eventId]);

  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      setError("Couldn't load this event.");
    });
  }, [load]);

  async function handleCreateLayout(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${params.eventId}/layouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLayoutName || `Layout ${(event?.layouts.length ?? 0) + 1}`,
          copyFromLayoutId: copyFrom || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      const data = await res.json();
      router.push(`/editor/${data.layout.id}`);
    } catch (err) {
      console.error(err);
      setError("Couldn't create a new layout.");
    } finally {
      setCreating(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <TopNav />
        <div className="max-w-3xl mx-auto p-6 text-sm text-red-600">{error}</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <TopNav />
        <div className="max-w-3xl mx-auto p-6 text-sm text-neutral-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopNav />
      <div className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
        <div>
          <Link href="/events" className="text-xs text-neutral-500 hover:text-neutral-800">
            &larr; All events
          </Link>
          <h1 className="text-xl font-semibold text-neutral-800 mt-1">{event.name}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            {event.client.name} · {event.roomTemplate.venueName} — {event.roomTemplate.roomName} (
            {event.roomTemplate.widthFt}&apos;×{event.roomTemplate.lengthFt}&apos;) ·{" "}
            {new Date(event.eventDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            {event.guestCountTarget ? ` · guest target ${event.guestCountTarget}` : ""}
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-neutral-700 mb-2">New Layout</h2>
          <form onSubmit={handleCreateLayout} className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Name
                <input
                  value={newLayoutName}
                  onChange={(e) => setNewLayoutName(e.target.value)}
                  placeholder={`Layout ${event.layouts.length + 1}`}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Start from (optional)
                <select
                  value={copyFrom}
                  onChange={(e) => setCopyFrom(e.target.value)}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="">Blank</option>
                  {event.layouts.map((l) => (
                    <option key={l.id} value={l.id}>
                      Copy of {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="self-start text-sm px-4 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
            >
              {creating ? "Creating…" : "Create & Open"}
            </button>
          </form>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-neutral-700 mb-2">Layouts</h2>
          {event.layouts.length === 0 ? (
            <p className="text-sm text-neutral-500">No layouts yet — create one above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {event.layouts.map((l) => (
                <Link
                  key={l.id}
                  href={`/editor/${l.id}`}
                  className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex items-center justify-between hover:border-neutral-400 transition-colors"
                >
                  <span className="text-sm font-medium text-neutral-800">{l.name}</span>
                  <span className="text-xs text-neutral-500 flex items-center gap-3">
                    <span className="capitalize px-2 py-0.5 rounded-full bg-neutral-100 border border-neutral-200">
                      {l.status.replace("_", " ")}
                    </span>
                    Updated {new Date(l.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

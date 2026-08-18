"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { TopNav } from "@/components/dashboard/TopNav";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

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
  const user = useCurrentUser();
  const canDelete = user ? user.role !== "read_only" : false;
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [deletingLayoutId, setDeletingLayoutId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  async function handleDeleteEvent() {
    if (!event) return;
    if (!window.confirm(`Delete "${event.name}"? This can't be undone.`)) return;
    setDeletingEvent(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/events/${params.eventId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }
      router.push("/events");
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : "Couldn't delete event");
      setDeletingEvent(false);
    }
  }

  async function handleDeleteLayout(layout: LayoutRow) {
    if (!window.confirm(`Delete layout "${layout.name}"? This can't be undone.`)) return;
    setDeletingLayoutId(layout.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/layouts/${layout.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }
      await load();
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : "Couldn't delete layout");
    } finally {
      setDeletingLayoutId(null);
    }
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
          <div className="flex items-start justify-between">
            <Link href="/events" className="text-xs text-neutral-500 hover:text-neutral-800">
              &larr; All events
            </Link>
            {canDelete && (
              <button
                onClick={handleDeleteEvent}
                disabled={deletingEvent}
                className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deletingEvent ? "Deleting…" : "Delete Event"}
              </button>
            )}
          </div>
          <h1 className="text-xl font-semibold text-neutral-800 mt-1">{event.name}</h1>
          <p className="text-sm text-neutral-600 mt-1">
            {event.client.name} · {event.roomTemplate.venueName} — {event.roomTemplate.roomName} (
            {event.roomTemplate.widthFt}&apos;×{event.roomTemplate.lengthFt}&apos;) ·{" "}
            {new Date(event.eventDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            {event.guestCountTarget ? ` · guest target ${event.guestCountTarget}` : ""}
          </p>
          {actionError && <p className="text-sm text-red-600 mt-2">{actionError}</p>}
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
                <div
                  key={l.id}
                  className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex items-center justify-between hover:border-neutral-400 transition-colors"
                >
                  <Link href={`/editor/${l.id}`} className="flex items-center justify-between flex-1 min-w-0 mr-4">
                    <span className="text-sm font-medium text-neutral-800">{l.name}</span>
                    <span className="text-xs text-neutral-500 flex items-center gap-3 mr-4">
                      <span className="capitalize px-2 py-0.5 rounded-full bg-neutral-100 border border-neutral-200">
                        {l.status.replace("_", " ")}
                      </span>
                      Updated {new Date(l.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </Link>
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteLayout(l)}
                      disabled={deletingLayoutId === l.id}
                      className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {deletingLayoutId === l.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

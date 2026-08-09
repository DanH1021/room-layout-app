"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TopNav } from "@/components/dashboard/TopNav";

interface RoomOption {
  id: string;
  venueName: string;
  roomName: string;
  widthFt: number;
  lengthFt: number;
}

interface ClientOption {
  id: string;
  name: string;
}

interface EventRow {
  id: string;
  name: string;
  eventDate: string;
  guestCountTarget: number | null;
  client: { id: string; name: string };
  roomTemplate: { id: string; venueName: string; roomName: string };
  layouts: { id: string }[];
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [roomTemplateId, setRoomTemplateId] = useState("");
  const [guestCountTarget, setGuestCountTarget] = useState("");
  const [clientMode, setClientMode] = useState<"existing" | "new">("new");
  const [clientId, setClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    const [eventsRes, roomsRes, clientsRes] = await Promise.all([
      fetch("/api/events"),
      fetch("/api/rooms"),
      fetch("/api/clients"),
    ]);
    const eventsData = await eventsRes.json();
    const roomsData = await roomsRes.json();
    const clientsData = await clientsRes.json();
    setEvents(eventsData.events);
    setRooms(roomsData.rooms);
    setClients(clientsData.clients);
    if (roomsData.rooms.length && !roomTemplateId) setRoomTemplateId(roomsData.rooms[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAll().catch((err) => {
      console.error(err);
      setError("Couldn't load events. Is the database running?");
    });
  }, [loadAll]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!roomTemplateId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          eventDate,
          roomTemplateId,
          guestCountTarget: guestCountTarget ? Number(guestCountTarget) : undefined,
          clientId: clientMode === "existing" ? clientId : undefined,
          newClientName: clientMode === "new" ? newClientName : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? JSON.stringify(body.error) : `Create failed (${res.status})`);
      }
      setName("");
      setEventDate("");
      setGuestCountTarget("");
      setNewClientName("");
      setClientId("");
      await loadAll();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Couldn't create event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopNav />
      <div className="max-w-4xl mx-auto p-6 flex flex-col gap-8">
        <div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-3">New Event</h1>
          {rooms.length === 0 && events !== null && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
              No rooms yet — <Link href="/rooms" className="underline">add a room</Link> before creating an event.
            </p>
          )}
          <form onSubmit={handleCreate} className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Event name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jensen Wedding"
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Event date
                <input
                  required
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Room
                <select
                  required
                  value={roomTemplateId}
                  onChange={(e) => setRoomTemplateId(e.target.value)}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.venueName} — {r.roomName} ({r.widthFt}&apos;×{r.lengthFt}&apos;)
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Guest count target
                <input
                  type="number"
                  min={1}
                  value={guestCountTarget}
                  onChange={(e) => setGuestCountTarget(e.target.value)}
                  placeholder="100"
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-4 text-sm text-neutral-700">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={clientMode === "new"}
                    onChange={() => setClientMode("new")}
                  />
                  New client
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={clientMode === "existing"}
                    onChange={() => setClientMode("existing")}
                    disabled={clients.length === 0}
                  />
                  Existing client
                </label>
              </div>
              {clientMode === "new" ? (
                <input
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Client / company name"
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              ) : (
                <select
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="" disabled>
                    Select a client…
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !roomTemplateId}
              className="self-start text-sm px-4 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
            >
              {submitting ? "Creating…" : "Create Event"}
            </button>
          </form>
        </div>

        <div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-3">Events</h1>
          {events === null ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-neutral-500">No events yet — create one above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {events.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/events/${ev.id}`}
                  className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex items-center justify-between hover:border-neutral-400 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-neutral-800">{ev.name}</div>
                    <div className="text-xs text-neutral-500">
                      {ev.client.name} · {ev.roomTemplate.venueName} — {ev.roomTemplate.roomName} ·{" "}
                      {new Date(ev.eventDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {ev.layouts.length} layout{ev.layouts.length === 1 ? "" : "s"}
                    {ev.guestCountTarget ? ` · target ${ev.guestCountTarget}` : ""}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

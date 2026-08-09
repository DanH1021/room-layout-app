"use client";

import { useEffect, useState, useCallback } from "react";
import { TopNav } from "@/components/dashboard/TopNav";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

const MANAGER_ROLES = new Set(["administrator", "sales_manager"]);
const CATEGORIES = ["table", "chair", "bar", "stage", "dance_floor", "av", "decor", "other"] as const;

interface EquipmentRow {
  id: string;
  name: string;
  category: string;
  shape: string;
  widthIn: number | null;
  lengthIn: number | null;
  diameterIn: number | null;
  defaultChairCount: number | null;
  clearanceIn: number;
  rotatable: boolean;
  stackable: boolean;
  inventoryQty: number | null;
  color: string;
  notes: string | null;
}

const emptyForm = {
  name: "",
  category: "table" as (typeof CATEGORIES)[number],
  shape: "rect" as "rect" | "circle",
  widthIn: "",
  lengthIn: "",
  diameterIn: "",
  defaultChairCount: "",
  clearanceIn: "0",
  rotatable: true,
  stackable: true,
  inventoryQty: "",
  color: "#c8a76b",
  notes: "",
};

export default function EquipmentPage() {
  const user = useCurrentUser();
  const canManage = user ? MANAGER_ROLES.has(user.role) : false;
  const [items, setItems] = useState<EquipmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/equipment");
    const data = await res.json();
    setItems(data.equipment);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      console.error(err);
      setError("Couldn't load equipment. Is the database running?");
    });
  }, [load]);

  function startEdit(item: EquipmentRow) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category as (typeof CATEGORIES)[number],
      shape: item.shape as "rect" | "circle",
      widthIn: item.widthIn?.toString() ?? "",
      lengthIn: item.lengthIn?.toString() ?? "",
      diameterIn: item.diameterIn?.toString() ?? "",
      defaultChairCount: item.defaultChairCount?.toString() ?? "",
      clearanceIn: item.clearanceIn.toString(),
      rotatable: item.rotatable,
      stackable: item.stackable,
      inventoryQty: item.inventoryQty?.toString() ?? "",
      color: item.color,
      notes: item.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        shape: form.shape,
        widthIn: form.shape === "rect" && form.widthIn ? Number(form.widthIn) : undefined,
        lengthIn: form.shape === "rect" && form.lengthIn ? Number(form.lengthIn) : undefined,
        diameterIn: form.shape === "circle" && form.diameterIn ? Number(form.diameterIn) : undefined,
        defaultChairCount: form.defaultChairCount ? Number(form.defaultChairCount) : undefined,
        clearanceIn: Number(form.clearanceIn || 0),
        rotatable: form.rotatable,
        stackable: form.stackable,
        inventoryQty: form.inventoryQty ? Number(form.inventoryQty) : undefined,
        color: form.color,
        notes: form.notes || undefined,
      };
      const res = await fetch(editingId ? `/api/equipment/${editingId}` : "/api/equipment", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ? JSON.stringify(body.error) : `Save failed (${res.status})`);
      }
      cancelEdit();
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Couldn't save equipment item");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/equipment/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Delete failed (${res.status})`);
      }
      await load();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Couldn't delete equipment item");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <TopNav />
      <div className="max-w-3xl mx-auto p-6 flex flex-col gap-8">
        <div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-1">{editingId ? "Edit Equipment Item" : "New Equipment Item"}</h1>
          <p className="text-xs text-neutral-500 mb-3">
            This is your org&apos;s real equipment library — every item here shows up in the editor&apos;s &quot;Add
            Equipment&quot; panel for every room.
          </p>
          {user && !canManage ? (
            <p className="text-sm text-neutral-500 bg-white border border-neutral-200 rounded-lg px-4 py-3">
              Only administrators and sales managers can manage the equipment library. Ask one of them, or view the
              library below.
            </p>
          ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder='60" Round Table (8-top)'
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as (typeof CATEGORIES)[number] }))}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Shape
                <select
                  value={form.shape}
                  onChange={(e) => setForm((f) => ({ ...f, shape: e.target.value as "rect" | "circle" }))}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                >
                  <option value="rect">Rectangle</option>
                  <option value="circle">Circle</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Color
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="border border-neutral-300 rounded-md px-2 py-1 h-9 w-full"
                />
              </label>

              {form.shape === "rect" ? (
                <>
                  <label className="flex flex-col gap-1 text-sm text-neutral-700">
                    Width (in)
                    <input
                      required
                      type="number"
                      min={1}
                      value={form.widthIn}
                      onChange={(e) => setForm((f) => ({ ...f, widthIn: e.target.value }))}
                      className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-neutral-700">
                    Length (in)
                    <input
                      required
                      type="number"
                      min={1}
                      value={form.lengthIn}
                      onChange={(e) => setForm((f) => ({ ...f, lengthIn: e.target.value }))}
                      className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                    />
                  </label>
                </>
              ) : (
                <label className="flex flex-col gap-1 text-sm text-neutral-700">
                  Diameter (in)
                  <input
                    required
                    type="number"
                    min={1}
                    value={form.diameterIn}
                    onChange={(e) => setForm((f) => ({ ...f, diameterIn: e.target.value }))}
                    className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                  />
                </label>
              )}

              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Default chair count
                <input
                  type="number"
                  min={0}
                  value={form.defaultChairCount}
                  onChange={(e) => setForm((f) => ({ ...f, defaultChairCount: e.target.value }))}
                  placeholder="0"
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Clearance (in)
                <input
                  type="number"
                  min={0}
                  value={form.clearanceIn}
                  onChange={(e) => setForm((f) => ({ ...f, clearanceIn: e.target.value }))}
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Inventory quantity on hand
                <input
                  type="number"
                  min={0}
                  value={form.inventoryQty}
                  onChange={(e) => setForm((f) => ({ ...f, inventoryQty: e.target.value }))}
                  placeholder="Unlimited if blank"
                  className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
                />
              </label>
              <div className="flex items-end gap-4 text-sm text-neutral-700 pb-1.5">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={form.rotatable}
                    onChange={(e) => setForm((f) => ({ ...f, rotatable: e.target.checked }))}
                  />
                  Rotatable
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={form.stackable}
                    onChange={(e) => setForm((f) => ({ ...f, stackable: e.target.checked }))}
                  />
                  Stackable
                </label>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm text-neutral-700">
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="border border-neutral-300 rounded-md px-2 py-1.5 text-sm"
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="self-start text-sm px-4 py-2 rounded-md bg-neutral-900 text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
              >
                {submitting ? "Saving…" : editingId ? "Save Changes" : "Create Item"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="self-start text-sm px-4 py-2 rounded-md border border-neutral-300 hover:border-neutral-500 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          )}
        </div>

        <div>
          <h1 className="text-lg font-semibold text-neutral-800 mb-3">Equipment Library</h1>
          {items === null ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-500">No equipment yet — add one above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-neutral-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-block w-3.5 h-3.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-800 truncate">{item.name}</div>
                      <div className="text-xs text-neutral-500">
                        {item.category.replace("_", " ")} ·{" "}
                        {item.shape === "circle" ? `${item.diameterIn}" diameter` : `${item.widthIn}"×${item.lengthIn}"`}
                        {item.defaultChairCount ? ` · ${item.defaultChairCount} chairs` : ""}
                        {item.inventoryQty !== null ? ` · qty ${item.inventoryQty}` : ""}
                      </div>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => startEdit(item)} className="text-xs px-2.5 py-1 rounded-md border border-neutral-300 hover:border-neutral-500 transition-colors">
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="text-xs px-2.5 py-1 rounded-md border border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deletingId === item.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
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

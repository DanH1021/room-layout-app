"use client";

// Next.js 16 requires `ssr: false` dynamic imports to originate from a
// Client Component file (it can no longer be called directly from a Server
// Component). Konva/react-konva touch `window` at module load time, so the
// canvas must never be rendered on the server.
import dynamic from "next/dynamic";

const RoomCanvas = dynamic(() => import("@/components/editor/RoomCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full text-sm text-neutral-500">
      Loading editor…
    </div>
  ),
});

export default function CanvasLoader({ layoutId }: { layoutId: string }) {
  return <RoomCanvas layoutId={layoutId} />;
}

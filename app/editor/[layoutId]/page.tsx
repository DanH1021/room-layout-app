import CanvasLoader from "@/components/editor/CanvasLoader";

export default async function EditorPage({ params }: { params: Promise<{ layoutId: string }> }) {
  const { layoutId } = await params;
  return (
    <div className="h-screen w-screen overflow-hidden">
      <CanvasLoader layoutId={layoutId} />
    </div>
  );
}

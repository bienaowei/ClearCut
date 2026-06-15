import { useEditorStore } from '../../stores/editorStore';

export default function StatusBar() {
  const zoom = useEditorStore((s) => s.zoom);
  const cursor = useEditorStore((s) => s.cursor);
  const image = useEditorStore((s) => s.image);

  return (
    <div className="status-bar">
      <span>缩放：{Math.round(zoom * 100)}%</span>
      <span className="sep">·</span>
      <span>
        坐标：
        {cursor
          ? `${Math.round(cursor.x)}, ${Math.round(cursor.y)}`
          : '—'}
      </span>
      <span className="sep">·</span>
      <span>
        图片：
        {image ? `${image.naturalWidth}×${image.naturalHeight}` : '未加载'}
      </span>
    </div>
  );
}

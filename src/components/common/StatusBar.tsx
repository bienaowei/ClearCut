import { useEditorStore } from '../../stores/editorStore';
import Icon from './Icon';

export default function StatusBar() {
  const zoom = useEditorStore((s) => s.zoom);
  const cursor = useEditorStore((s) => s.cursor);
  const image = useEditorStore((s) => s.image);

  return (
    <div className="status-bar">
      <span className="status-item">
        <Icon name="zoom" size={13} />
        <span className="num">{Math.round(zoom * 100)}%</span>
      </span>
      <span className="status-item">
        <Icon name="crosshair" size={13} />
        <span className="num">
          {cursor ? `${Math.round(cursor.x)}, ${Math.round(cursor.y)}` : '—'}
        </span>
      </span>
      <span className="status-item">
        <Icon name="dimensions" size={13} />
        <span className="num">
          {image ? `${image.naturalWidth} × ${image.naturalHeight}` : '未加载'}
        </span>
      </span>
    </div>
  );
}

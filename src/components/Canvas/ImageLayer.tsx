import { Layer, Image as KonvaImage } from 'react-konva';
import { useEditorStore } from '../../stores/editorStore';

/** 原图显示层（裁剪/保留模式使用） */
export default function ImageLayer() {
  const image = useEditorStore((s) => s.image);
  if (!image) return null;
  return (
    <Layer listening={false}>
      <KonvaImage image={image} x={0} y={0} />
    </Layer>
  );
}

import Icon from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string; desc: string }[] = [
  { keys: 'Ctrl + Z', desc: '撤销' },
  { keys: 'Ctrl + Shift + Z', desc: '重做' },
  { keys: 'Ctrl + V', desc: '粘贴剪贴板图片' },
  { keys: '滚轮', desc: '以光标为中心缩放' },
  { keys: '空格 + 拖拽', desc: '平移画布' },
  { keys: '单击', desc: '添加多边形顶点' },
  { keys: '双击 / 点起点', desc: '闭合多边形' },
  { keys: '双击边中点', desc: '插入新顶点' },
  { keys: '右键顶点', desc: '删除该顶点（≥3）' },
  { keys: 'Esc', desc: '取消当前绘制' },
  { keys: 'Delete', desc: '删除选中的多边形' },
];

export default function ShortcutHelp({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Icon name="keyboard" size={16} /> 快捷键
          </h3>
          <button className="icon-btn ghost" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <table className="shortcut-table">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td>
                  <kbd>{s.keys}</kbd>
                </td>
                <td>{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

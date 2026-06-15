import { useRef, useState } from 'react';
import './App.css';
import { useEditorStore } from './stores/editorStore';
import { useImageLoader } from './hooks/useImageLoader';
import Toolbar from './components/Toolbar/Toolbar';
import EditorCanvas from './components/Canvas/EditorCanvas';
import BrushPanel from './components/Sidebar/BrushPanel';
import CropListPanel from './components/Sidebar/CropListPanel';
import RetainPanel from './components/Sidebar/RetainPanel';
import StatusBar from './components/common/StatusBar';
import ShortcutHelp from './components/common/ShortcutHelp';

export default function App() {
  const mode = useEditorStore((s) => s.mode);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const { loadFromFile } = useImageLoader(canvasContainerRef);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="app">
      <Toolbar
        onPickFile={loadFromFile}
        onToggleHelp={() => setHelpOpen((v) => !v)}
      />
      <div className="workspace">
        <EditorCanvas
          containerRef={canvasContainerRef}
          onDropFile={loadFromFile}
        />
        <aside className="sidebar">
          {mode === 'brush' && <BrushPanel />}
          {mode === 'crop' && <CropListPanel />}
          {mode === 'retain' && <RetainPanel />}
        </aside>
      </div>
      <StatusBar />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

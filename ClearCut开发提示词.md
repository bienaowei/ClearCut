# 图片编辑工具（ClearCut）

## 项目概述

开发一个基于浏览器的图片编辑工具，主要用于从复合场景图中提取单个物品素材，输出透明背景 PNG。工具纯前端运行，不依赖后端服务。

## 技术栈

- React 18 + TypeScript
- pnpm
- react-konva（Canvas 交互层）
- Konva.js（底层 Canvas 引擎）
- Zustand（状态管理，含撤销/重做栈）
- Immer（不可变数据操作，配合撤销快照）
- JSZip（批量导出打包）
- file-saver（触发下载）
- Vite（构建工具）

## 功能模块

工具包含三种编辑模式，通过顶部工具栏切换：

---

### 模式一：画笔擦除（橡皮擦模式）

**功能描述：** 用户使用画笔在图片上涂抹，画笔经过的区域变为透明。

**交互要求：**
- 鼠标/触控按下开始涂抹，抬起结束一次笔画
- 画笔大小可调（滑块控制，范围 1-100px，实时预览光标大小）
- 画笔硬度可调（控制边缘羽化程度：硬边 = 完全擦除，软边 = 渐变透明）
- 画笔形状为圆形
- 鼠标移动时显示画笔预览圈，跟随光标

**技术实现：**
- 使用独立的离屏 Canvas 作为 alpha 遮罩层
- 涂抹时在遮罩层上以 `globalCompositeOperation: 'destination-out'` 模式绘制
- 用 `Konva.Line` 的 tension 模式连接采样点，保证笔画平滑
- 每次鼠标移动采样并连线，避免快速移动时出现断点

**撤销/重做：**
- 每完成一次笔画（mouseup/touchend）保存一次遮罩快照
- 支持 Ctrl+Z 撤销、Ctrl+Shift+Z 重做
- 撤销栈上限 30 步，超出时丢弃最早记录

**导出：**
- 将原图与遮罩合成，输出透明背景 PNG
- 可选：自动裁剪到内容包围盒（去除多余透明边距）

---

### 模式二：多边形裁剪（批量裁剪模式）

**功能描述：** 用户在图片上绘制多个多边形区域，每个多边形裁剪出一张独立图片，所有裁剪结果统一尺寸、透明背景，支持批量导出。

**多边形绘制交互：**
- 单击添加顶点，形成多边形轮廓
- 实时显示从上一个顶点到当前鼠标位置的预览线段
- 双击或点击起始点闭合多边形，完成一个区域
- 闭合后多边形显示半透明填充色，表示已选中区域
- 每个多边形可命名（默认"物品1"、"物品2"递增）
- ESC 键取消当前正在绘制的多边形

**多边形编辑交互：**
- 选中已完成的多边形后：
  - 各顶点显示拖拽手柄，可调整位置
  - 支持整体拖拽移动
  - 按 Delete 键删除选中的多边形
  - 双击边线中点可插入新顶点
  - 右键顶点可删除该顶点（至少保留 3 个）

**尺寸配置：**
- 提供导出尺寸设置面板：
  - 模式 A：固定尺寸 — 用户输入宽高（如 256×256），裁剪内容等比缩放居中
  - 模式 B：自适应统一 — 取所有裁剪结果中最大包围盒的宽高作为统一尺寸
  - 模式 C：原始尺寸 — 每张按各自包围盒大小导出，不统一
- 缩放算法使用 `imageSmoothingQuality: 'high'`
- 居中放置，空余部分为透明

**裁剪逻辑：**
- 对每个多边形：
  1. 创建临时 Canvas，尺寸为目标导出尺寸
  2. 用多边形顶点构建 Path，调用 `clip()`
  3. `drawImage` 原图，仅 clip 区域内的像素被绘制
  4. 如果目标尺寸与包围盒不同，计算缩放比和偏移量居中绘制
- 多边形外部天然为透明（Canvas 默认）

**侧边栏预览列表：**
- 实时显示每个多边形的裁剪预览缩略图
- 显示名称、尺寸信息
- 点击列表项高亮对应的多边形区域
- 支持拖拽排序（影响导出文件命名顺序）

**批量导出：**
- 「全部导出」按钮 → 使用 JSZip 打包为 zip，文件名格式：`{序号}_{名称}.png`
- 「单个导出」按钮 → 下载单张 PNG
- zip 内包含一个 `manifest.json`，记录每张图的名称、原始多边形坐标、导出尺寸

---

### 模式三：多边形保留（反向裁剪模式）

**功能描述：** 用户绘制一个多边形区域，多边形内部保留原图，外部全部变为透明。

**交互要求：**
- 多边形绘制与编辑交互同模式二
- 仅支持单个多边形（绘制新的自动替换旧的）
- 实时预览效果：多边形外部区域叠加半透明遮罩，让用户看到最终效果

**导出选项：**
- 保留原图尺寸 — 输出与原图同尺寸，多边形外为透明
- 裁剪到包围盒 — 输出裁剪到多边形包围盒大小
- 指定尺寸 — 同模式二的固定尺寸逻辑

---

## 通用功能

### 图片加载
- 支持点击按钮选择文件（接受 jpg/png/webp/bmp）
- 支持拖拽文件到画布区域加载
- 支持粘贴剪贴板图片（Ctrl+V）
- 加载后自适应画布显示，大图缩放到视口内

### 画布操作
- 鼠标滚轮缩放（以光标位置为中心）
- 空格键 + 拖拽平移画布
- 快捷键面板显示所有支持的快捷键
- 画布背景显示棋盘格（表示透明区域）

### 撤销/重做
- 全局撤销/重做栈，所有模式共用
- 操作类型：笔画、多边形创建、多边形编辑、多边形删除
- 使用 Immer 的 produce 生成不可变快照

### UI 布局
- 顶部：工具栏（模式切换、加载图片、撤销/重做、导出按钮）
- 中间：画布区域（占主体空间）
- 右侧：属性面板/裁剪列表（根据当前模式切换内容）
- 底部状态栏：显示当前缩放比例、光标坐标、图片尺寸

### 主题风格
- 暖色暗调主题，配色参考：
  - 背景 `#2a1f1f`（深棕红）
  - 面板 `#352424`（暗红棕）
  - 边框/分割线 `#4a3030`
  - 主色 `#e8453c`（红色，多边形、选中状态、主要按钮）
  - 主色悬停 `#ff5c52`
  - 辅助色 `#f0a868`（暖橙，高亮、活跃状态、画笔预览圈）
  - 警告/删除 `#c0392b`（深红）
  - 成功/导出 `#d4885a`（暖棕橙）
  - 文字主色 `#f0e0d6`（暖白）
  - 文字次要 `#a08878`（灰棕）
  - 画布棋盘格使用 `#2e2222` 与 `#382a2a` 交替
- 字体使用系统字体栈，中文优先 PingFang SC / Microsoft YaHei

---

## 项目结构

```
src/
├── App.tsx                     # 根组件，布局容器
├── main.tsx                    # 入口
├── stores/
│   ├── editorStore.ts          # Zustand 主 store（图片、模式、缩放）
│   ├── historyStore.ts         # 撤销/重做栈
│   └── cropStore.ts            # 多边形裁剪区域数据
├── components/
│   ├── Toolbar/
│   │   └── Toolbar.tsx         # 顶部工具栏
│   ├── Canvas/
│   │   ├── EditorCanvas.tsx    # Konva Stage 容器
│   │   ├── ImageLayer.tsx      # 原图显示层
│   │   ├── BrushLayer.tsx      # 画笔擦除层
│   │   ├── PolygonLayer.tsx    # 多边形绘制/编辑层
│   │   └── PreviewOverlay.tsx  # 模式三的遮罩预览层
│   ├── Sidebar/
│   │   ├── BrushPanel.tsx      # 画笔参数面板
│   │   ├── CropListPanel.tsx   # 裁剪列表 + 尺寸配置
│   │   └── RetainPanel.tsx     # 反向裁剪导出设置
│   └── common/
│       ├── StatusBar.tsx       # 底部状态栏
│       └── ShortcutHelp.tsx    # 快捷键说明弹窗
├── hooks/
│   ├── useBrush.ts             # 画笔逻辑（采样、绘制、遮罩合成）
│   ├── usePolygon.ts           # 多边形绘制/编辑逻辑
│   ├── useCanvasZoom.ts        # 缩放和平移逻辑
│   └── useExport.ts            # 导出逻辑（裁剪、缩放、打包）
├── utils/
│   ├── canvasUtils.ts          # Canvas 操作工具函数
│   ├── polygonMath.ts          # 多边形计算（包围盒、点是否在内）
│   └── exportUtils.ts          # 导出相关（zip 打包、manifest 生成）
└── types/
    └── index.ts                # 类型定义（Polygon、CropItem、ExportConfig 等）
```

## 类型定义参考

```typescript
interface Point {
  x: number;
  y: number;
}

interface PolygonRegion {
  id: string;
  name: string;
  points: Point[];       // 顶点坐标（相对于原图）
  closed: boolean;
  color: string;         // 显示颜色（自动分配）
}

interface ExportConfig {
  mode: 'fixed' | 'adaptive' | 'original';
  width: number;         // fixed 模式下的目标宽度
  height: number;        // fixed 模式下的目标高度
  padding: number;       // 内容到边缘的间距
}

interface CropResult {
  polygon: PolygonRegion;
  dataUrl: string;
  width: number;
  height: number;
}

type EditorMode = 'brush' | 'crop' | 'retain';

interface EditorState {
  mode: EditorMode;
  image: HTMLImageElement | null;
  zoom: number;
  offset: Point;
  polygons: PolygonRegion[];
  activePolygonId: string | null;
  brushSize: number;
  brushHardness: number;
  exportConfig: ExportConfig;
}
```

## 关键实现注意事项

1. **Konva 节点不要包进 React 响应式状态**，用 `useRef` 持有 Konva.Node 引用，避免序列化和性能问题
2. **画笔采样要做插值**，两次 mousemove 之间距离超过画笔半径时，沿路径补点，防止快速移动断线
3. **多边形顶点坐标始终存储为原图像素坐标**，显示时再乘以缩放比，导出时直接使用，避免精度丢失
4. **大图优化**：图片超过 4096px 时考虑降采样显示，导出时用原图
5. **导出用离屏 Canvas**，不要复用 Konva 的 stage，避免污染显示状态
6. **zip 打包放 Web Worker** 中执行，防止阻塞 UI

# DeskSprite 桌宠完整开发指南

> Tauri + React + Rust · 粉色萌系狐狸角色 · 精灵图集动画 · OpenClaw 状态联动

---

## 项目总览

DeskSprite 是基于 **oc-claw** 上游项目的桌面宠物扩展。底层框架为 Tauri（Rust + React），透明窗口、点击穿透、精灵动画、状态机等核心基础设施**已经由上游实现**，无需重建。

本指南聚焦于在此基础上新增的内容：

- **粉色狐狸角色**：静态 PNG → 精灵图集 → 带动画的角色
- **OpenClaw 状态联动**：Agent 工作/等待/完成/报错 → 角色切换动画
- **眼睛鼠标跟随**：独立眼睛图层，跟随鼠标偏移
- **对话气泡**：Alt+Space 唤起，接入 OpenClaw 对话 API

新增功能统一放在 `frontend/src/fox/` 目录，不污染上游代码。

---

## 已有基础设施（无需重建）

| 功能 | 实现位置 | 说明 |
|------|---------|------|
| 透明窗口 | `tauri.conf.json` | `transparent: true, decorations: false, alwaysOnTop: true` |
| 点击穿透 | `lib.rs` + Tauri 命令 | 鼠标进入角色区域自动关闭穿透 |
| 精灵动画引擎 | `src/components/SpritePet.tsx` | 8列×9行图集，requestAnimationFrame 驱动 |
| 状态机 | `Mini.tsx` + `lib.rs` | idle / working / waiting / failed 等状态 |
| 角色加载 | `src/lib/codexPet.ts` | 读取 `pet.json` + `spritesheet.webp` |
| Windows 兼容 | `lib.rs` | WebView2 白边修复、色键 canvas、DPI 缩放 |

---

## 技术架构

```
OpenClaw API（localhost:18789）
         ↓
   lib.rs 状态轮询（每3秒）
         ↓
   Tauri Event → Mini.tsx
         ↓
   FoxCharacter（新增接口层）
    ├── SpritePet（精灵图集，已有）   ← 身体动画
    ├── EyeLayer（新增）              ← 眼睛跟随鼠标
    └── ChatBubble（新增）            ← 对话气泡

角色状态映射：
  OpenClaw working  → sprite state: running
  OpenClaw waiting  → sprite state: waiting
  OpenClaw complete → sprite state: waving（one-shot）
  OpenClaw error    → sprite state: failed
  无活动            → sprite state: idle
```

---

## 角色素材规格

### 精灵图集格式（spritesheet.webp）

现有系统要求**单张图集**，不接受分散的 WebM 视频文件。

```
图集尺寸：1536 × 1872 px（8列 × 9行）
单帧尺寸：192 × 208 px
格式：WebP（透明背景）

行布局（固定，不可改变）：
  行0: idle       6帧   2fps   呼吸起伏
  行1: run-right  8帧   8fps   向右跑
  行2: run-left   8帧   8fps   向左跑
  行3: waving     4帧  12fps   挥手（完成动作）
  行4: jumping    5帧   6fps   跳起（悬停触发）
  行5: failed     8帧  12fps   沮丧（报错状态）
  行6: waiting    6帧   6fps   踱步（等待状态）
  行7: running    6帧   6fps   工作中
  行8: review     6帧  12fps   审查中
```

---

## 阶段一：静态 PNG 占位上屏

> 目标：先把狐狸图显示到透明窗口上，验证效果，再做动画。

### A. 素材准备

你现在有的透明 PNG → 需要生成一张占位图集：

**方法（用 Python + Pillow）**：把同一张 PNG 平铺到 1536×1872 的图集里，所有帧都一样（静态），先跑通加载流程。

```python
# make_placeholder_sheet.py
# 把 fox.png 重复填满 8×9 图集，用于占位
from PIL import Image

CELL_W, CELL_H = 192, 208
COLS, ROWS = 8, 9

src = Image.open("fox.png").resize((CELL_W, CELL_H), Image.LANCZOS)
sheet = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))

for row in range(ROWS):
    for col in range(COLS):
        sheet.paste(src, (col * CELL_W, row * CELL_H))

sheet.save("spritesheet.webp", "WebP", lossless=True)
print("Done: spritesheet.webp")
```

运行：`python make_placeholder_sheet.py`

### B. 放入项目

```
frontend/public/assets/builtin/fox-pink/
├── pet.json
└── spritesheet.webp    ← 上一步生成的
```

`pet.json`：
```json
{
  "id": "fox-pink",
  "displayName": "粉色狐狸",
  "description": "粉色萌系狐狸桌宠",
  "spritesheetPath": "spritesheet.webp"
}
```

### C. 注册到角色列表

编辑 `frontend/public/assets/builtin/pets-manifest.json`，加入 `"fox-pink"`：

```json
{
  "pets": [
    "fox-pink",
    "doro.codex-pet",
    ...
  ]
}
```

### D. 验证

运行 `npm run dev`（在 `frontend/` 目录），在设置里切换角色到「粉色狐狸」，确认图片正常显示。

---

## 阶段二：制作各状态动画帧

> 目标：把静态 PNG 替换为真实的多帧动画图集。

### A. 生成各状态动画视频

用 **Kling AI** 图生视频，以你的 PNG 为参考图，分别生成：

| 状态 | 描述 | 时长 | 循环 |
|------|------|------|------|
| idle | 轻微呼吸起伏、尾巴缓慢左右摆、偶尔眨眼 | 3秒 | 是 |
| working (running) | 身体微微前倾、耳朵竖起，整体专注感 | 2秒 | 是 |
| waiting | 小幅踱步或原地转圈，显示焦躁感 | 2秒 | 是 |
| waving | 跳起挥爪，开心庆祝 | 1.5秒 | 否 |
| failed | 耳朵下垂、尾巴垂下、慢速摇头 | 3秒 | 是 |

> ⚠️ **角色一致性**：第一次生成后多出几个版本，选定一个固定为参考图/seed，后续所有状态动画都用同一参考图，避免角色漂移。

### B. 提取帧序列

用 FFmpeg 把视频拆成 PNG 帧序列：

```bash
# 提取帧（以24fps，取前3秒=72帧）
ffmpeg -i idle.mp4 -vf "fps=12,scale=192:208" -pix_fmt rgba frames/idle_%03d.png

# 如果视频有白色背景，用色键去除
ffmpeg -i idle.mp4 -vf "fps=12,scale=192:208,chromakey=white:0.1:0.1" -pix_fmt rgba frames/idle_%03d.png
```

### C. 拼合图集

```python
# make_spritesheet.py
from PIL import Image
import glob, os

CELL_W, CELL_H = 192, 208
COLS = 8  # 每行最多8帧

# 每个状态的帧数（对应图集行顺序）
STATES = [
    ('idle',    sorted(glob.glob('frames/idle_*.png'))[:6]),
    ('run-right', sorted(glob.glob('frames/run_right_*.png'))[:8]),
    ('run-left',  sorted(glob.glob('frames/run_left_*.png'))[:8]),
    ('waving',    sorted(glob.glob('frames/waving_*.png'))[:4]),
    ('jumping',   sorted(glob.glob('frames/jumping_*.png'))[:5]),
    ('failed',    sorted(glob.glob('frames/failed_*.png'))[:8]),
    ('waiting',   sorted(glob.glob('frames/waiting_*.png'))[:6]),
    ('running',   sorted(glob.glob('frames/running_*.png'))[:6]),
    ('review',    sorted(glob.glob('frames/review_*.png'))[:6]),
]

ROWS = len(STATES)
sheet = Image.new("RGBA", (CELL_W * COLS, CELL_H * ROWS), (0, 0, 0, 0))

for row_idx, (name, frames) in enumerate(STATES):
    for col_idx, fpath in enumerate(frames):
        if col_idx >= COLS: break
        img = Image.open(fpath).resize((CELL_W, CELL_H), Image.LANCZOS)
        sheet.paste(img, (col_idx * CELL_W, row_idx * CELL_H))
    print(f"行{row_idx} {name}: {len(frames)}帧")

sheet.save("spritesheet.webp", "WebP", lossless=True)
print("Done: spritesheet.webp")
```

生成后替换 `frontend/public/assets/builtin/fox-pink/spritesheet.webp`，角色动画即生效。

---

## 阶段三：眼睛鼠标跟随

> 此功能需要新增代码，放在 `frontend/src/fox/` 目录。

### A. 素材准备

在 Photopea 中从立绘抠出眼睛区域，保存为透明 PNG：

```
frontend/public/assets/builtin/fox-pink/
├── spritesheet.webp
├── pet.json
└── eyes.png          ← 新增，仅眼睛区域，透明背景
```

在 `pet.json` 中记录眼睛锚点（占整图宽高的比例）：

```json
{
  "id": "fox-pink",
  "displayName": "粉色狐狸",
  "description": "粉色萌系狐狸桌宠",
  "spritesheetPath": "spritesheet.webp",
  "eyesPath": "eyes.png",
  "eyeAnchorX": 0.48,
  "eyeAnchorY": 0.33,
  "eyeMaxOffsetX": 6,
  "eyeMaxOffsetY": 4
}
```

> ⚠️ **坑**：每次重新生成立绘，眼睛位置都会变，必须重新量 `eyeAnchorX/Y`。建议用 Photopea 的像素坐标除以图片宽高得到比例。

### B. 新增 EyeLayer 组件

新建 `frontend/src/fox/EyeLayer.tsx`：

```tsx
// 眼睛图层：叠在 SpritePet 上方，根据全局鼠标位置偏移
import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface EyeLayerProps {
  eyesUrl: string
  anchorX: number   // 眼睛中心X（占角色宽度比例）
  anchorY: number   // 眼睛中心Y（占角色高度比例）
  maxOffsetX: number
  maxOffsetY: number
  characterWidth: number
  characterHeight: number
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function EyeLayer({
  eyesUrl, anchorX, anchorY,
  maxOffsetX, maxOffsetY,
  characterWidth, characterHeight,
}: EyeLayerProps) {
  const eyeRef = useRef<HTMLImageElement>(null)
  const currentX = useRef(0)
  const currentY = useRef(0)
  const targetX = useRef(0)
  const targetY = useRef(0)

  useEffect(() => {
    let running = true

    const poll = async () => {
      while (running) {
        try {
          // 获取全局鼠标坐标（Tauri 命令，见 lib.rs）
          const pos = await invoke<{ x: number; y: number }>('get_cursor_pos')
          const el = eyeRef.current?.parentElement
          if (el) {
            const rect = el.getBoundingClientRect()
            // 角色中心（屏幕坐标）
            const charCenterX = rect.left + characterWidth * anchorX
            const charCenterY = rect.top + characterHeight * anchorY
            // 归一化偏移（-1 到 1），乘以最大偏移量
            const dx = (pos.x - charCenterX) / window.screen.width
            const dy = (pos.y - charCenterY) / window.screen.height
            targetX.current = Math.max(-maxOffsetX, Math.min(maxOffsetX, dx * maxOffsetX * 10))
            targetY.current = Math.max(-maxOffsetY, Math.min(maxOffsetY, dy * maxOffsetY * 10))
          }
        } catch {}
        await new Promise(r => setTimeout(r, 16))  // ~60fps
      }
    }

    const animate = () => {
      if (!running) return
      currentX.current = lerp(currentX.current, targetX.current, 0.12)
      currentY.current = lerp(currentY.current, targetY.current, 0.12)
      if (eyeRef.current) {
        eyeRef.current.style.transform =
          `translate(${currentX.current}px, ${currentY.current}px)`
      }
      requestAnimationFrame(animate)
    }

    poll()
    const raf = requestAnimationFrame(animate)
    return () => {
      running = false
      cancelAnimationFrame(raf)
    }
  }, [anchorX, anchorY, maxOffsetX, maxOffsetY, characterWidth, characterHeight])

  return (
    <img
      ref={eyeRef}
      src={eyesUrl}
      style={{
        position: 'absolute',
        top: `${anchorY * 100}%`,
        left: `${anchorX * 100}%`,
        transform: 'translate(0, 0)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    />
  )
}
```

Rust 侧需要暴露 `get_cursor_pos` 命令（检查 `lib.rs` 是否已有，上游可能已实现）。

---

## 阶段四：OpenClaw 状态联动

> 上游已有状态机，此阶段只需把 OpenClaw Agent 状态映射到角色动画状态。

### 状态映射

| OpenClaw 事件 | 角色状态 | 动画 |
|--------------|---------|------|
| tool_use 调用中 | `running` | 工作动画 |
| 等待用户输入 | `waiting` | 踱步动画 |
| 任务完成 | `waving` | 挥手庆祝（one-shot） |
| 工具报错 | `failed` | 沮丧动画 |
| 无活动 | `idle` | 呼吸闲置 |

### 现有轮询逻辑

上游代码已在 `lib.rs` 实现了 OpenClaw 会话状态读取。检查 `frontend/src/Mini.tsx` 中的 `petState` 计算逻辑，确认以下映射是否已有：

```ts
// Mini.tsx 中已有的状态映射（参考，勿直接修改上游文件）
const petBaseState: CodexPetState =
  activeSession?.status === 'working'   ? 'running' :
  activeSession?.status === 'waiting'   ? 'waiting' :
  activeSession?.status === 'compacting'? 'running' :
  'idle'
```

如果需要追加 `complete` 和 `error` 触发，在 `frontend/src/fox/` 下新建事件监听器，订阅上游已有的 Tauri 事件，不修改 `Mini.tsx`。

---

## 阶段五：对话气泡（按需追加）

新建 `frontend/src/fox/ChatBubble.tsx`，独立于上游组件。

| 功能 | 实现方式 |
|------|---------|
| Alt+Space 唤起 | Tauri `globalShortcut` 插件 |
| 输入框 | 悬浮 `<input>` 组件，CSS 圆角浅色风格 |
| 流式对话 | `fetch` + SSE 读取 OpenClaw 对话 API |
| 打字机效果 | `requestAnimationFrame` 逐字追加，每字 30-50ms |
| 气泡消失 | 回复完成 5 秒后 CSS `opacity` 淡出 |

---

## 文件结构（新增部分）

```
frontend/
├── public/assets/builtin/fox-pink/
│   ├── pet.json              ← 角色元数据 + 眼睛配置
│   ├── spritesheet.webp      ← 8×9 帧图集（1536×1872）
│   └── eyes.png              ← 独立眼睛图层（可选）
└── src/fox/                  ← 新功能，不污染上游
    ├── EyeLayer.tsx          ← 眼睛鼠标跟随
    ├── ChatBubble.tsx        ← 对话气泡
    └── index.ts              ← 导出入口

tools/
├── make_placeholder_sheet.py ← 静态PNG→占位图集
└── make_spritesheet.py       ← 帧序列→正式图集
```

---

## 素材制作工具推荐

| 任务 | 工具 | 说明 |
|------|------|------|
| 生成立绘 | NovelAI | 提示词参考下方 |
| 去背景 | remove.bg / Clipdrop | 检查毛发边缘是否干净 |
| 抠眼睛图层 | Photopea（网页版） | 免费，记录像素坐标换算比例 |
| 图生视频 | Kling AI | 以立绘为参考图保持一致性 |
| 帧提取 | FFmpeg | 见阶段二命令 |
| 图集拼合 | Python + Pillow | 见 `make_spritesheet.py` |

**NovelAI 提示词参考**：
```
pink fox girl, chibi style, full body, white background, simple cute,
front view, anime style, big eyes, fluffy tail, 3:1 head-to-body ratio,
clean lineart, saturated colors
```

---

## 常见坑速查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 角色显示黑背景 | spritesheet 不是透明 PNG/WebP | 确认导出时选 WebP lossless 或 PNG，不要用 JPEG |
| 动画帧错位 | 图集列数不是8列 | 严格按 8列×9行，单帧 192×208 |
| 眼睛图层对不准 | 重新生成立绘后坐标变了 | 每次换立绘都要重新量 `eyeAnchorX/Y` |
| 角色一致性丢失 | Kling 多次生成漂移 | 固定第一张满意的立绘为参考图/seed |
| 新角色不出现 | 忘记加到 pets-manifest.json | 检查 `pets-manifest.json` 是否包含 `"fox-pink"` |
| WebP 透明通道失效 | 用了有损压缩 | `lossless=True` 或用 PNG 代替 |

---

## 当前进度

- [x] 基础设施（透明窗口、点击穿透、精灵引擎）—— 上游已有
- [ ] 阶段一：静态 PNG 占位上屏
- [ ] 阶段二：各状态动画帧图集
- [ ] 阶段三：眼睛鼠标跟随
- [ ] 阶段四：OpenClaw 状态联动
- [ ] 阶段五：对话气泡

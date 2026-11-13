# 工作台

## THESIS

在同一窗口完成导入、编排、试听与向游戏演奏。编排空间优先，中央钢琴卷是主要工作区。

## OWN-WORLD

米色为主，松绿 #4A6741 标识操作、游标与选中态，深色主题沿用同一层级。曲名栏使用淡墨远山，曲库留白放置松枝画作。标题与正文使用离线平台字体回退；界面只保留必要标签和实际状态。

## STORY

左侧选曲或导入，中央修改音高、位置和音长，底部试听；右侧选择目标窗口与演奏方式，再从底部开始演奏。暂停、继续与停止在当前状态下直接呈现。

## FIRST VIEWPORT

自定义无边框标题栏在上，曲库在左，钢琴卷占中央最大区域；概览、三排试听琴键和播放控制位于下方。演奏与设置共用可收起的右侧面板，状态栏固定在底部。两侧辅助区均可折叠。

目标窗口从（900 × 640）起。宽度不超过（1030px）时，右侧面板改为浮层；高度不超过（760px）时压缩纵向留白。钢琴卷保持独立滚动。

## FORM

桌面操作界面，Rust、Tauri 2、React 与 TypeScript。设计基准是用户确认的配色与布局，按代码实现并通过截图核对。

实现来源：`src/styles.css`、`src/App.tsx`、`src/PianoRoll.tsx`。设计语义来源：`PRODUCT.md`、`.impeccable.md`。系统色值与组件记录在 `DESIGN.md` 和 `.impeccable/design.json`。

核对图：`review/desktop.png`、`review/light.png`、`review/dark.png`、`review/compact.png`、`review/import-error.png`。四个 Playwright 场景覆盖编排与持久化、指针编辑、键盘编辑，以及试听和界面状态。

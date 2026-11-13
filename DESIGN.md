---
name: 燕云琴笺
description: 东方武侠配色的 36 键编排与演奏工作台
colors:
  bg: "#eeeae2"
  sidebar: "#e8e2d7"
  surface: "#f3efe7"
  surface-hover: "#dce3d5"
  canvas: "#f8f5ee"
  black-row: "#eeeade"
  line: "#ccc8bc"
  line-soft: "#e2ddd2"
  text: "#292d26"
  muted: "#555e4d"
  subtle: "#606555"
  accent: "#4a6741"
  accent-soft: "#dce3d5"
  on-accent: "#fffcf4"
  green: "#4a6741"
  red: "#a44e3e"
  note-low: "#63785d"
  note-mid: "#4a6741"
  note-high: "#6b7251"
  note-active: "#314c2a"
  note-text: "#fffcf4"
  dark-bg: "#20271f"
  dark-sidebar: "#252c23"
  dark-surface: "#2b3328"
  dark-surface-hover: "#344330"
  dark-canvas: "#1c231c"
  dark-black-row: "#222a20"
  dark-line: "#3e4a39"
  dark-line-soft: "#303a2d"
  dark-text: "#ece8dd"
  dark-muted: "#bdc5b3"
  dark-subtle: "#a6b19b"
  dark-accent: "#adc09a"
  dark-accent-soft: "#35442e"
  dark-on-accent: "#1b2718"
  dark-green: "#a9c69e"
  dark-red: "#e6a18f"
  dark-note-low: "#9cae91"
  dark-note-mid: "#b3c0a2"
  dark-note-high: "#c4b88b"
  dark-note-active: "#d4dcb8"
  dark-note-text: "#1b2718"
typography:
  title:
    fontFamily: '"Noto Serif SC", "Songti SC", serif'
    fontSize: "20px"
    fontWeight: 600
  brand:
    fontFamily: '"Noto Serif SC", "Songti SC", SimSun, serif'
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "0.16em"
  body:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "12px"
  label:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "10px"
  note:
    fontFamily: '"Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif'
    fontSize: "9px"
    fontWeight: 600
  mono:
    fontFamily: 'Consolas, "SFMono-Regular", monospace'
    fontSize: "10px"
    lineHeight: 1.7
rounded:
  note: "3px"
  control: "4px"
  panel-control: "5px"
  toast: "6px"
  dialog: "10px"
spacing:
  tight: "4px"
  inline: "7px"
  related: "8px"
  group: "12px"
  action: "16px"
  section: "22px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.panel-control}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 11px"
  button-quiet:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "7px 9px"
  button-danger:
    backgroundColor: "{colors.red}"
    textColor: "{colors.bg}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-preview:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel-control}"
    padding: "8px 11px"
  button-icon:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    width: "30px"
    height: "30px"
  input-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "7px"
  nav-tab:
    textColor: "{colors.muted}"
    padding: "2px 0 0"
  dialog:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.dialog}"
    width: "420px"
  roll-note-mid:
    backgroundColor: "{colors.note-mid}"
    textColor: "{colors.note-text}"
    typography: "{typography.note}"
    rounded: "{rounded.note}"
    padding: "0 6px"
    height: "16px"
---

# Design System: 燕云琴笺

米色为主，松绿 #4A6741 点缀。界面沿用音乐工作台的连续窗格，淡墨远山和松枝只进入留白。

## 色彩

默认浅色：米色窗框、浅米色窗格、暖白画布和炭色文字。松绿用于主要动作、焦点、选中、播放游标及连接状态。低、中、高音分别使用灰绿、松绿与苔绿；发声音符加深，选中音符保留轮廓。

深色主题使用深松绿底、暖白文字和浅苔绿操作色。两套主题共用相同的语义变量，具体值记录在前置色表和 src/styles.css。

文字与各类底色、音符标签与音符底色、主要按钮的前景与背景均按 4.5:1 核对。细网格表达时间与音高，控件与状态不依赖颜色单独传达。

## 布局与文字

中央钢琴卷优先伸展；曲库和演奏设置可折叠。标题栏 48px、状态栏 26px，基准侧栏 216px / 264px。1030px 及以下窗口将右侧面板改为浮层，760px 及以下高度收紧留白。

中文标题采用平台宋体，正文采用平台中文无衬线，时间与 BPM 使用等宽数字。保留操作名称、必要标签、数值和实际状态；副标题、重复摘要和常驻教程不进入工作台，详细说明放入帮助与悬浮提示。

## 交互

主要动作使用松绿实底，次要动作使用细边线，工具栏采用统一图标。输入聚焦、选中刻度和键盘光标使用松绿。悬停、禁用、错误、空曲谱和播放状态均保持独立反馈，保留减少动态效果设置。

音符支持指针与键盘编辑，音高栏和时间尺固定。选中音符时显示精确参数；未选中时收起该分区。游戏接收未验证、权限和错误状态保留明确文本。

## 画作

曲名栏使用 src/assets/distant-mountains.png，曲库留白使用 src/assets/pine-branch.png。两幅图不接收指针事件；深色主题降低可见度。生成方式和最终提示词见 docs/ARTWORK.md。

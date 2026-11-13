---
name: 燕云琴笺
description: 东方武侠配色的 36 键编排与演奏工作台
colors:
  bg: "#142420"
  sidebar: "#172a25"
  surface: "#1b302a"
  surface-hover: "#233c33"
  canvas: "#14241f"
  black-row: "#11211c"
  line: "#2c4238"
  line-soft: "#21372d"
  text: "#e9e7dc"
  muted: "#a6b7a8"
  subtle: "#8a9e8c"
  gold: "#c6ab74"
  gold-soft: "#3b3b2b"
  green: "#7eb398"
  red: "#eaa294"
  note-low: "#648f84"
  note-mid: "#7ca58c"
  note-high: "#b3a875"
  note-text: "#0c1b15"
  light-bg: "#f4f2e9"
  light-sidebar: "#e8ece1"
  light-surface: "#eef0e6"
  light-surface-hover: "#dce5d7"
  light-canvas: "#f8f7f0"
  light-black-row: "#f0f0e6"
  light-line: "#cbd3c4"
  light-line-soft: "#e0e4d8"
  light-text: "#243e32"
  light-muted: "#516952"
  light-subtle: "#5e725e"
  light-gold: "#80612c"
  light-gold-soft: "#e7dfc8"
  light-green: "#32694b"
  light-red: "#a8372b"
  light-note-low: "#416d60"
  light-note-mid: "#436d48"
  light-note-high: "#7c6933"
  light-note-text: "#faf7ed"
typography:
  title:
    fontFamily: "\"Noto Serif SC\", \"Songti SC\", serif"
    fontSize: "20px"
    fontWeight: 600
  brand:
    fontFamily: "\"Noto Serif SC\", \"Songti SC\", SimSun, serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "0.16em"
  body:
    fontFamily: "\"Microsoft YaHei UI\", \"PingFang SC\", \"Noto Sans CJK SC\", sans-serif"
    fontSize: "12px"
  label:
    fontFamily: "\"Microsoft YaHei UI\", \"PingFang SC\", \"Noto Sans CJK SC\", sans-serif"
    fontSize: "10px"
  note:
    fontFamily: "\"Microsoft YaHei UI\", \"PingFang SC\", \"Noto Sans CJK SC\", sans-serif"
    fontSize: "9px"
    fontWeight: 600
  mono:
    fontFamily: "Consolas, \"SFMono-Regular\", monospace"
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
    backgroundColor: "{colors.gold}"
    textColor: "{colors.bg}"
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

## Overview

黛青与墨绿承托高密度编排界面，暖白用于阅读，暗金标出操作、焦点与播放位置。细线划分时间和音高，装饰集中在应用标记。

中文文案直接说明动作和状态。宋体标题与平台中文无衬线正文配合，深浅主题保留相同的信息层级。

- 音高与时间是视觉主体。
- 辅助区可折叠，工作区随窗口伸展。
- 状态通过位置、图标、文字与颜色共同表达。

## Colors

默认深色使用黛青、墨绿、暖白与暗金；浅色使用暖白画布、浅绿辅助区和深色文字。前置色值对应当前 CSS，自带 `light-` 前缀的是浅色主题。

### Primary

暗金用于主要动作、焦点、播放游标、选中刻度和活动标签；暗金底色承托局部选中态。

### Secondary

低、中、高音分别使用青绿、草绿与灰金音符。发声音符切为暗金，选中音符保留文字色轮廓。

### Tertiary

绿色表达连接、保存与导入结果，红色表达错误和删除动作；每处同时保留对应文字或图标。

### Neutral

画布最深，工具与辅助面板略亮。主文字、次文字和弱化文字构成阅读层级；普通线与弱化线分别划分区域、节拍和网格。

音符文字使用独立的 note-text 色，按深浅主题分别配对低、中、高音背景。

## Typography

应用名与曲名使用宋体回退栈；正文使用平台中文无衬线。字体随离线 Windows 与 macOS 环境回退。导出预览使用等宽字体，时间、BPM 与刻度使用等宽数字。

曲名为标题字阶，紧凑宽度下缩为（18px）；应用名与对话框标题为（16px），曲库标题为（13px），正文为（12px）。标签以（10px、11px）组织，音符文字为（9px、600）。更小的键位提示附着在对应琴键与音高旁。

## Layout

窗口使用全高网格，标题栏（48px）和状态栏（26px）固定，中间工作区伸展。辅助区可折叠，内容区各自滚动；钢琴卷的时间尺与音高栏保持吸附。

常规双侧栏为（216px、264px）；宽度不超过（1250px）时收为（184px、236px）。宽度不超过（1030px）时左栏为（164px），右栏改为（250px）浮层。高度不超过（760px）时减少纵向留白、缩短琴键与概览。工作台的具体排列见 `.impeccable/surfaces/workbench.md`。

间距按操作关系取值：图标与文字紧邻，相关控件成组，分区使用较宽留白。窗格以（1px）边线区分，避免将每个设置包装为独立卡片。

## Elevation & Depth

常驻区域以底色和细线区分。对话框与提示使用主题投影，窄窗口右侧浮层使用侧向投影；播放游标带轻微光晕。具体投影值记录在 sidecar。

控件的背景、文字和边线以（140ms）过渡。减少动态效果设置关闭过渡并使用即时滚动。

## Shapes

控件以小圆角为主，音符和局部选择使用更紧的轮廓；对话框圆角稍大。常规边线细，应用标记使用两角伸展的轮廓。分区靠位置与留白建立层级。

## Components

### Buttons

暗金实底用于主要动作，带边线的墨绿底用于次要动作，轻按钮承载复制与导出等工具操作。删除按钮使用红色实底。图标按钮保持方形点击区，并提供名称。

悬停改变底色或亮度；键盘焦点使用暗金（2px）轮廓与（2px）偏移。禁用按钮降低透明度。试听按钮在播放中保留活动底色，按钮文字随暂停与继续状态更新。

### Cards / Containers

窗格连续铺陈；对话框使用背景色、边线、较大圆角和主题投影。对话框头尾由细线分开，正文独立滚动。提示在底部居中出现，并保留状态文本。

### Inputs / Fields

输入框与选择框使用画布底、细边线和小圆角。聚焦边线转暗金，插入符同色。导入错误紧邻输入内容显示，读取结果保留摘要。曲名输入采用标题字阶和底边反馈。

### Navigation

右侧标签页以暗金文字和底线表示当前页。曲库条目以底色、主文字和小圆点标出当前曲谱，并展示音符数与 BPM。主题选择将图标和文字放在同一选项中。

### 钢琴卷与琴键

钢琴卷显示（36）个音高，固定行高（21px），音高栏宽（90px），基准格宽为（28px）乘缩放值。键位命令另列一行。音符通过位置、宽度和分音区颜色表达音高与时长；选中态加轮廓，右缘显示调整音长位置，发声态使用暗金。

网格可聚焦，方向键移动光标，Enter 写入或选择音符；音符可通过键盘选择、试听与删除。底部琴键按三个音区排列，音名与键位对应，发声态同时改变底色、边线与文字。

## Do's and Don'ts

### Do:

- Do 复用深浅主题的同名色彩角色。
- Do 为键盘焦点保留暗金轮廓，并保留减少动态效果设置。
- Do 让信息密度服从编辑操作，说明文字紧邻相关控件。

### Don't:

- Don't 用装饰占用编排空间。
- Don't 只用颜色说明选中、连接或演奏状态。

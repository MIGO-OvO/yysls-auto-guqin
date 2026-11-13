# 燕云琴笺

<!-- impeccable:product-schema 1 -->

## Platform

web

Tauri 桌面应用，仅支持 Windows x64 与 macOS Apple Silicon。后续开发、构建、发布和自动更新不再支持 macOS Intel。

## Stack

Rust、Tauri 2、React、TypeScript。由用户指定。

## Users

《燕云十六声》自由演奏玩家，以编排为主，在同一程序内编辑、试听和向游戏演奏。

## Product Purpose

把原 HTML 编排器与 C# 演奏器合为一体，保留 36 键、旧乐谱与命令格式。

## Operating Context

左侧曲库，中央钢琴卷，底部试听琴键，右侧可收起的演奏设置。编排空间优先，默认米色浅色主题。

## Capabilities and Constraints

简谱、MIDI、JSON、TXT 导入，音符编辑，BPM、时值、试听、撤销、导出、暂停停止、全局快捷键、托盘、持久化、签名更新。Rust 管理游戏演奏时钟与输入。后台输入必须区分 API 发送与游戏接收，不采用注入或内存修改。MIT 授权。

## Brand Commitments

米色为主，松绿 #4A6741 点缀；淡墨远山画作只用于窗格留白。常驻界面只保留操作名称、必要标签和实际状态，详细说明放入帮助与悬浮提示。

## Evidence on Hand

参考源码提交 1895f2542cace0e7a8bbbd2278da6c1b66592db4，完整快照位于 legacy/。当前主机为 Windows，游戏未运行；macOS 与游戏实际接收分别验收。

## Product Principles

- 乐谱编辑与演奏共用数据，导入后直接演奏。
- 编排空间优先，操作可通过键盘完成。
- 停止、暂停和退出释放由本程序按下的键。
- 状态文案只陈述已获得的证据。

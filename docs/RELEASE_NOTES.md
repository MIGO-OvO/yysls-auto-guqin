## 燕云琴笺 0.1.1

- 编排器与演奏器整合为 Rust + Tauri 2 桌面应用。
- 全新黛青工作台、深浅主题、自定义标题栏与 36 键钢琴卷。
- 保留 JSON、MIDI、简谱、键位链及 TXT 命令，支持音符编辑、试听、撤销重做与曲库保存。
- Rust 独立演奏线程、暂停松键、停止清理、目标选择、全局快捷键和系统托盘。
- Windows Win32 与 macOS Quartz 输入适配；后台定向输入列为实验性，游戏接收未验证。
- GitHub Releases 签名更新：版本检查、更新日志、下载进度与确认安装。
- 修复低 BPM、四分网格下 1ms TXT 命令的导入与保存校验。

macOS 产物使用 ad-hoc 签名，尚未完成 Developer ID 签名与 Apple 公证。Windows 安装包未使用 Authenticode 证书。Tauri 更新包使用独立密钥签名并由客户端校验。

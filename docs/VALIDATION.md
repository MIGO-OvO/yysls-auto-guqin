# 验证记录

支持 Windows x64 与 macOS Apple Silicon；不再维护 macOS Intel。

## 曲谱 MIDI 导出与六种音色（2026-11-15）

本机生产构建、24 项 TypeScript 单元测试与 15 项 Playwright 场景通过。

Windows x64 NSIS 测试包构建完成，版本号保留为 0.1.6，文件位于 `artifacts/audio/yysls-auto-guqin_0.1.6-midi-instruments_x64-setup.exe`。本次未进行安装流程验收。

- MIDI 文件经解码和重新导入核对，覆盖和弦、重叠音符、长音、空拍、分数 BPM、中文曲名、乐器编号及同音重触发。
- Chromium 的真实 Web Audio 渲染覆盖钢琴、古琴、箜篌、箫、二胡、埙，核对弦音衰减、管弦持续音、力度变化、7 秒长音、44.1 / 48 kHz 下的 88 键两端及释音后静音。
- 界面核对音色持久化、录制窗口共用选择、MIDI 下载及 1440 × 920 / 900 × 640 布局；排程检查覆盖 100000 个音符、64 声部上限、取消启动及按通道的踏板松音。

30 秒对比片段位于 `artifacts/audio/instrument-comparison.wav`，依次为钢琴、古琴、箜篌、箫、二胡、埙，每种 5 秒。与游戏录音、真实乐器的听感对照及 macOS 音频待试听验收。

## 0.1.6 发布验证记录（2026-11-14）

[正式版本](https://github.com/MIGO-OvO/yysls-auto-guqin/releases/tag/v0.1.6) · [自动发布](https://github.com/MIGO-OvO/yysls-auto-guqin/actions/runs/43585109592) · [源码 CI](https://github.com/MIGO-OvO/yysls-auto-guqin/actions/runs/43585101768) · [Windows 原生联测](https://github.com/MIGO-OvO/yysls-auto-guqin/actions/runs/43586221410) · [macOS 原生联测](https://github.com/MIGO-OvO/yysls-auto-guqin/actions/runs/43586221531)，均已通过。

| 范围 | 结果 |
| --- | --- |
| 源码与界面 | 21 项 TypeScript 单元测试、13 项 Rust 核心测试、11 项 Playwright 场景通过；Windows 与 macOS 的格式、完整 Rust 测试和 Clippy 检查通过 |
| 发布资产 | 6 个文件全部下载，SHA256 与 GitHub Release 记录一致；Windows 安装包版本为 0.1.6 |
| 自动更新 | latest 指向 0.1.6，清单仅含 windows-x86_64 与 darwin-aarch64；下载地址、发布说明及签名文件一致，两平台真实更新下载和内置公钥验签通过 |
| Windows 安装与演奏 | 隔离 runner 安装 0.1.6，原生界面向独立接收窗口演奏，曲库保存、重载与快捷键检查通过 |
| Windows 升级 | 0.1.0 升级到 0.1.6，确认安装、取消、进度、自动重启、曲库保留及主题迁移通过 |
| macOS Apple Silicon | arm64 应用启动、曲库读写及 ad-hoc 签名检查通过；原生 probe 发送游戏按键数为 0，实际游戏接收待验收 |

Windows 0.1.6 安装包 SHA256：`a39a055be9b16dd35b462b128d2cbfec18e14cd87d54d6b9c7b818c124ef597d`。

实体 MIDI 键盘联测、macOS 更新安装与重启、游戏实际接收仍待现场验收。MIDI 功能的源码验证与实体设备验收步骤见下文。

## 0.1.5 发布验证记录（2026-11-13）

[自动发布](https://github.com/MIGO-OvO/yysls-auto-guqin/actions/runs/43403977583) · [源码 CI](https://github.com/MIGO-OvO/yysls-auto-guqin/actions/runs/43403964589) · [Windows 原生联测](https://github.com/MIGO-OvO/yysls-auto-guqin/actions/runs/43405624151) · [macOS 原生联测](https://github.com/MIGO-OvO/yysls-auto-guqin/actions/runs/43405624263)，均已通过。

| 范围                                      | 状态   | 证据                                                                                                                        |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| TypeScript 构建                           | 通过   | npm run build                                                                                                               |
| 乐谱、MIDI、映射、TXT、更新状态与发布清单 | 通过   | 14 项单元测试，含混合追加、1ms 命令、JSON 往返及两目标发布约束                                                              |
| Rust 时序、暂停、停止与异常清理           | 通过   | 10 项模型与引擎测试                                                                                                         |
| 更新签名与篡改拒绝                        | 通过   | Rust 使用真实签名测试文件校验                                                                                               |
| 钢琴卷交互与主题迁移                      | 通过   | 5 项 Playwright 场景，覆盖旧深色设置迁移、曲谱保留、后续主题选择、键盘与指针编辑、导出、试听、深浅主题和 950×650 / 1440×920 |
| 主题对比度                                | 通过   | 文字、主要按钮与音符标签最低对比度：浅色 4.58:1，深色 4.71:1                                                                |
| Win32 完整 36 键消息                      | 通过   | 独立进程收到 37 个音符 / 110 条按下抬起消息，含 Ctrl+Alt+Shift+F12；前台窗口未变化                                          |
| Windows 安装包与原生 UI                   | 通过   | 0.1.5 安装返回 0；界面向独立窗口演奏 Q / Shift+Q / Ctrl+E，收到 10 条消息；进度、曲库重载和快捷键冲突校验通过               |
| macOS Apple Silicon 安装包                | 通过   | 0.1.5 应用实际启动、读写曲库，核对 arm64 架构、版本和浅色主题，通过 ad-hoc 签名检查                                         |
| Windows / Apple Silicon 真实更新下载      | 通过   | 公开 latest.json → 0.1.5，两种系统实际下载并通过内置公钥及签名版本校验                                                      |
| Windows 更新安装与自动重启                | 通过   | 0.1.0 → 0.1.5；日志与进度、取消及确认安装、自动重启、曲库保留均通过；界面与保存设置均迁移为米色                             |
| macOS 更新安装与重启                      | 未验收 | 已验证真实更新下载及验签，安装流程需要单独核对                                                                              |
| Windows 游戏前台与后台接收                | 未验收 | 保留游戏内逐音与后台切换核对                                                                                                |
| macOS 窗口与授权状态检测                  | 通过   | 独立 Rust probe 找到应用窗口并连接适配器；runner 已预授权，发送按键数为 0                                                   |
| macOS 首次授权、撤销权限与游戏接收        | 未验收 | 需要实际授权操作及游戏内逐音核对                                                                                            |
| Developer ID / Apple 公证 / Authenticode  | 未配置 | 需要维护者证书                                                                                                              |

Win32 接收窗口记录按键、扫描码与抬起位。其 GetKeyState(Shift/Ctrl) 始终为 0；定向消息到达不会同步系统键盘状态，轮询该状态的游戏仍可能无法识别半音。

原生联测在隔离 GitHub runner 执行，日志、截图、窗口接收记录及 JSON 报告保存在对应工作流的 Artifacts 中。Windows 游戏内逐音验收按当前环境保留未验收状态。

正式发布的 6 个文件已下载并与 GitHub Release 的 SHA256 逐项核对。清单仅包含 windows-x86_64 与 darwin-aarch64；Windows 安装包完整性检查通过，macOS 更新包核对为 arm64、0.1.5、最低 macOS 13.0。

Windows 0.1.5 安装包 SHA256：`e3b5c8443b14ef54971a312134736479ad796a26595e740c9ce0e9713eab7966`。

## MIDI 设备与智能转换（2026-11-14）

Windows 主机完成原生 MIDI 设备枚举，当前检测到 0 个输入端口，未进行实体 MIDI 键盘联测。新增功能的验证范围如下：

0.1.6 源码构建、21 项 TypeScript 单元测试、13 项 Rust 测试、11 项 Playwright 场景及 Rust Clippy 全目标检查通过。

- Rust 录制器：按下、抬起、零力度 Note On、同音重触发、分通道、CC64 延音、All Notes Off、停止时补齐音长和录制上限。
- 转换：完整 88 键、音级保留、先选旋律再折叠、八度边界走向、装饰音与声部连续性、网格量化和录音开头等待裁剪。
- MIDI 导出：保留全音域、复音、力度、通道与延音后的音长，并能重新导入。
- 界面通过模拟 Tauri 设备接口验证连接、录制、原曲与 36 键试听、导出、另存曲谱、设备占用、拔出后保留录音、关闭后继续处理，以及窄窗口布局。未发送游戏按键。

macOS CoreMIDI 与实体设备的时序、拔插和踏板行为仍需现场验收。转换结果为单声部，需用含旋律、伴奏和交叉声部的实际演奏对比听辨。

实体设备验收：连接键盘后覆盖 A0 至 C8，测试同音重触发及踏板踩下、放开；录制后分别试听和保存 MIDI 与 36 键曲谱；录制中拔出设备或关闭窗口，确认录音保留，重新出现的设备由用户手动连接；关闭录制窗口后核对 F11 / F12 恢复。

## 游戏验收步骤

1. 打开游戏乐器的 36 键模式，记录游戏版本、系统、窗口模式、权限和输入方式。
2. 导入 [36 键测试谱](../examples/36-keys.txt)，逐音听辨 C3–B5。每音按住 150ms、间隔 200ms，全长 12.6 秒。
3. 验证 Shift+Z/A/Q、Shift+V/F/R、Shift+B/G/T、Ctrl+C/D/E、Ctrl+M/J/U；检查修饰键抬起后的自然音。
4. 后台模式切到文本编辑器，确认游戏继续接收且编辑器没有收到字符；记录丢音及半音错误。
5. 在长音中暂停、停止、关闭目标窗口并从托盘退出，检查无持续按键。前台模式切走后应停止。
6. macOS 撤销辅助功能权限后应报告权限丢失并停止；重新授权后由用户重新开始。
7. 不接收或音高不完整时标记不兼容，改用前台模式。

## 更新验收步骤

旧版本检查公开 latest.json，核对版本、日志、下载进度与签名。下载完成后保持运行，确认后保存曲库、停止演奏、安装并重启；曲库保留，旧主题首次迁移为米色。篡改包拒绝安装，网络断开、404 与签名错误显示失败并允许重试。

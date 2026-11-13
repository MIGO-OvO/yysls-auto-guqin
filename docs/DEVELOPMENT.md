# 开发与发布

## 目录

- `src/score.ts`：36 键表、统一乐谱、格式导入、命令导出与试听时间线。
- `src/PianoRoll.tsx`：网格、拖动、音长调整和选择。
- `src/App.tsx`：曲库、撤销重做、导入预览、演奏与设置。
- `src/audio.ts`：AudioContext 试听排队。
- `src/desktop.ts` / `src/updates.ts`：Tauri 调用、文件操作与更新状态。
- `src-tauri/src/model.rs`：Rust 边界校验与演奏计划。共享测试谱验证两侧时序一致。
- `src-tauri/src/engine.rs`：单调时钟、暂停、停止和线程清理。
- `src-tauri/src/platform/`：Win32 / Quartz 窗口及输入。
- `src-tauri/src/storage.rs`：写入临时文件、同步后替换曲库。

Rust 演奏线程以绝对起点计时，暂停时间从时钟排除；事件延迟超过自身结束时间会跳过，避免睡眠恢复后集中补发旧按键。前端只显示进度，不用 JS 计时器发送游戏输入。

## 本机构建

Windows 需要 Visual Studio C++ Build Tools、Windows SDK、WebView2。macOS 需要 Xcode Command Line Tools。

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = '仓库外 updater.key 的完整路径'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
npm run tauri -- build --ci --bundles nsis -- --locked -j 2
```

```sh
export TAURI_SIGNING_PRIVATE_KEY=/secure/path/updater.key
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=''
npm run tauri -- build --ci --target aarch64-apple-darwin --bundles app,dmg -- --locked -j 2
```

曲库位置由 Tauri 的 `app_data_dir()` 决定：Windows 通常为 `%APPDATA%/io.github.migo-ovo.yysls-auto-guqin/workspace.json`，macOS 为 `~/Library/Application Support/io.github.migo-ovo.yysls-auto-guqin/workspace.json`。读取失败时不覆盖原文件，界面提示导出当前编辑内容。

旧设置未带 `appearanceVersion` 时，首次加载切换为米色并保存版本标记 1；后续启动保留用户选择的浅色、深色或系统主题。曲谱、快捷键和其他设置沿用原值。

## 更新签名

首次配置用 `npm run tauri -- signer generate --write-keys <仓库外路径>` 生成密钥。将 `.pub` 中的公钥写入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。私钥全文放在仓库 Secret `TAURI_SIGNING_PRIVATE_KEY`；如设了密码，再配置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

保留私钥的独立备份。已分发的应用使用内置公钥验证更新，新生成的密钥无法为旧客户端签名。

## 系统签名

macOS 默认 `signingIdentity: "-"`，生成 ad-hoc 应用。需要 Developer ID 签名与 Apple 公证时，在仓库配置：

| Secret                       | 内容                                            |
| ---------------------------- | ----------------------------------------------- |
| `APPLE_CERTIFICATE`          | Developer ID Application 证书的 base64 编码 p12 |
| `APPLE_CERTIFICATE_PASSWORD` | p12 密码                                        |
| `APPLE_SIGNING_IDENTITY`     | Developer ID Application 身份                   |
| `APPLE_ID`                   | Apple 开发者账号                                |
| `APPLE_PASSWORD`             | App 专用密码                                    |
| `APPLE_TEAM_ID`              | 开发者团队 ID                                   |

工作流把这些值交给 Tauri 签名与公证。未提供证书时保持 ad-hoc，Release 不声称已公证。安装后在“系统设置 > 隐私与安全性 > 辅助功能”授权，再回到应用重新检测；应用签名或路径变化后可能需要重新授权。

Windows 以普通权限、当前用户安装。游戏提升权限时，手动以相同权限运行工具。使用 Authenticode 证书时配置 Tauri 的 Windows 签名设置或组织的外部签名服务；证书与服务凭据只放在 Secrets。

NSIS 保留简中和英文文本，关闭额外语言选择对话框。语言选择会阻塞 Updater 的 `/P /UPDATE /R` 安装流程，这一行为已在隔离 Windows runner 复现。

## 发布

1. 更新 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`Cargo.lock`、`tauri.conf.json` 的版本及 `docs/RELEASE_NOTES.md`。
2. 运行格式、编译、单元测试、UI 测试及原生冒烟。记录与游戏实测的区别。
3. 提交并推送到 `main`，再推送对应的 `vX.Y.Z` 标签。
4. Release 工作流构建三平台；发布阶段要求三份更新包、各自签名及两份 DMG 全部存在，资产文件名不得冲突。
5. 检查 Release 的 `latest.json`、签名和下载链接；从旧版本验证检查、下载、签名、确认安装及重新启动。

在多平台构建全部通过前，工作流不会把半套更新发布为 latest。

发布资产统一使用 `yysls-auto-guqin_版本_架构` 的 ASCII 文件名。GitHub 会改写部分非 ASCII 文件名；清单生成器会拒绝这类名称，避免下载地址失配。

在项目根目录可运行真实更新下载检查：

```sh
npm ci
npm run build
cargo run --manifest-path src-tauri/Cargo.toml --locked --example verify_release --features tauri/custom-protocol
```

检查器允许下载同版本，使用应用内置公钥验证包及签名版本，并将结果写入 `artifacts/update-verification.json`；它不会安装更新。Windows 示例程序单独嵌入 Common Controls 6 清单，主应用的清单由 Tauri 生成。

`Native Windows` 和 `Native macOS` 工作流在发布成功后运行，也可手动触发。Windows 使用隔离 runner 的专用接收窗口，并从 0.1.0 验证真实更新；WebView2 调试策略只绑定本应用，退出联测时清理。macOS 检查打包应用启动、曲库读写、代码签名、窗口枚举、权限边界及真实更新下载。两者均保留日志与截图或 JSON 记录，游戏接收单独验收。

## 输入 API 依据

- [Microsoft：WM_KEYDOWN 位定义](https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-keydown)
- [Microsoft：键盘状态与消息队列](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getkeyboardstate)
- [Apple：CGEvent 与 postToPid](https://developer.apple.com/documentation/coregraphics/cgevent)
- [Apple：AXIsProcessTrustedWithOptions](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions)
- [Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [Tauri GitHub 构建](https://v2.tauri.app/distribute/pipelines/github/)

# 迁移对照

上游：[Kukiisama/yysls-freeplay-arranger](https://github.com/Kukiisama/yysls-freeplay-arranger)，提交 `1895f2542cace0e7a8bbbd2278da6c1b66592db4`。`legacy/upstream-1895f25.zip` 保留全部已跟踪原文件，原目录不改动。

| 原实现                         | 保留规则                                                               | 新实现                                          |
| ------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| JS `OCTAVES` / `DEGREES`       | C3–B5，Z–M / A–J / Q–U，Shift 升音、Ctrl 降音                          | 统一键位表及 Rust 校验                          |
| `buildCommands`                | BPM 30–300，每格 4/8/16/32，单旋律，普通谱音长 20–6000ms，到下一音截断 | Rust 绝对时间调度，TXT 导出同规则               |
| JSON v1                        | `cols/timing/notes[col,len,midi,name,keys]` 与裸音符数组               | 导入兼容，导出保留旧字段                        |
| 文本序列                       | 简谱、键位链、箭头修饰、`×N` 音长                                      | 导入预览、替换或追加                            |
| MIDI                           | 网格量化，整体八度移调后折回 C3–B5，同列最高音                         | 标准 MIDI 解析，处理通道与速度变化，报告折叠    |
| C# CommandParser               | KEY、等待、注释、大小写与修饰键别名，按住 1–60000ms、等待 0–600000ms   | TXT 精确时间转换；36 键以外命令在命令轨显示     |
| C# Player                      | 独立线程、单调时钟、预热、前台保护、反序松键、F8/F9、托盘              | Rust 调度线程、可暂停、目标身份校验、两平台适配 |
| `settings.ini` / last commands | 下次恢复                                                               | 应用数据目录保存曲库与设置                      |

混合追加时，每个音符用可选的 `fromCommands` 保留音长规则，`endCol` 保留 TXT 曲尾休止。旧 JSON 未带来源标记时，按乐谱的 `source` 字段判断；普通谱继续使用原有 20–6000ms 范围。

## 实施与验收顺序

1. 统一模型与国风工作台：编排、试听、曲库、导入导出和历史操作可用。
2. Rust 引擎：时序、暂停停止、异常释放、窗口丢失；测试使用记录输入适配器。
3. Windows Win32 与 macOS Quartz：窗口枚举、权限、前台保护、实验性后台定向事件。普通测试窗口与实际游戏分别记录。
4. Tauri Updater：签名校验，检查、日志、进度、用户确认安装；私钥仅保存在仓库外和 GitHub Secrets。
5. 本地 Windows 构建与原生冒烟；GitHub Actions 仅构建 Windows x64、macOS arm64，全部成功后发布 Release。

后台模式不使用 AttachThreadInput、伪造焦点、游戏注入或内存访问。Win32 消息不保证改变游戏轮询的修饰键状态；Quartz 进程事件也可能被游戏拒绝。界面保留“游戏接收未验证”状态，验收需逐一听辨 36 个音及 Shift/Ctrl 半音，切走窗口后继续验证。

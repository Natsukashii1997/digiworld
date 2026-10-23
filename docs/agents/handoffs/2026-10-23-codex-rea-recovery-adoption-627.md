# 旧REA提示修复正式采用 · 627

输入625，认领626。用户授权完整备份后一次重启采用旧REA预演恢复修复，保持现有UI、扫描根和业务数据，其他三个C项不做。根代理唯一写者；本轮没有新增产品代码、构建、安装REA、确认更新或修改Agent配置。正式采用与旧提示核验完成；真实新版本预演受既有发布标签识别问题阻断，不能称整个REA更新链路通过。

## 采用与备份

- 正式服务已从release622切换至 `/Users/nat/Library/Application Support/PersonalAIWorkbench/releases/wb-20261023-626`，实际PID48730，端口5178。PID是本轮快照，未来需重查。
- 先备份程序、完整data、原生随手记App/草稿/偏好与启动配置：`work/adopt626/private-adoption-backup/`，3227文件、819096172字节，逐文件哈希核对，目录700/文件600；恢复权限表另存 `restore-file-modes.json`。旧622保留。
- `stop-intent/stopped/start-intent/started.json`证明一次bootout与一次bootstrap；仅启动目录和入口更换。原生随手记没有重启。
- 新包467文件完全匹配625冻结候选；与旧622只差server/rea-update.mjs。HTTP9项公开页面/资源核对正确，前端dist及61CSS不变。
- 本轮没有产品/测试修改；继续绑定同一候选的19专项、1528全量、三宽浏览器与独立双轴/T2证据，没有重复跑无变化套件。

## 实际使用核验

在用户实际Safari WebApp“数码世界”执行并截图：

1. 切换后首次进入逆向页：不弹旧预演，检查入口恢复。
2. 从来源刷新页面：不误弹。
3. 离开至设置，再进入逆向：不误弹。
4. 通过文件菜单关闭窗口，工作台重开到首页后进入逆向：不误弹。
5. 上述只读进入和刷新之后，旧REA账本仍与备份原字节相同；后端为idle，无旧计划。
6. 主动检查和一次“重新检查”均执行，checkedAt由13:05:40更新至13:06:27；返回真实发布识别错误，未再受旧目录身份阻断。主动错误提示可关闭，关闭后再次刷新不误弹。

7张实际截图见 `work/adopt626/ui/`，结构化记录见 `ui-verification.json`。实际页面独立补充复核为VISUAL_PASS，无重要视觉问题；错误提示与失败状态一致。

## 新发现：真实预演受阻，尚未修复

GitHub发布接口实际HTTP200，最新正式标签为 `rea-agents-6.7.0`，draft/prerelease均false；npm官方registry同版也HTTP200且名称rea-agents、版本6.7.0。现有代码只剥离v前缀，再要求纯三段数字，因而拒绝这个标签，提示“未取得可信的GitHub正式发布版”。这不是本次旧提示恢复修复引入的变化。

证据：`official-release-node-readback.json`、`release-tag-diagnosis.json`、两次检查结果JSON及05–06截图。首次辅助Python请求因本机证书链报错；随后用与服务相同Node fetch信任链读取成功，没有关闭TLS验证。错误不是网络服务不可达，也不是npm未同步。

因此没有得到可信新版本计划，未进入真实dry-run预演，更未点击确认更新。候选隔离预演/确认链此前通过，但不能代替本轮真实预演。没有伪造版本、清空账本、绕过检查或第二次重启。

建议另立最小修复：严格兼容已证实的rea-agents-版本号标签，同时保留正式仓库、发布URL、draft/prerelease与npm同版核验；添加标签解析回归，验证真实检查到预演，在确认写入前停止。该新增修复尚未获本轮采用授权，不在本轮修改；其他C项仍不做。

## 数据保护

主库revision940及快照SHA、13便签、13收藏/collection revision131、50项目、两扫描根和目录身份保持；原生随手记App/状态/偏好/启动配置保持。两个Agent配置和两个Skill目录共16文件哈希未变。UI界面资产逐字保持。

data从2749至2754文件，无缺失；新增5个内容相同的既有页面离线doctor诊断。现有4文件变化逐项解释：重启产生锁journal、日志追加；逆向页读取更新native sessions的updatedAt（items/operations及其余sessions语义全部相同）；两次明确检查按原语义保存新的REA检查失败结果。最终REA账本为当前身份的network_failed，没有plan/planId/expiresAt/未决写入，临时updates目录为空。AIHOT缓存本轮未变，未触发真实扫描、导入、AI任务或恢复。没有回滚用户数据。

完整保护结果：`data-protection.final.json`、`data-manifest.final.json`、`agent-installation.before/after.json`、`observed-data-diff.json`。所有源文件及原共享dirty以2148文件基线核对保留，HEAD仍e6e5d8b74474ea408ebb171ab70415e32d57ada4，未提交/推送。

## 交回

旧提示修复已正式采用并经实际页面验证。真实更新预演为明确受阻项，建议下一步由用户确认上述发布标签兼容修复；不能把运行采用、隔离测试或视觉通过写成真实预演通过或用户验收。后续正式重启/确认更新仍需对应授权，不延续本轮的一次重启。

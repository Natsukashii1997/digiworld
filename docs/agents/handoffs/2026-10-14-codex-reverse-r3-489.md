# Codex489 · 477 R3完成，继续派单487

输入487→认领488→R3工程交回489。用户要求先R3再487；本段完成后继续认领487，不等待重复确认。

## 结果

- 新增server/executable.mjs：服务端固定命令名从当前Node同目录、至多32个nvm版本入口、常见安装位置和绝对PATH目录定位；验证普通可执行文件、允许正常符号链接，返回绝对入口及独立环境快照。无需登录shell、which、改plist或读取AI配置。显式绝对命令不枚举安装目录。
- server/reverse-process.mjs与server/rea-compat.mjs复用同一机制。入口目录和当前Node目录前置PATH，保证npx的env-node shebang工作。server/rea-update.mjs将launch错误抛回可读503，不误归network_failed；原HTTP可信错误分支复用。
- 启动不存在/无执行权限：明确提示本地服务无法启动npx、检查安装位置与执行权限、修复后重启工作台；status/start/update检查不再统一500，不写入运行记录、不联网。
- tests/reverse-launch.test.mjs新增6项合成回归：精简PATH、匹配Node、空格与symlink、MCP、API错误无副作用、nvm回退、权限/目录、绝对路径隔离。

## 验证和精确指针

证据目录work/reverse488。r3-manifest.json包含5项，SHA256 da1d3d9a7d93a9ecee6316606c6d68639f166450cbfda5a62e7328005a60191c；r3.diff相对487实际dirty前像，HEAD未提交变化。

- related-final.log：44/44；full-unit-final.log：1285/1285。命令node --test --test-concurrency=1 tests/*.test.mjs。
- browser.log与ui/：1440/390/320现有页面真实显示启动失败原因，无横向溢出，使用隔离服务/假缺失工具；未触及5178。
- r3-review.md：Spec/Standards最终0未关闭，审查隔离P2已修并重绑。未改UI结构或样式，T2不适用。
- r3-red.log、r3-mcp-api-red.log、absolute-isolation-red.log保留首败；对应绿灯完整留存。
- 用实际固定服务Node位置+精简PATH做只读定位，成功找到/Users/nat/.nvm/versions/node/v24.16.0/lib/node_modules/npm/bin/npx-cli.js。此验证仅定位，没有执行真实REA/doctor。

849基线文件无丢失/范围外变化，正式dist、data/CURRENT.json、收藏state均与本轮基线一致；5178仍PID55062。未改plist/Agent配置、未安装/更新/真实AI或REA调用、未提交推送；本段后端尚未由正式进程采用，线上500需后续授权重启后验证。

无需新增安装。后续采用后打开逆向页应可读取版本；若本机工具确实缺失，会显示具体提示。技术验证已完成，不要求用户排查。

唯一下一步：Codex按用户既有授权继续认领487 AI只读执行器；R3与487一起交Claude复验/真实合成冒烟，正式采用与再次重启仍待用户授权。收藏485及插件既有成果保持。

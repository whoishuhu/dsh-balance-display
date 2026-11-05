# DSH balance display

A DeepSeek Harness plugin that shows your DeepSeek account balance (the same figures as Settings → Account) in a small pill at the bottom-right corner of the main window.

一个 DeepSeek Harness 插件：在主界面右下角显示账户余额（与「设置 → 账号与余额」相同的数据）。

## 功能

- 显示充值余额；有赠金余额时以 `+ ¥x.xx` 附加显示
- 登录后自动读取，每 60 秒以及窗口重新获得焦点时刷新；点击数字立即刷新
- 金额格式与设置页一致（保留两位小数、千分位、不足一分显示 `<¥0.01`）
- 跟随主题颜色和界面语言（中文、英文、日文）
- 点 `×` 隐藏，刷新页面后重新出现
- 未登录 DeepSeek 账号时显示「未登录」；仅使用 API Key、没有账号功能时不显示

## 安装

需要 DeepSeek Harness 0.2.x。

1. 克隆仓库：

   ```bash
   git clone https://github.com/<owner>/dsh-balance-display.git
   ```

2. 在 DeepSeek Harness 的对话中让 Agent 安装这个本地目录，例如：

   > 用 plugin_manager 安装 bundle：`C:\path\to\dsh-balance-display`

   Agent 会调用 `plugin_manager` 的 `install_bundle`，目标是插件目录的绝对路径。

3. 刷新界面，右下角出现余额。

卸载：让 Agent 对 `@local/dsh-balance-display` 执行 `remove_bundle`。

## 工作方式

插件只有 Client 半部分有逻辑（[client.js](client.js)）：

- 通过 `remote.account.watch` 跟踪登录状态
- 通过 `remote.account.getBalance` 读取钱包余额，与内置账号设置页调用的是同一个接口
- 渲染到 `shell.overlay` 插槽，不修改 Harness 源码

Host 半部分（[index.js](index.js)）为空。

## English

Install by asking the Harness agent to run `plugin_manager` `install_bundle` with the absolute path of this directory, then refresh the page. The pill shows the topped-up balance, plus any granted balance, refreshes every 60 seconds and on window focus, and can be refreshed by clicking the amount or hidden with `×`.

## License

[MIT](LICENSE)

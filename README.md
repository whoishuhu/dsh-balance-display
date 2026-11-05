# DSH balance display

A DeepSeek Harness plugin that shows your DeepSeek account balance (the same figures as Settings → Account) inline in the stats row under the message composer, next to the token and cache readings.

一个 DeepSeek Harness 插件：在输入框下方的统计信息行里（轮数、token、缓存命中旁边）显示账户余额，数据与「设置 → 账号与余额」相同。

## 功能

- 显示充值余额；有赠金余额时附加 `· 赠金 ¥x.xx`
- 点击余额弹出详情卡片：充值余额、赠金余额、本月消费（按模型分列）、最近的充值记录和赠金记录，并可跳转开放平台的用量页和充值页
- 登录后自动读取余额，每 60 秒以及窗口重新获得焦点时刷新
- 金额格式与设置页一致（保留两位小数、千分位、不足一分显示 `<¥0.01`）
- 样式与内置统计信息一致，跟随主题和界面语言（中文、英文、日文）
- 未登录 DeepSeek 账号时显示「未登录」；仅使用 API Key、没有账号功能时不显示

## 安装

需要 DeepSeek Harness 0.2.x。

1. 克隆仓库：

   ```bash
   git clone https://github.com/whoishuhu/dsh-balance-display.git
   ```

2. 在 DeepSeek Harness 的对话中让 Agent 安装这个本地目录，例如：

   > 用 plugin_manager 安装 bundle：`C:\path\to\dsh-balance-display`

   Agent 会调用 `plugin_manager` 的 `install_bundle`，目标是插件目录的绝对路径。

3. 刷新界面，输入框下方的统计行出现余额。

卸载：让 Agent 对 `@local/dsh-balance-display` 执行 `remove_bundle`。

## 工作方式

插件只有 Client 半部分有逻辑（[client.js](client.js)）：

- 通过 `remote.account.watch` 跟踪登录状态
- 通过 `remote.account.getBalance` 读取钱包余额，与内置账号设置页调用的是同一个接口
- 渲染到 `conversation.composer.dock` 插槽（内置统计信息所在的位置），不修改 Harness 源码

Host 半部分（[index.js](index.js)）注册一个本地路由 `GET /api/balance-display.details`。它用已登录账号的凭证调用开放平台网页自己使用的接口：

- `/api/v0/usage/by_api_key/cost`：本月消费
- `/auth-api/v0/users/get_all_invoice`：充值和赠金记录

凭证只在 Host 进程内使用，不会发给浏览器。**这两个接口没有公开文档，开放平台改版后可能失效**；失效时详情卡片会显示「读取失败」，余额本身不受影响。

## English

Install by asking the Harness agent to run `plugin_manager` `install_bundle` with the absolute path of this directory, then refresh the page. The balance appears in the stats row under the composer and refreshes every 60 seconds and on window focus. Clicking it opens a card with the topped-up and granted balances, this month's spending by model, and recent top-ups and grants. The Host half reads those from undocumented DeepSeek Platform endpoints with the signed-in grant, which never leaves the Host process; they may break when Platform changes.

## License

[MIT](LICENSE)

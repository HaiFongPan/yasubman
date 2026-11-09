# 安全说明

## 支持的版本

只维护 `main` 分支的最新提交。历史 tag 不单独打补丁。

## 报告漏洞

请通过 GitHub 的 [Security Advisories](https://github.com/HaiFongPan/yasubman/security/advisories/new) 私下报告，不要开公开 issue。请附上复现步骤、影响范围和版本/commit。

## 安全模型（重要）

- 本项目**没有账号体系**，默认也不启用认证。部署后谁能访问端口，谁就能读写全部数据。
- 推荐只绑定回环地址并通过 Tailscale 内网访问（`127.0.0.1:3000` + `tailscale serve`）。
- 如果要暴露到 tailnet 之外（例如 `tailscale funnel`），**必须**同时设置 `APP_USER` 和 `APP_PASSWORD`，并确保入口是 HTTPS；HTTP Basic Auth 在明文 HTTP 下等于泄露密码。
- SQLite 数据保存在挂载卷中；备份文件包含全部订阅、流水和账户备注，请按个人财务数据对待。
- MCP 端点（`/mcp`）与界面拥有同等写权限，同样只应暴露在可信网络内。

## 不在范围内

- Tailscale、反向代理、Docker 宿主机的配置问题
- 第三方汇率/App Store 接口的可用性与条款

# 贡献指南

## 环境

- Node.js 24（最低 22.12），npm
- 本地开发用 SQLite 文件，无需额外数据库

```bash
npm ci
npm run dev        # 前端 http://localhost:5173，API http://localhost:3001
```

## 提交前

```bash
npm run typecheck
npm run build
```

涉及数据层/接口的改动，再跑两套验收（务必用临时库，脚本会清空目标库）：

```bash
FX_PROVIDER=off SQLITE_PATH=/tmp/dev-test.db PORT=3999 npx tsx server/index.ts &
BASE_URL=http://localhost:3999 npm run verify:crud
MCP_URL=http://localhost:3999/mcp npm run verify:mcp
```

## 代码约定

- TypeScript strict；前后端共享类型放在 `shared/`，不要在两端各写一份
- 服务端业务逻辑集中在 `server/domain.ts`（HTTP API、MCP、每日结算共用），路由只做校验和转发
- 金额以最小货币单位整数存储；日期用 `YYYY-MM-DD` 字符串
- 注释、提交信息和文档使用中文；标识符用英文
- UI 保持现有设计语言：白底、细线、等宽数字、单一强调色；复用 `src/components/ui` 的基础组件

## 不要提交

- `data/` 下的 SQLite 数据库、`.env`、真实订阅/账户数据、导出的备份文件
- 真实 API key（本项目不需要任何 key）

## Pull Request

请说明：改了什么、为什么、如何验证（命令与结果）。界面改动附截图（亮/暗色任一）。CI 必须通过。

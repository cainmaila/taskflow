# Taskflow 設計文件

團隊任務管理系統（對標 Asana），邊討論邊迭代。此資料夾記錄討論結論與決策。

## 現況技術棧

SvelteKit 2 + Svelte 5、Tailwind 4、Drizzle ORM (D1 / SQLite)、better-auth、Vitest / Playwright，部署於 Cloudflare。

## 文件

- [decisions.md](./decisions.md) — 已確認的決策（D1–D34）
- [iteration-1.md](./iteration-1.md) — 第一個迭代的範圍、資料模型、實作順序

## 討論準則

- **一次只問一個問題。** 前面的回答會影響後面的問題，所以逐題往下，不一次丟多題。

## 本機開發與部署

- `pnpm dev`：開發（Vite，Cloudflare 綁定由 adapter 模擬）。
- `pnpm build && pnpm preview`：用 `wrangler dev` 跑建置結果（`vite preview` 無法載入 `cloudflare:workers`）。`.env` 的 `ORIGIN` 必須設成實際網址（例如 `http://localhost:8791`），否則 better-auth 回 404。
- `pnpm auth:schema` 更新 better-auth 的 Drizzle schema → `pnpm db:generate` 產生 migration（需 `.env` 有 Cloudflare 三個變數，值可先填假的）→ `pnpm db:migrate:local` 套用到本機 D1。
- `pnpm cf:types`：改 `wrangler.jsonc` 後重新產生 `worker-configuration.d.ts`。
- 遠端：先 `wrangler d1 create taskflow`，把 `database_id` 填進 `wrangler.jsonc`，再 `pnpm db:migrate:remote` 與 `wrangler deploy`。

## 帳號：seed 與邀請

- **建立第一位系統管理員（D31）**：在 `.env` 設 `ADMIN_EMAIL`、`ADMIN_PASSWORD`（可選 `ADMIN_NAME`；僅限本機，不要放進線上環境），先 `pnpm db:migrate:local`，再 `pnpm seed`。預設寫入本機 D1；寫入遠端必須明確 `pnpm seed --remote`。系統內已有任何使用者時腳本拒絕執行（exit 1）。
- **邀請（D29）**：管理人與系統管理員在 `/members` 輸入 email 與角色，取得一次性連結（7 天有效、只能用一次，只顯示一次，資料庫只存 sha256），自行轉交；對方在 `/invite/<token>` 設定姓名與密碼後自動登入。不寄信。
- **系統管理員**可在 `/members` 改角色、停用／啟用（停用 = better-auth ban，不刪除，D32）。最後一位有效的系統管理員不能被降級或停用（D27）。
- 本機煙霧測試：`pnpm build && pnpm exec wrangler dev --port 8792 --var ORIGIN:http://localhost:8792`。

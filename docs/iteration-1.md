# 第一個迭代範圍

依據 [decisions.md](./decisions.md)（D1–D34）整理。目標：約 15 人的單一團隊可以登入、建立專案與任務、用 DAG 組織任務、指派、追蹤狀態、留言。

## 要做

**帳號與權限**（D26–D32）

- 邀請制；角色：系統管理員、管理人、一般用戶。
- 初始系統管理員由 seed 腳本建立；邀請用一次性連結，7 天有效。
- 成員只能停用，不能刪除。

**任務**（D2–D8、D13–D16、D22–D23）

- 欄位：title、description（Markdown）、assignee（單人、可空）、status（待辦／進行中／擱置／完成）、start_date（選填）、due_date（必填）。
- 只有 due_date 時以里程碑顯示。
- 包含關係為多 parent 的 DAG，禁止循環；每人有不可刪除的個人根。
- 進度手動，parent 只顯示「子任務 n/m 完成」。
- 擱置：blocker 清單選填，非空即必為擱置；blocker 完成後自動移出清單，狀態不自動恢復。

**專案**（D5–D6、D9–D12）

- 專案有成員名單；任務與專案多對多，不繼承 parent。
- 可見者 = 個人根擁有者 ∪ 指派人 ∪ 所掛專案成員，並沿包含關係向下傳遞給子孫（D14）。
- 建立 parent→child 關聯時 UI 提示分享範圍（D15）。

**視圖與互動**（D20–D21、D24–D25）

- 清單視圖：「我的任務」與「專案任務清單」，可展開子任務；多 parent 時每處完整顯示並標「另有 N 個 parent」。
- 任務下的扁平留言串（Markdown），本人可編輯、刪除。

## 不做

- 看板、時間軸、甘特圖、日曆（甘特圖是後續目標，欄位已預留）。
- 通知（站內、email）、全文搜尋、活動紀錄、附件、標籤、自訂欄位、優先級。
- 多工作區、多租戶、計費、專案自訂狀態、多人指派、巢狀回覆、進度自動彙總。

## 資料模型草稿

| 表                  | 重點欄位                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| user（better-auth） | role（system_admin／manager／member）、disabled_at                                                                                           |
| invitation          | email、token、expires_at、used_at、invited_by                                                                                                |
| task                | id、title、description、status、assignee_id、start_date、due_date（個人根可空，其餘必填，見 D34）、created_by、root_owner_id（僅個人根有值） |
| task_parent         | parent_id、child_id（複合主鍵，寫入前做循環檢查；只存真正的 parent，個人根不會出現，D49）                                                    |
| task_blocker        | task_id、blocker_id（寫入前做循環檢查）                                                                                                      |
| project             | id、name                                                                                                                                     |
| project_member      | project_id、user_id                                                                                                                          |
| project_task        | project_id、task_id                                                                                                                          |
| comment             | id、task_id、author_id、body、created_at、edited_at                                                                                          |

可見性查詢用 SQLite recursive CTE 往上找祖先（D1 支援）。

## 建議實作順序

1. 基礎設施（已完成）：`adapter-cloudflare`、`wrangler.jsonc`、D1 migration 流程。
2. 帳號（已完成）：角色欄位、seed 腳本、邀請連結、停用。個人根不在 seed／接受邀請時建立，改為第一次進「我的任務」時懶建立（D41）。
3. 任務核心（已實作，待 review）：task／task_parent 表（移除 priority）、懶建立個人根（D41，個人根 due_date 豁免見 D34）、「我的任務」清單與篩選（狀態／來源／到期，D42–D43；專案篩選待第 5 步）、快速新增與 `/tasks/[id]` 詳情編輯（D44–D46）、Markdown 消毒渲染。task_parent 僅建表並在建立任務時寫入「個人根→任務」，循環檢查與子任務 UI 屬第 4 步。
4. DAG（已實作，待 review）：task_parent 只存真實 parent（D49，migration 0005 移除舊的根關聯並加 DB 護欄）、遞迴 CTE 可見性（D14）、循環檢查與寫入後複查（D3）、掛／移 parent（D50）與分享範圍提示（D15）、逐層載入子任務與 n/m（D52）、看不到的 parent 只顯示數量（D51）、刪除二選一（D53–D55）、「我指派給別人的」清單。
5. 專案（已實作，待 review）：project／project_member／project_task（migration 0007）、成員角色 owner／member、掛接權限、封存、專案感知的可見性（D56–D64）、`/projects`、`/projects/[id]`、任務詳情「所屬專案」區、`/tasks` 專案篩選。待決：成員自行退出專案、被刪任務在專案時子任務是否繼承專案掛接（D53）。
6. 擱置與 blocker。
7. 留言串。
8. 上線：建立遠端 D1、填 `wrangler.jsonc` 的 `database_id`、套用 migration、遠端 seed 管理員、設 production secrets 與 `ORIGIN`、`wrangler deploy`（每個動到遠端的指令先跟使用者確認）。

每一步都用 TDD 先寫循環檢查與可見性的測試，這兩處最容易出錯、也最不能出錯。

## 待釐清（實作前要定）

- DAG 展開的深度或數量上限（Workers CPU 與 D1 查詢限制）。
- 選 blocker 時只能選自己看得到的任務；被擋任務的可見者看不到 blocker 時如何顯示。
- 停用成員在專案成員名單與指派選單中的顯示。
- 把已被分享的任務從 parent 移除後，原本因此取得可見性的人如何處理（直接失去可見性即可，需確認）。

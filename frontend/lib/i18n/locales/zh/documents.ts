/**
 * zh overlay for the documents app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale zh` to draft the remainder.
 */
export const zh: Record<string, string> = {
  "contracts.action.stop_waiting": "停止等待",
  "contracts.body.tokens_summary": "占位符",
  "contracts.confirm.remove_party_body": "“{name}”及其签署人将从本合同中移除。",
  "contracts.confirm.remove_party_title": "移除此方？",
  "contracts.confirm.withdraw_body": "已发送的副本将无法再签署。撤回原因将对各方可见。",
  "contracts.confirm.withdraw_title": "撤回合同？",
  "contracts.issue.already_issued": "已签发",
  "contracts.issue.create_n": "创建 {count} 份合同",
  "contracts.issue.csv_row": "行",
  "contracts.issue.preview_counts": "{total} 行 · {ok} 可用 · {bad} 跳过",
  "contracts.issue.preview_hint": "系统会先读取并显示文件——在您点击“创建”之前不会创建任何合同。",
  "contracts.issue.preview_title": "“{file}” — 预览",
  "contracts.issue.row_ok": "就绪",
  "contracts.issue.skipped_csv": "下载 CSV",
  "contracts.issue.skipped_title": "跳过的行（{count}）",
  "contracts.msg.ceremony_code": "验证码 {code}。请在手机上核对并使用 PIN2 签署。",
  "contracts.msg.ceremony_expired": "请求已超时，请重新开始。",
  "contracts.msg.ceremony_failed": "签署未完成。",
  "contracts.msg.ceremony_starting": "正在向手机发送请求…",
  "contracts.msg.facts_saved": "合同详情已保存。",
  "contracts.msg.unsaved": "有未保存的更改",
  "contracts.msg.uploading": "正在上传文件…",
  "contracts.send.skipped_title": "有 {count} 方未送达",
  "contracts.step.done": "已完成",
  "contracts.step.facts": "详情",
  "contracts.step.file": "文件与正文",
  "contracts.step.issue": "批量签发",
  "contracts.step.label": "合同步骤",
  "contracts.step.parties": "各方",
  "contracts.step.progress": "已完成 {done}/{total} 个步骤",
  "contracts.step.send": "发送",
  "documents.confirm.remove_step_body": "将移除第 {n} 步“{name}”。在您点击“保存”之前不会保存任何更改。",
  "documents.confirm.remove_step_title": "移除此步骤？",
};

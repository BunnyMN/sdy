/**
 * zh overlay for the esign app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale zh` to draft the remainder.
 */
export const zh: Record<string, string> = {
  "esign.action.cancel_batch": "取消批次",
  "esign.action.keep_batch": "保留",
  "esign.action.preview_document": "查看文档",
  "esign.action.undo": "撤销",
  "esign.confirm.cancel_batch_body": "“{name}”中尚未签署的文档将被跳过，已签署的保持不变。此操作无法撤销。",
  "esign.confirm.cancel_batch_title": "取消此批次？",
  "esign.eid.confirm_note": "点击“开始”后，文档将发送至 eID Mongolia，您的手机会收到确认请求。",
  "esign.eid.confirm_title": "发送前请核对",
  "esign.eid.expires_in": "{time} 后过期",
  "esign.eid.expires_in_minutes": "约剩 {minutes} 分钟",
  "esign.eid.expiring": "即将过期…",
  "esign.eid.open_preview": "在新标签页中打开",
  "esign.eid.pick_other": "选择其他文件",
  "esign.eid.preview_unavailable": "此浏览器无法在此处显示 PDF。",
  "esign.eid.size": "大小",
  "esign.eid.start": "开始签署",
  "esign.eid.step_check": "核对",
  "esign.eid.step_compare_code": "请确认应用中的验证码与此处显示的完全一致。",
  "esign.eid.step_done": "已完成",
  "esign.eid.step_download": "下载",
  "esign.eid.step_open_app": "在手机上打开 eID Mongolia 应用。",
  "esign.eid.step_phone": "手机确认",
  "esign.eid.step_pick": "选择",
  "esign.eid.steps_label": "签署步骤",
  "esign.field.placement_box": "签名框",
  "esign.message.item_failed": "此文档未能签署。",
  "esign.message.placement_box_label": "签名框：X {x}，Y {y}，宽 {width}，高 {height} 点",
  "esign.message.placement_drag_hint": "拖动方框可移动，拖动角可调整大小。方向键移动 1 点（Shift：10）；Alt+方向键调整大小。",
  "esign.message.probe_failed": "无法连接 HSM。",
  "esign.message.probe_ok": "HSM 连接正常。",
  "esign.signature.draw_hint": "请用鼠标、手指或触控笔在白色区域内签名。轻点会留下一个点；“撤销”可删除最后一笔。",
  "esign.signature.mode": "签名方式",
  "esign.signature.mode_draw": "手写",
  "esign.signature.mode_type": "输入姓名",
  "esign.signature.type_hint": "如果无法手写，请输入姓名——将以手写字体作为您的签名。",
  "esign.signature.typed_label": "您的全名",
};

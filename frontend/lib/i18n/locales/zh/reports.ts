/**
 * zh overlay for the reports app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale zh` to draft the remainder.
 */
export const zh: Record<string, string> = {
  "reports.app.billing": "账单",
  "reports.app.contacts": "联系人",
  "reports.app.documents": "文档",
  "reports.app.esign": "电子签名",
  "reports.app.inventory": "库存",
  "reports.app.organisation": "组织",
  "reports.app.products": "产品",
  "reports.confirm.remove_schedule_body": "“{name}”将不再发送。",
  "reports.confirm.remove_schedule_title": "删除此计划？",
  "reports.field.frequency": "频率",
  "reports.field.from": "开始日期",
  "reports.field.month_day": "每月日期",
  "reports.field.time": "时间",
  "reports.field.to": "结束日期",
  "reports.field.weekday": "星期几",
  "reports.field.when": "时间",
  "reports.frequency.custom": "高级（cron）",
  "reports.frequency.daily": "每天",
  "reports.frequency.monthly": "每月",
  "reports.frequency.weekly": "每周",
  "reports.message.chart_truncated": "图表显示前 {shown} 行（共 {total} 行），全部数据见下表。",
  "reports.message.exporting": "正在准备文件…",
  "reports.message.range_inverted": "开始日期晚于结束日期。",
  "reports.preset.label": "快捷范围",
  "reports.preset.last_month": "上月",
  "reports.preset.this_month": "本月",
  "reports.preset.this_quarter": "本季度",
  "reports.preset.this_year": "今年",
  "reports.schedule.daily_at": "每天 {time}",
  "reports.schedule.failed": "失败",
  "reports.schedule.monthly_at": "每月 {day} 日 {time}",
  "reports.schedule.weekly_at": "每{day} {time}",
  "reports.weekday.0": "周日",
  "reports.weekday.1": "周一",
  "reports.weekday.2": "周二",
  "reports.weekday.3": "周三",
  "reports.weekday.4": "周四",
  "reports.weekday.5": "周五",
  "reports.weekday.6": "周六",
};

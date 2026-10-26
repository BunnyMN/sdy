/**
 * es overlay for the reports app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale es` to draft the remainder.
 */
export const es: Record<string, string> = {
  "reports.app.billing": "Facturación",
  "reports.app.contacts": "Contactos",
  "reports.app.documents": "Documentos",
  "reports.app.esign": "Firma electrónica",
  "reports.app.inventory": "Inventario",
  "reports.app.organisation": "Organización",
  "reports.app.products": "Productos",
  "reports.confirm.remove_schedule_body": "«{name}» dejará de enviarse.",
  "reports.confirm.remove_schedule_title": "¿Eliminar esta programación?",
  "reports.field.frequency": "Frecuencia",
  "reports.field.from": "Desde",
  "reports.field.month_day": "Día del mes",
  "reports.field.time": "Hora",
  "reports.field.to": "Hasta",
  "reports.field.weekday": "Día de la semana",
  "reports.field.when": "Cuándo",
  "reports.frequency.custom": "Avanzado (cron)",
  "reports.frequency.daily": "Cada día",
  "reports.frequency.monthly": "Cada mes",
  "reports.frequency.weekly": "Cada semana",
  "reports.message.chart_truncated": "El gráfico muestra las primeras {shown} de {total} filas. Todas están en la tabla de abajo.",
  "reports.message.exporting": "Preparando el archivo…",
  "reports.message.range_inverted": "La fecha de inicio es posterior a la de fin.",
  "reports.preset.label": "Rangos rápidos",
  "reports.preset.last_month": "El mes pasado",
  "reports.preset.this_month": "Este mes",
  "reports.preset.this_quarter": "Este trimestre",
  "reports.preset.this_year": "Este año",
  "reports.schedule.daily_at": "Cada día a las {time}",
  "reports.schedule.failed": "Fallido",
  "reports.schedule.monthly_at": "El día {day} de cada mes a las {time}",
  "reports.schedule.weekly_at": "Cada {day} a las {time}",
  "reports.weekday.0": "domingo",
  "reports.weekday.1": "lunes",
  "reports.weekday.2": "martes",
  "reports.weekday.3": "miércoles",
  "reports.weekday.4": "jueves",
  "reports.weekday.5": "viernes",
  "reports.weekday.6": "sábado",
};

/**
 * fr overlay for the reports app.
 *
 * Hand-written. The generator only ever fills in keys that are missing here,
 * so a correction made in this file is permanent.
 *
 * Partial on purpose: it holds the keys added with the UI/UX overhaul. The
 * rest of this app's words still fall back to English until a full pass is
 * made — run `npm run i18n:translate -- --locale fr` to draft the remainder.
 */
export const fr: Record<string, string> = {
  "reports.app.billing": "Facturation",
  "reports.app.contacts": "Contacts",
  "reports.app.documents": "Documents",
  "reports.app.esign": "Signature électronique",
  "reports.app.inventory": "Stock",
  "reports.app.organisation": "Organisation",
  "reports.app.products": "Produits",
  "reports.confirm.remove_schedule_body": "« {name} » ne sera plus envoyé.",
  "reports.confirm.remove_schedule_title": "Supprimer cette planification ?",
  "reports.field.frequency": "Fréquence",
  "reports.field.from": "Du",
  "reports.field.month_day": "Jour du mois",
  "reports.field.time": "Heure",
  "reports.field.to": "Au",
  "reports.field.weekday": "Jour de la semaine",
  "reports.field.when": "Quand",
  "reports.frequency.custom": "Avancé (cron)",
  "reports.frequency.daily": "Chaque jour",
  "reports.frequency.monthly": "Chaque mois",
  "reports.frequency.weekly": "Chaque semaine",
  "reports.message.chart_truncated": "Le graphique montre les {shown} premières lignes sur {total}. Toutes figurent dans le tableau ci-dessous.",
  "reports.message.exporting": "Préparation du fichier…",
  "reports.message.range_inverted": "La date de début est postérieure à la date de fin.",
  "reports.preset.label": "Périodes rapides",
  "reports.preset.last_month": "Le mois dernier",
  "reports.preset.this_month": "Ce mois-ci",
  "reports.preset.this_quarter": "Ce trimestre",
  "reports.preset.this_year": "Cette année",
  "reports.schedule.daily_at": "Chaque jour à {time}",
  "reports.schedule.failed": "Échec",
  "reports.schedule.monthly_at": "Le {day} de chaque mois à {time}",
  "reports.schedule.weekly_at": "Chaque {day} à {time}",
  "reports.weekday.0": "dimanche",
  "reports.weekday.1": "lundi",
  "reports.weekday.2": "mardi",
  "reports.weekday.3": "mercredi",
  "reports.weekday.4": "jeudi",
  "reports.weekday.5": "vendredi",
  "reports.weekday.6": "samedi",
};

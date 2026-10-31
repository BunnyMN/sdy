"use client";

/**
 * The reporting screen.
 *
 * It is written against the engine rather than against any report: it asks the
 * API which reports this organisation may run, asks a report to describe itself,
 * renders a form from that description, and draws whatever comes back. Adding a
 * report to a Go module puts it on this screen with no change here — which is
 * the point of a Report being a declaration.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  Download,
  FileSpreadsheet,
  Loader2,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  api,
  type ReportColumn,
  type ReportGroup,
  type ReportMetadata,
  type ReportResult,
  type ReportSchedule,
  type ReportSummary,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useErrorMessage } from "@/lib/useErrorMessage";
import { formatDay, formatMoment, formatMoney, formatNumber } from "@/lib/datetime";
import {
  Badge,
  Banner,
  EmptyState,
  LoadingBlock,
  Modal,
  PageHeader,
  cardClass,
  fieldClass,
  selectClass,
  tableHeadClass,
  useConfirm,
} from "@/components/ui";

// The app ids the platform ships, so a group heading reads as a name rather
// than as a reverse-domain string. The names are in the dictionary (every
// language, not just two); an app not in this list falls back to its id, which
// is the right answer for a third party's module.
const APP_NAME_KEYS: Record<string, string> = {
  "io.gerege.nexus.organisation": "reports.app.organisation",
  "io.gerege.nexus.billing": "reports.app.billing",
  "io.gerege.nexus.inventory": "reports.app.inventory",
  "io.gerege.nexus.esign": "reports.app.esign",
  "io.gerege.nexus.documents": "reports.app.documents",
  "io.gerege.nexus.contacts": "reports.app.contacts",
  "io.gerege.nexus.products": "reports.app.products",
};

/** How many rows the chart draws. More bars than this stop being readable. */
const CHART_ROWS = 60;

/**
 * `appFilter` narrows the screen to one app's reports — the documents app
 * mounts this same screen at /module/documents/reports so its reports live
 * INSIDE the app, beside the contracts they describe. Absent, every installed
 * app's reports are listed, which is what the standalone /reports page wants.
 */
export default function ReportsScreen({ appFilter }: { appFilter?: string }) {
  const { t, locale } = useI18n();
  const errorMessage = useErrorMessage();
  const confirm = useConfirm();

  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [selected, setSelected] = useState<ReportSummary | null>(null);
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [title, setTitle] = useState("");
  // Whether the last run crossed organisations. Kept beside the result rather
  // than derived from it: the two runs answer different questions and the
  // table must never be labelled as one while showing the other.
  const [consolidated, setConsolidated] = useState(false);
  const [byCompany, setByCompany] = useState(true);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");

  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [deliveryConfigured, setDeliveryConfigured] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const label = useCallback(
    (titles: Record<string, string> | undefined, fallback: string) =>
      titles?.[locale] || titles?.mn || titles?.en || fallback,
    [locale],
  );

  useEffect(() => {
    (async () => {
      try {
        const [list, scheduleList] = await Promise.all([
          api.getReports(),
          api.getReportSchedules(),
        ]);
        setGroups((list.groups || []).filter((group) => !appFilter || group.app === appFilter));
        setSchedules(scheduleList.schedules || []);
        setDeliveryConfigured(scheduleList.delivery_configured);
      } catch (err) {
        setFailure(errorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
    // errorMessage changes with the language; the list does not need reloading for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appFilter]);

  // Choosing a report clears the previous one's rows before the new
  // declaration arrives: leaving them up under a new heading is how somebody
  // reads one report's numbers as another's.
  const choose = async (report: ReportSummary) => {
    setSelected(report);
    setResult(null);
    setFailure("");
    setMetadata(null);
    try {
      const meta = await api.getReport(report.key);
      setMetadata(meta);
      setValues(defaultsFor(meta));
    } catch (err) {
      setFailure(errorMessage(err));
    }
  };

  const run = async (across = false) => {
    if (!selected) return;
    setRunning(true);
    setFailure("");
    try {
      const answer = across
        ? await api.runConsolidatedReport(selected.key, values)
        : await api.runReport(selected.key, values);
      setResult(answer.result);
      setTitle(answer.title);
      setConsolidated(across);
    } catch (err) {
      setFailure(`${t("reports.message.run_failed")}: ${errorMessage(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const download = async (format: "xlsx" | "csv") => {
    if (!selected || exporting) return;
    setExporting(format);
    try {
      const { blob, filename } = await api.exportReport(selected.key, values, format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setFailure(`${t("reports.message.export_failed")}: ${errorMessage(err)}`);
    } finally {
      setExporting(null);
    }
  };

  const reloadSchedules = async () => {
    const list = await api.getReportSchedules();
    setSchedules(list.schedules || []);
    setDeliveryConfigured(list.delivery_configured);
  };

  const removeSchedule = async (schedule: ReportSchedule) => {
    const ok = await confirm({
      title: t("reports.confirm.remove_schedule_title"),
      body: t("reports.confirm.remove_schedule_body", {
        name: schedule.name || label(schedule.titles, schedule.report_key),
      }),
      confirmLabel: t("base.action.delete"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteReportSchedule(schedule.id);
      setNotice(t("reports.message.schedule_removed"));
      await reloadSchedules();
    } catch (err) {
      setFailure(errorMessage(err));
    }
  };

  // The organisation breakdown, folded away when the reader wants one set of
  // figures. Merging is done here rather than asked of the server: the rows are
  // already in hand, and a second round trip to see the same numbers grouped
  // differently is a round trip for nothing.
  const displayed = useMemo(
    () => (consolidated && !byCompany && result ? mergeOrganisations(result) : result),
    [consolidated, byCompany, result],
  );
  const chart = useMemo(() => chartShape(displayed), [displayed]);

  if (loading) return <LoadingBlock label={t("base.message.loading")} />;

  const hasReports = groups.some((group) => group.reports.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<BarChart3 aria-hidden="true" className="w-7 h-7 text-accent" />}
        title={t("reports.view.title")}
        subtitle={t("reports.view.subtitle")}
        actions={
          selected ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => run(false)}
                disabled={running}
                aria-busy={running || undefined}
                className="min-h-11 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition"
              >
                <Play aria-hidden="true" className="w-4 h-4" />
                {t("reports.action.run")}
              </button>
              {/* The consolidated run is a separate button rather than a
                  mode, because it answers a different question and a toggle
                  somebody left on would silently change what the numbers mean. */}
              <button
                type="button"
                onClick={() => run(true)}
                disabled={running}
                className="min-h-11 bg-surface border border-line hover:bg-accent-soft disabled:opacity-50 text-accent text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition"
                title={t("reports.hint.consolidated")}
              >
                <Building2 aria-hidden="true" className="w-4 h-4" />
                {t("reports.action.run_consolidated")}
              </button>
              <button
                type="button"
                onClick={() => download("xlsx")}
                disabled={!result || exporting !== null}
                aria-busy={exporting === "xlsx" || undefined}
                className="min-h-11 bg-surface border border-line hover:bg-surface-hover disabled:opacity-50 text-foreground text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition"
              >
                {exporting === "xlsx" ? (
                  <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSpreadsheet aria-hidden="true" className="w-4 h-4" />
                )}
                {t("reports.action.export_xlsx")}
              </button>
              <button
                type="button"
                onClick={() => download("csv")}
                disabled={!result || exporting !== null}
                aria-busy={exporting === "csv" || undefined}
                className="min-h-11 bg-surface border border-line hover:bg-surface-hover disabled:opacity-50 text-foreground text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition"
              >
                {exporting === "csv" ? (
                  <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
                ) : (
                  <Download aria-hidden="true" className="w-4 h-4" />
                )}
                {t("reports.action.export_csv")}
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                className="min-h-11 bg-surface border border-line hover:bg-surface-hover text-foreground text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition"
              >
                <CalendarClock aria-hidden="true" className="w-4 h-4" />
                {t("reports.action.schedule")}
              </button>
            </div>
          ) : undefined
        }
      />

      {failure && <Banner tone="error" message={failure} onDismiss={() => setFailure("")} />}
      {exporting && (
        <p role="status" className="sr-only">
          {t("reports.message.exporting")}
        </p>
      )}
      {notice && <Banner tone="success" message={notice} onDismiss={() => setNotice("")} />}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* The list, grouped by app. The grouping is the app gate made
            visible: a section for an app this organisation does not have
            simply is not here. */}
        <aside className={`${cardClass} p-4 lg:col-span-1 h-max`}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
            {t("reports.section.reports")}
          </h2>
          {!hasReports ? (
            <p className="text-sm text-muted">{t("reports.message.no_reports")}</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.app}>
                  <p className="text-2xs font-bold uppercase tracking-wide text-muted mb-1">
                    {APP_NAME_KEYS[group.app] ? t(APP_NAME_KEYS[group.app] as never) : group.app}
                  </p>
                  <ul className="space-y-1">
                    {group.reports.map((report) => (
                      <li key={report.key}>
                        <button
                          type="button"
                          onClick={() => choose(report)}
                          aria-current={selected?.key === report.key ? "true" : undefined}
                          className={`w-full min-h-9 text-left text-sm px-3 py-2 rounded-lg transition ${
                            selected?.key === report.key
                              ? "bg-accent-soft text-accent font-semibold"
                              : "text-foreground hover:bg-surface-hover"
                          }`}
                        >
                          {label(report.titles, report.key)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </aside>

        <section className="lg:col-span-3 space-y-6">
          {!selected && <EmptyState message={t("reports.message.select")} />}

          {metadata && metadata.params.length > 0 && (
            <div className={`${cardClass} p-4`}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
                {t("reports.section.parameters")}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {metadata.params.map((param) => (
                  <ParamField
                    key={param.key}
                    param={param}
                    values={values}
                    onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
                    label={label}
                  />
                ))}
              </div>
            </div>
          )}

          {running && <LoadingBlock label={t("reports.message.running")} />}

          {result && displayed && !running && (
            <>
              {result.notes?.map((note, index) => (
                <Banner
                  key={index}
                  tone={note.level === "warning" ? "warning" : "info"}
                  message={note.message}
                />
              ))}

              {chart && (
                <div className={`${cardClass} p-4`}>
                  <h2 id="report-chart-title" className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
                    {t("reports.section.chart")}
                  </h2>
                  {/* The chart is a picture of the table below; a screen reader
                      is pointed at the table, which says the same thing in full. */}
                  <div
                    className="h-72"
                    role="img"
                    aria-labelledby="report-chart-title"
                    aria-describedby={`report-result-table${chart.truncated ? " report-chart-truncated" : ""}`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--gerege-border)" />
                        <XAxis
                          dataKey="__category"
                          tick={{ fontSize: 11, fill: "var(--gerege-muted)" }}
                          stroke="var(--gerege-border)"
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "var(--gerege-muted)" }}
                          stroke="var(--gerege-border)"
                          tickFormatter={(value: number) => formatCell(value, chart.series[0])}
                          width={88}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--gerege-surface-hover)" }}
                          contentStyle={{
                            background: "var(--gerege-surface)",
                            border: "1px solid var(--gerege-border)",
                            borderRadius: 8,
                            color: "var(--gerege-fg)",
                            fontSize: 12,
                          }}
                          labelStyle={{ color: "var(--gerege-fg)", fontWeight: 600 }}
                          itemStyle={{ color: "var(--gerege-fg)" }}
                          formatter={(value, _name, item) => {
                            const column = chart.series.find((series) => series.key === item?.dataKey);
                            return column ? formatCell(value, column) : String(value);
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, color: "var(--gerege-fg)" }} />
                        {chart.series.map((series, index) => (
                          <Bar
                            key={series.key}
                            dataKey={series.key}
                            name={label(series.titles, series.key)}
                            fill={SERIES_COLOURS[index % SERIES_COLOURS.length]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {chart.truncated && (
                    <p id="report-chart-truncated" className="text-xs text-muted mt-2">
                      {t("reports.message.chart_truncated", { shown: CHART_ROWS, total: chart.total })}
                    </p>
                  )}
                </div>
              )}

              {consolidated && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="bg-accent-soft text-accent text-2xs font-semibold px-2.5 py-1 rounded-full border border-line flex items-center gap-1">
                    <Building2 aria-hidden="true" className="w-3 h-3" />
                    {t("reports.badge.consolidated")}
                  </span>
                  <label className="flex min-h-9 items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={byCompany}
                      onChange={(e) => setByCompany(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    {t("reports.toggle.by_company")}
                  </label>
                </div>
              )}

              <ResultTable result={displayed} title={title} label={label} totalLabel={t("reports.field.total")} rowsLabel={t("reports.field.rows")} emptyLabel={t("reports.message.empty")} />
            </>
          )}

          <SchedulesCard
            schedules={schedules}
            deliveryConfigured={deliveryConfigured}
            onRemove={(schedule) => void removeSchedule(schedule)}
            onAdd={() => setScheduleOpen(true)}
            canAdd={Boolean(selected)}
            label={label}
          />
        </section>
      </div>

      {scheduleOpen && selected && (
        <ScheduleModal
          reportKey={selected.key}
          reportTitle={label(selected.titles, selected.key)}
          values={values}
          onClose={() => setScheduleOpen(false)}
          onSaved={async () => {
            setScheduleOpen(false);
            setNotice(t("reports.message.schedule_saved"));
            await reloadSchedules();
          }}
        />
      )}
    </div>
  );
}

// The theme's own colours, so a bar is as readable on the dark surface as on
// the light one: accent, then the status hues, in an order that keeps
// neighbouring series apart. A report decides its own series, so the order is
// what matters.
const SERIES_COLOURS = [
  "var(--gerege-blue)",
  "var(--gerege-success)",
  "var(--gerege-warning-fg)",
  "var(--gerege-danger)",
  "var(--gerege-neutral-fg)",
];

/** defaultsFor seeds the form. Dates are left blank so the server's own
 *  default window applies — every report declares its own, and guessing one
 *  here would override it. */
function defaultsFor(meta: ReportMetadata): Record<string, string> {
  const values: Record<string, string> = {};
  for (const param of meta.params) {
    if (param.kind === "select" && typeof param.default === "string") {
      values[param.key] = param.default;
    }
    if (param.kind === "bool" && typeof param.default === "boolean") {
      values[param.key] = String(param.default);
    }
  }
  return values;
}

/** yyyy-mm-dd for the first and last day of a range, in Ulaanbaatar time. */
function presetRange(preset: "this_month" | "last_month" | "this_quarter" | "this_year"): [string, string] {
  const [year, month] = formatDay(new Date()).split("-").map(Number);
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  switch (preset) {
    case "this_month":
      return [iso(year, month, 1), iso(year, month, lastDay(year, month))];
    case "last_month": {
      const y = month === 1 ? year - 1 : year;
      const m = month === 1 ? 12 : month - 1;
      return [iso(y, m, 1), iso(y, m, lastDay(y, m))];
    }
    case "this_quarter": {
      const first = Math.floor((month - 1) / 3) * 3 + 1;
      return [iso(year, first, 1), iso(year, first + 2, lastDay(year, first + 2))];
    }
    case "this_year":
      return [iso(year, 1, 1), iso(year, 12, 31)];
  }
}

const PRESETS = ["this_month", "last_month", "this_quarter", "this_year"] as const;

function ParamField({
  param,
  values,
  onChange,
  label,
}: {
  param: ReportMetadata["params"][number];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  label: (titles: Record<string, string> | undefined, fallback: string) => string;
}) {
  const { t } = useI18n();
  const id = React.useId();
  const name = label(param.titles, param.key);

  if (param.kind === "date_range") {
    const from = values[`${param.key}_from`] || "";
    const to = values[`${param.key}_to`] || "";
    return (
      <fieldset className="sm:col-span-2">
        <legend className="block text-xs font-semibold text-muted mb-1">{name}</legend>
        <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label={t("reports.preset.label")}>
          {PRESETS.map((preset) => {
            const [start, end] = presetRange(preset);
            const active = from === start && to === end;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onChange(`${param.key}_from`, start);
                  onChange(`${param.key}_to`, end);
                }}
                className={`min-h-9 px-2.5 text-xs font-medium rounded-full border ${
                  active ? "bg-accent-soft text-accent border-line" : "border-line text-muted hover:bg-surface-hover"
                }`}
              >
                {t(`reports.preset.${preset}` as never)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-from`} className="sr-only">{t("reports.field.from")}</label>
          <input
            id={`${id}-from`}
            type="date"
            className={fieldClass}
            value={from}
            max={to || undefined}
            onChange={(e) => onChange(`${param.key}_from`, e.target.value)}
          />
          <span aria-hidden="true" className="text-muted">—</span>
          <label htmlFor={`${id}-to`} className="sr-only">{t("reports.field.to")}</label>
          <input
            id={`${id}-to`}
            type="date"
            className={fieldClass}
            value={to}
            min={from || undefined}
            onChange={(e) => onChange(`${param.key}_to`, e.target.value)}
          />
        </div>
        {from && to && from > to && (
          <p role="alert" className="text-xs text-danger mt-1">{t("reports.message.range_inverted")}</p>
        )}
      </fieldset>
    );
  }

  if (param.kind === "select" || param.kind === "uuid") {
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-semibold text-muted mb-1">{name}</label>
        <select
          id={id}
          className={selectClass}
          value={values[param.key] || ""}
          onChange={(e) => onChange(param.key, e.target.value)}
        >
          <option value="">—</option>
          {(param.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {label(option.titles, option.value)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (param.kind === "bool") {
    return (
      <label htmlFor={id} className="flex min-h-11 items-center gap-2 mt-6 text-sm text-foreground">
        <input
          id={id}
          type="checkbox"
          checked={values[param.key] === "true"}
          onChange={(e) => onChange(param.key, String(e.target.checked))}
          className="h-4 w-4 rounded border-input"
        />
        {name}
      </label>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-muted mb-1">{name}</label>
      <input
        id={id}
        type="text"
        className={fieldClass}
        value={values[param.key] || ""}
        onChange={(e) => onChange(param.key, e.target.value)}
      />
    </div>
  );
}

/** mergeOrganisations folds a consolidated result back into one set of figures.
 *
 *  Every row keyed by the same category is summed across organisations, and the
 *  organisation column is dropped. Text columns other than the category are
 *  dropped too rather than being picked arbitrarily from one company's row —
 *  showing one organisation's label above another's numbers is worse than
 *  showing none. */
function mergeOrganisations(result: ReportResult): ReportResult {
  const columns = result.columns.filter((column) => column.key !== "__organisation");
  const category = columns.find((column) => column.chart === "category");
  if (!category) {
    return { ...result, columns };
  }

  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of result.rows) {
    const key = String(row[category.key] ?? "");
    const existing = grouped.get(key);
    if (!existing) {
      const copy: Record<string, unknown> = { [category.key]: row[category.key] };
      for (const column of columns) {
        if (isNumeric(column)) copy[column.key] = Number(row[column.key] ?? 0);
      }
      grouped.set(key, copy);
      continue;
    }
    for (const column of columns) {
      if (isNumeric(column)) {
        existing[column.key] = Number(existing[column.key] ?? 0) + Number(row[column.key] ?? 0);
      }
    }
  }

  return { ...result, columns, rows: Array.from(grouped.values()) };
}

/** chartShape decides whether a result can be drawn, using the hints the report
 *  declared: exactly one category column and at least one value column. Nothing
 *  else is guessed — a report that does not say how it should be charted is
 *  shown as a table, which is the honest outcome. */
function chartShape(result: ReportResult | null | undefined) {
  if (!result || result.rows.length === 0) return null;

  const category = result.columns.find((column) => column.chart === "category");
  const series = result.columns.filter((column) => column.chart === "value");
  if (!category || series.length === 0) return null;

  const data = result.rows.slice(0, CHART_ROWS).map((row) => {
    const point: Record<string, unknown> = { __category: formatCell(row[category.key], category) };
    for (const column of series) {
      point[column.key] = Number(row[column.key] ?? 0);
    }
    return point;
  });
  return { data, series, total: result.rows.length, truncated: result.rows.length > CHART_ROWS };
}

function ResultTable({
  result,
  title,
  label,
  totalLabel,
  rowsLabel,
  emptyLabel,
}: {
  result: ReportResult;
  title: string;
  label: (titles: Record<string, string> | undefined, fallback: string) => string;
  totalLabel: string;
  rowsLabel: string;
  emptyLabel: string;
}) {
  if (result.rows.length === 0) {
    return <EmptyState message={emptyLabel} />;
  }

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <h2 id="report-result-title" className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-muted">
          {result.rows.length} {rowsLabel}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table id="report-result-table" aria-labelledby="report-result-title" className="w-full text-sm">
          <thead className={tableHeadClass}>
            <tr>
              {result.columns.map((column) => (
                <th
                  scope="col"
                  key={column.key}
                  className={`px-4 py-3 ${isNumeric(column) ? "text-right" : "text-left"}`}
                >
                  {label(column.titles, column.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.rows.map((row, index) => (
              <tr key={index} className="hover:bg-surface-hover">
                {result.columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-2.5 ${
                      isNumeric(column) ? "text-right tabular-nums text-foreground" : "text-foreground"
                    }`}
                  >
                    {formatCell(row[column.key], column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {result.totals && Object.keys(result.totals).length > 0 && (
            <tfoot className="bg-surface-2 border-t-2 border-line">
              <tr>
                {result.columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={`px-4 py-2.5 font-semibold ${
                      isNumeric(column) ? "text-right tabular-nums" : "text-left"
                    }`}
                  >
                    {index === 0
                      ? totalLabel
                      : column.total
                        ? formatCell(result.totals?.[column.key], column)
                        : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function SchedulesCard({
  schedules,
  deliveryConfigured,
  onRemove,
  onAdd,
  canAdd,
  label,
}: {
  schedules: ReportSchedule[];
  deliveryConfigured: boolean;
  onRemove: (schedule: ReportSchedule) => void;
  onAdd: () => void;
  canAdd: boolean;
  label: (titles: Record<string, string> | undefined, fallback: string) => string;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();

  return (
    <div className={`${cardClass} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("reports.section.schedules")}
        </h2>
        {canAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="min-h-9 text-xs font-semibold text-accent hover:underline flex items-center gap-1"
          >
            <Plus aria-hidden="true" className="w-3.5 h-3.5" />
            {t("reports.action.new_schedule")}
          </button>
        )}
      </div>

      {/* Said once, where it matters: a schedule created on a deployment with
          no mail transport looks active and delivers nothing. */}
      {!deliveryConfigured && schedules.length > 0 && (
        <div className="mb-3">
          <Banner tone="warning" message={t("reports.message.delivery_off")} />
        </div>
      )}

      {schedules.length === 0 ? (
        <p className="text-sm text-muted">{t("reports.message.no_schedules")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th scope="col" className="px-3 py-2 text-left">{t("reports.field.report")}</th>
                <th scope="col" className="px-3 py-2 text-left">{t("reports.field.when")}</th>
                <th scope="col" className="px-3 py-2 text-left">{t("reports.field.recipients")}</th>
                <th scope="col" className="px-3 py-2 text-left">{t("reports.field.last_run")}</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">{t("base.field.actions")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="hover:bg-surface-hover">
                  <td className="px-3 py-2 text-foreground">
                    {schedule.name || label(schedule.titles, schedule.report_key)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    <span className="text-foreground">{describeCron(schedule.cron, t)}</span>
                    <span className="block font-mono text-2xs">{schedule.cron}</span>
                  </td>
                  <td className="px-3 py-2 text-muted">{schedule.recipients.join(", ")}</td>
                  <td className="px-3 py-2 text-xs">
                    {schedule.last_run_at ? (
                      <span className="flex flex-wrap items-center gap-1.5 text-muted">
                        {formatMoment(schedule.last_run_at)}
                        {/* A visible badge, not a ⚠ with the reason in a tooltip
                            nobody hovers over: a schedule that failed delivers
                            nothing, and the table is where that is noticed. */}
                        {schedule.last_status === "FAILED" && (
                          <Badge tone="danger">
                            <AlertTriangle aria-hidden="true" className="w-3 h-3" />
                            {t("reports.schedule.failed")}
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                    {schedule.last_status === "FAILED" && schedule.last_error && (
                      <span className="block text-2xs text-danger mt-0.5">
                        {errorMessage(schedule.last_error)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(schedule)}
                      className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-danger hover:bg-danger-soft transition"
                      aria-label={t("base.action.delete")}
                      title={t("base.action.delete")}
                    >
                      <Trash2 aria-hidden="true" className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Frequency = "daily" | "weekly" | "monthly" | "custom";

/** The friendly picker's choice, as the five cron fields the server stores. */
function cronFor(frequency: Frequency, time: string, weekday: string, monthDay: string, custom: string): string {
  const [hour, minute] = (time || "09:00").split(":").map((part) => String(Number(part)));
  switch (frequency) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${weekday}`;
    case "monthly":
      return `${minute} ${hour} ${monthDay} * *`;
    default:
      return custom.trim();
  }
}

/** A cron line the picker could have produced, said in words; anything else is shown as is. */
function describeCron(cron: string, t: (key: never, vars?: Record<string, string | number>) => string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [minute, hour, day, month, weekday] = parts;
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour) || month !== "*") return cron;
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  if (day === "*" && weekday === "*") return t("reports.schedule.daily_at" as never, { time });
  if (day === "*" && /^[0-6]$/.test(weekday)) {
    return t("reports.schedule.weekly_at" as never, { day: t(`reports.weekday.${weekday}` as never), time });
  }
  if (/^\d+$/.test(day) && weekday === "*") return t("reports.schedule.monthly_at" as never, { day, time });
  return cron;
}

function ScheduleModal({
  reportKey,
  reportTitle,
  values,
  onClose,
  onSaved,
}: {
  reportKey: string;
  reportTitle: string;
  values: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const id = React.useId();
  const [name, setName] = useState(reportTitle);
  // The picker covers what people schedule — every day, every week, every
  // month, at a time — and cron stays available for anything else.
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState("1");
  const [monthDay, setMonthDay] = useState("1");
  const [custom, setCustom] = useState("0 9 1 * *");
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [recipients, setRecipients] = useState("");
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);

  const cron = cronFor(frequency, time, weekday, monthDay, custom);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFailure("");
    try {
      await api.createReportSchedule({
        report_key: reportKey,
        name,
        params: values,
        cron,
        format,
        recipients: recipients
          .split(",")
          .map((address) => address.trim())
          .filter(Boolean),
      });
      onSaved();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const labelClass = "block text-xs font-semibold text-muted mb-1";

  return (
    <Modal label={t("reports.action.schedule")} onClose={onClose} dismissible={!saving}>
      <h2 className="text-xl font-bold text-foreground mb-4">{t("reports.action.schedule")}</h2>
      <form onSubmit={save} className="space-y-4">
        {failure && <Banner tone="error" message={failure} onDismiss={() => setFailure("")} />}

        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>
            {t("reports.field.schedule_name")}
          </label>
          <input id={`${id}-name`} className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-frequency`} className={labelClass}>
              {t("reports.field.frequency")}
            </label>
            <select
              id={`${id}-frequency`}
              className={selectClass}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              <option value="daily">{t("reports.frequency.daily")}</option>
              <option value="weekly">{t("reports.frequency.weekly")}</option>
              <option value="monthly">{t("reports.frequency.monthly")}</option>
              <option value="custom">{t("reports.frequency.custom")}</option>
            </select>
          </div>
          {frequency !== "custom" && (
            <div>
              <label htmlFor={`${id}-time`} className={labelClass}>
                {t("reports.field.time")}
              </label>
              <input
                id={`${id}-time`}
                type="time"
                className={fieldClass}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          )}
          {frequency === "weekly" && (
            <div>
              <label htmlFor={`${id}-weekday`} className={labelClass}>
                {t("reports.field.weekday")}
              </label>
              <select
                id={`${id}-weekday`}
                className={selectClass}
                value={weekday}
                onChange={(e) => setWeekday(e.target.value)}
              >
                {["1", "2", "3", "4", "5", "6", "0"].map((day) => (
                  <option key={day} value={day}>
                    {t(`reports.weekday.${day}` as never)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {frequency === "monthly" && (
            <div>
              <label htmlFor={`${id}-monthday`} className={labelClass}>
                {t("reports.field.month_day")}
              </label>
              <select
                id={`${id}-monthday`}
                className={selectClass}
                value={monthDay}
                onChange={(e) => setMonthDay(e.target.value)}
              >
                {/* 1–28: every month has them, so "the 31st" never silently skips February. */}
                {Array.from({ length: 28 }, (_, index) => String(index + 1)).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {frequency === "custom" ? (
          <div>
            <label htmlFor={`${id}-cron`} className={labelClass}>
              {t("reports.field.cron")}
            </label>
            <input
              id={`${id}-cron`}
              className={`${fieldClass} font-mono`}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-describedby={`${id}-cron-hint`}
              required
            />
            <p id={`${id}-cron-hint`} className="text-2xs text-muted mt-1">{t("reports.hint.cron")}</p>
          </div>
        ) : (
          <p className="text-xs text-muted" aria-live="polite">
            {describeCron(cron, t)} · <span className="font-mono">{cron}</span>
          </p>
        )}

        <div>
          <label htmlFor={`${id}-format`} className={labelClass}>
            {t("reports.field.format")}
          </label>
          <select
            id={`${id}-format`}
            className={selectClass}
            value={format}
            onChange={(e) => setFormat(e.target.value as "xlsx" | "csv")}
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-recipients`} className={labelClass}>
            {t("reports.field.recipients")}
          </label>
          <input
            id={`${id}-recipients`}
            type="email"
            multiple
            className={fieldClass}
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder="a@example.mn, b@example.mn"
            aria-describedby={`${id}-recipients-hint`}
            required
          />
          <p id={`${id}-recipients-hint`} className="text-2xs text-muted mt-1">{t("reports.hint.recipients")}</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 px-4 py-2 text-xs font-semibold text-muted hover:text-foreground"
          >
            {t("base.action.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving || !cron}
            aria-busy={saving || undefined}
            className="min-h-11 bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-4 py-2 rounded-lg"
          >
            {t("base.action.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function isNumeric(column: ReportColumn): boolean {
  return column.kind === "number" || column.kind === "money" || column.kind === "percent";
}

/** formatCell renders one value the way its column declared it. The server
 *  sends numbers as numbers and dates as ISO strings; the shaping is done here
 *  so the same Result can be a table, a chart and an export without three
 *  disagreeing ideas of what a money column looks like. */
function formatCell(value: unknown, column: ReportColumn): string {
  if (value === null || value === undefined || value === "") return "—";

  // One shape in every language (lib/datetime): `1,250,000₮`, symbol after the
  // amount — Mongolian banking's order, and the same in the table, the chart's
  // axis and its tooltip.
  switch (column.kind) {
    case "money":
      return formatMoney(Number(value));
    case "number": {
      const number = Number(value);
      return formatNumber(number, Number.isInteger(number) ? 0 : 2);
    }
    case "percent":
      return `${(Number(value) * 100).toFixed(1)}%`;
    case "month":
      return String(value).slice(0, 7);
    case "date":
      return String(value).slice(0, 10);
    default:
      return String(value);
  }
}

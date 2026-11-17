#!/bin/sh
#
# Gerege Nexus — docker-compose.prod.yml-ийн `backup` үйлчилгээний нөөцлөлт.
#
# deploy/scripts/backup.sh нь хостын cron-оос ажиллах зориулалттай боловч
# e-sdy.mn дээр `deploy` хэрэглэгч sudo эрхгүй, /etc/cron.d бичих боломжгүй,
# тиймээс тэр cron хэзээ ч суугаагүй. Энэ скрипт нь postgres-ийн өөрийн image
# дотор (pg_dump-ийн хувилбар серверийнхтэй таарна) compose-ийн сүлжээгээр
# `postgres` руу холбогдож ажиллана: CI rollout бүр `docker compose up -d`
# хийхэд үйлчилгээ өөрөө (давхардалгүй) асна — суулгах алхам гэж байхгүй.
#
# Хоёр горим:
#
#   scheduled-backup.sh loop        өдөр бүр BACKUP_AT_UTC (анхдагч 19:15 UTC =
#                                   Улаанбаатарын 03:15) цагт "daily" dump авна;
#                                   BACKUP_KEEP_DAYS (14) хоногоос хуучныг устгана.
#   scheduled-backup.sh once KIND   нэг удаа KIND (жишээ нь predeploy) dump авна;
#                                   тухайн төрлийн хамгийн сүүлийн
#                                   BACKUP_KEEP_COUNT (10)-ийг үлдээнэ. Амжилтгүй
#                                   бол 1-ээр гарна — deploy.yml migrate-ийн
#                                   өмнө үүнийг ажиллуулж, алдаа гарвал rollout-ыг
#                                   зогсооно.
#
# Тохиргоо (env):
#   PGHOST, PGUSER, PGPASSWORD, PGDATABASE  — анхдагч postgres / postgres / - / platform_db
#   BACKUP_DIR        — анхдагч /backups (хостын ${APP_DIR}/backups)
#   BACKUP_MIN_BYTES  — үүнээс жижиг dump-ийг бүтэлгүйтэл гэж үзнэ (10240)
#   TEXTFILE_DIR      — node_exporter textfile хавтас; байхгүй бол үүсгэнэ, хоосон бол
#                       хэмжүүр бичихгүй (deploy/monitoring/prometheus/rules/backups.yml)
#   BACKUP_UID / BACKUP_GID — dump ба хавтсыг энэ эзэнд шилжүүлнэ (хостын `deploy`
#                       хэрэглэгч уншиж, хуулж чадна). Хоосон бол root-д үлдэнэ.
#
# Dump бүр хувийн мэдээлэл, нууц үгийн хэш агуулна: umask 077.

set -eu
umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_KEEP_COUNT="${BACKUP_KEEP_COUNT:-10}"
BACKUP_MIN_BYTES="${BACKUP_MIN_BYTES:-10240}"
BACKUP_AT_UTC="${BACKUP_AT_UTC:-19:15}"
TEXTFILE_DIR="${TEXTFILE_DIR:-}"
BACKUP_UID="${BACKUP_UID:-}"
BACKUP_GID="${BACKUP_GID:-}"
export PGHOST="${PGHOST:-postgres}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-platform_db}"

log() { echo "backup: $*"; }

# own PATH — hands a dump or a directory to the host user who restores from
# it. The container runs as root; without this every dump is root's 0600 and
# the deploy user cannot even copy it off the host. Permissions stay owner-only.
own() {
    [ -n "${BACKUP_UID}" ] || return 0
    chown "${BACKUP_UID}:${BACKUP_GID:-${BACKUP_UID}}" "$@" 2>/dev/null \
        || log "could not hand $* to ${BACKUP_UID}:${BACKUP_GID:-${BACKUP_UID}}" >&2
}

write_metrics() {
    ok="$1" size="$2"
    [ -n "${TEXTFILE_DIR}" ] || return 0
    # Created, not assumed: a mounted directory that does not exist yet would
    # otherwise mean the metrics are never written and the alert never fires.
    mkdir -p "${TEXTFILE_DIR}" 2>/dev/null || return 0
    out="${TEXTFILE_DIR}/nexus_backup.prom"
    previous=""
    [ -f "${out}" ] && previous="$(awk '/^nexus_backup_last_success_timestamp_seconds /{print $2}' "${out}" 2>/dev/null || true)"
    tmp="${out}.tmp.$$"
    {
        echo "# TYPE nexus_backup_last_run_timestamp_seconds gauge"
        echo "nexus_backup_last_run_timestamp_seconds $(date +%s)"
        echo "# TYPE nexus_backup_last_success_timestamp_seconds gauge"
        if [ "${ok}" = "true" ]; then
            echo "nexus_backup_last_success_timestamp_seconds $(date +%s)"
            echo "# TYPE nexus_backup_last_size_bytes gauge"
            echo "nexus_backup_last_size_bytes ${size}"
        elif [ -n "${previous}" ]; then
            echo "nexus_backup_last_success_timestamp_seconds ${previous}"
        fi
        echo "# TYPE nexus_backup_last_ok gauge"
        echo "nexus_backup_last_ok $([ "${ok}" = "true" ] && echo 1 || echo 0)"
        # The copy never leaves this host: said, not hidden.
        echo "# TYPE nexus_backup_offsite_ok gauge"
        echo "nexus_backup_offsite_ok 0"
    } > "${tmp}"
    chmod 0644 "${tmp}"
    mv -f "${tmp}" "${out}"
}

# The console reads platform_backups (migration 00052). A failure to record is
# reported and does not fail the backup itself.
record() {
    ok="$1" size="$2" detail="$3" started="$4"
    psql -v ON_ERROR_STOP=1 -q -c "INSERT INTO platform_backups (kind, started_at, finished_at, size_bytes, ok, detail)
        VALUES ('backup', '${started}', NOW(), ${size}, ${ok}, \$detail\$${detail}\$detail\$)" >/dev/null 2>&1 \
        || log "could not record the run in platform_backups" >&2
}

# dump KIND — writes ${BACKUP_DIR}/KIND/nexus-KIND-<stamp>.sql.gz, atomically.
dump() {
    kind="$1"
    dir="${BACKUP_DIR}/${kind}"
    mkdir -p "${dir}"
    own "${BACKUP_DIR}" "${dir}"
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    target="${dir}/nexus-${kind}-${stamp}.sql.gz"
    part="${target}.part"
    err="${dir}/.last-error"
    # No pipefail in POSIX sh: pg_dump's own status is kept in a file.
    status_file="${dir}/.pg_dump_status.$$"
    { pg_dump --no-owner --clean --if-exists 2>"${err}"; echo $? > "${status_file}"; } | gzip -9 > "${part}"
    status="$(cat "${status_file}" 2>/dev/null || echo 1)"
    rm -f "${status_file}"
    if [ "${status}" != "0" ]; then
        detail="$(tail -c 500 "${err}" 2>/dev/null || true)"
        rm -f "${part}"
        record false NULL "${kind} pg_dump failed: ${detail}" "${started}"
        write_metrics false 0
        log "${kind}: pg_dump failed (exit ${status}): ${detail}" >&2
        return 1
    fi
    size="$(wc -c < "${part}" | tr -d ' ')"
    if [ "${size}" -lt "${BACKUP_MIN_BYTES}" ]; then
        rm -f "${part}"
        record false "${size}" "${kind} dump is only ${size} bytes" "${started}"
        write_metrics false "${size}"
        log "${kind}: dump is only ${size} bytes; refusing it" >&2
        return 1
    fi
    mv -f "${part}" "${target}"
    own "${target}"
    record true "${size}" "${target}" "${started}"
    write_metrics true "${size}"
    log "${kind}: ${target} (${size} bytes)"
}

# keep_count KIND N — the N newest dumps of KIND stay.
keep_count() {
    dir="${BACKUP_DIR}/$1"
    # Names sort by their UTC stamp, so lexical order is age order.
    ls -1 "${dir}"/nexus-"$1"-*.sql.gz 2>/dev/null | sort -r | awk -v keep="$2" 'NR > keep' | while read -r old; do
        rm -f "${old}"
    done
}

# keep_days KIND DAYS — dumps of KIND older than DAYS days are removed.
keep_days() {
    find "${BACKUP_DIR}/$1" -name "nexus-$1-*.sql.gz" -mtime "+$2" -exec rm -f {} + 2>/dev/null || true
}

# seconds_until HH:MM (UTC) — pure arithmetic, no date parsing: busybox and
# GNU date disagree on -d.
seconds_until() {
    hh="${1%%:*}" mm="${1##*:}"
    now="$(date -u +%s)"
    offset=$(( ${hh#0} * 3600 + ${mm#0} * 60 ))
    next=$(( now - now % 86400 + offset ))
    [ "${next}" -gt "${now}" ] || next=$(( next + 86400 ))
    echo $(( next - now ))
}

case "${1:-loop}" in
    once)
        kind="${2:-manual}"
        case "${kind}" in *[!a-z0-9-]*|"") log "invalid kind ${kind}" >&2; exit 2 ;; esac
        dump "${kind}"
        keep_count "${kind}" "${BACKUP_KEEP_COUNT}"
        ;;
    loop)
        log "daily backups at ${BACKUP_AT_UTC} UTC into ${BACKUP_DIR}/daily, kept ${BACKUP_KEEP_DAYS} days"
        while :; do
            wait_for="$(seconds_until "${BACKUP_AT_UTC}")"
            log "next daily backup in ${wait_for}s"
            sleep "${wait_for}"
            # A failed night is recorded and alerted on; the loop goes on to
            # the next one rather than exiting into a restart storm.
            dump daily || true
            keep_days daily "${BACKUP_KEEP_DAYS}"
            sleep 60
        done
        ;;
    *)
        log "usage: $0 loop | once KIND" >&2
        exit 2
        ;;
esac

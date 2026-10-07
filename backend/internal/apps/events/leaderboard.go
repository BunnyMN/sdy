package events

import (
	"net/http"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
)

// The branch's leaderboard: points from the ledger (attendance, confirmed
// tasks, signed votes), with the counts behind them. Only this branch —
// row-level security keeps it that way even if the query did not.

// ulaanbaatar is UTC+8 all year; Mongolia keeps no daylight saving time, and
// a fixed zone needs no tz database in the container.
var ulaanbaatar = time.FixedZone("Asia/Ulaanbaatar", 8*60*60)

type Standing struct {
	Rank     int    `json:"rank"`
	UserID   string `json:"user_id"`
	Name     string `json:"name"`
	Points   int64  `json:"points"`
	Attended int    `json:"attended"`
	Tasks    int    `json:"tasks"`
	Votes    int    `json:"votes"`
}

// window turns ?period=month|year|all (and ?month=YYYY-MM) into [from, to).
func window(r *http.Request, now time.Time) (period string, from, to *time.Time, ok bool) {
	local := now.In(ulaanbaatar)
	period = r.URL.Query().Get("period")
	switch period {
	case "", "month":
		period = "month"
		start := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, ulaanbaatar)
		if raw := r.URL.Query().Get("month"); raw != "" {
			parsed, err := time.ParseInLocation("2006-01", raw, ulaanbaatar)
			if err != nil {
				return period, nil, nil, false
			}
			start = parsed
		}
		end := start.AddDate(0, 1, 0)
		return period, &start, &end, true
	case "year":
		start := time.Date(local.Year(), 1, 1, 0, 0, 0, 0, ulaanbaatar)
		end := start.AddDate(1, 0, 0)
		return period, &start, &end, true
	case "all":
		return period, nil, nil, true
	}
	return period, nil, nil, false
}

const standingsSQL = `
WITH people AS (
    SELECT user_id FROM events_point_entries
     WHERE tenant_id = $1::uuid AND ($2::timestamptz IS NULL OR created_at >= $2) AND ($3::timestamptz IS NULL OR created_at < $3)
    UNION
    SELECT a.user_id FROM events_attendance a JOIN events_events e ON e.id = a.event_id
     WHERE a.tenant_id = $1::uuid AND a.status = 'attended'
       AND ($2::timestamptz IS NULL OR COALESCE(a.checked_at, e.starts_at) >= $2) AND ($3::timestamptz IS NULL OR COALESCE(a.checked_at, e.starts_at) < $3)
), scored AS (
    SELECT p.user_id,
        COALESCE((SELECT sum(x.delta) FROM events_point_entries x WHERE x.tenant_id = $1::uuid AND x.user_id = p.user_id
            AND ($2::timestamptz IS NULL OR x.created_at >= $2) AND ($3::timestamptz IS NULL OR x.created_at < $3)), 0)::bigint AS points,
        (SELECT count(*) FROM events_attendance a JOIN events_events e ON e.id = a.event_id
          WHERE a.tenant_id = $1::uuid AND a.user_id = p.user_id AND a.status = 'attended'
            AND ($2::timestamptz IS NULL OR COALESCE(a.checked_at, e.starts_at) >= $2) AND ($3::timestamptz IS NULL OR COALESCE(a.checked_at, e.starts_at) < $3))::int AS attended,
        (SELECT count(*) FROM events_task_assignments t WHERE t.tenant_id = $1::uuid AND t.user_id = p.user_id AND t.status = 'done'
            AND ($2::timestamptz IS NULL OR t.completed_at >= $2) AND ($3::timestamptz IS NULL OR t.completed_at < $3))::int AS tasks,
        (SELECT count(*) FROM events_motion_votes v WHERE v.tenant_id = $1::uuid AND v.user_id = p.user_id AND v.status = 'signed'
            AND ($2::timestamptz IS NULL OR v.signed_at >= $2) AND ($3::timestamptz IS NULL OR v.signed_at < $3))::int AS votes
      FROM people p
)
SELECT rank() OVER (ORDER BY s.points DESC)::int, s.user_id::text, COALESCE(u.name, ''), s.points, s.attended, s.tasks, s.votes
  FROM scored s LEFT JOIN registry.users u ON u.id = s.user_id
 ORDER BY s.points DESC, s.attended DESC, COALESCE(u.name, ''), s.user_id
 LIMIT 1000`

func (m *Module) leaderboard(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	period, from, to, valid := window(r, time.Now())
	if !valid {
		nexus.Error(w, http.StatusBadRequest, "period must be month, year or all; month as YYYY-MM")
		return
	}
	rows, err := m.db.Query(r.Context(), standingsSQL, claims.WorkspaceID, from, to)
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not rank the members")
		return
	}
	defer rows.Close()
	top := make([]Standing, 0, 50)
	var me *Standing
	for rows.Next() {
		var s Standing
		if err := rows.Scan(&s.Rank, &s.UserID, &s.Name, &s.Points, &s.Attended, &s.Tasks, &s.Votes); err != nil {
			nexus.Error(w, http.StatusInternalServerError, "could not read a standing")
			return
		}
		if s.UserID == claims.UserID {
			mine := s
			me = &mine
		}
		if len(top) < 100 {
			top = append(top, s)
		}
	}
	if rows.Err() != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not rank the members")
		return
	}
	answer := map[string]any{"period": period, "standings": top, "me": me}
	if from != nil {
		answer["from"], answer["to"] = from.Format("2006-01-02"), to.Format("2006-01-02")
	}
	nexus.JSON(w, http.StatusOK, answer)
}

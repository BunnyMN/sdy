package events

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gerege-systems/open-gerege-nexus/backend/pkg/nexus"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// Tasks: a manager lists the work an event needs, each with its points and
// how many people it takes. A manager offers a task to a member, who accepts
// or declines; a member may also volunteer for a task with a free place. When
// a manager confirms the work was done the task's points are awarded, through
// the same ledger as attendance, so the leaderboard counts both.

type Task struct {
	ID          string       `json:"id"`
	EventID     string       `json:"event_id"`
	Title       string       `json:"title"`
	Description string       `json:"description"`
	Points      int          `json:"points"`
	Slots       int          `json:"slots"`
	Taken       int          `json:"taken"`
	CreatedAt   string       `json:"created_at"`
	Assignments []Assignment `json:"assignments"`
}

type Assignment struct {
	UserID        string  `json:"user_id"`
	Name          string  `json:"name"`
	Status        string  `json:"status"`
	Volunteered   bool    `json:"volunteered"`
	PointsAwarded int     `json:"points_awarded"`
	CompletedAt   *string `json:"completed_at"`
}

type taskInput struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Points      int    `json:"points"`
	Slots       int    `json:"slots"`
}

func (in *taskInput) validate() error {
	in.Title, in.Description = strings.TrimSpace(in.Title), strings.TrimSpace(in.Description)
	if in.Slots == 0 {
		in.Slots = 1
	}
	switch {
	case in.Title == "":
		return errors.New("title is required")
	case len([]rune(in.Title)) > 160:
		return errors.New("title is too long")
	case len([]rune(in.Description)) > 2000:
		return errors.New("description is too long")
	case in.Points < 0 || in.Points > 100000:
		return errors.New("points must be between 0 and 100000")
	case in.Slots < 1 || in.Slots > 500:
		return errors.New("people needed must be between 1 and 500")
	}
	return nil
}

func taskError(w http.ResponseWriter, err error) {
	var conflict conflictError
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		nexus.Error(w, http.StatusNotFound, "no such task")
	case errors.Is(err, errForbidden):
		nexus.Error(w, http.StatusForbidden, "forbidden")
	case errors.As(err, &conflict):
		nexus.Error(w, http.StatusConflict, conflict.Error())
	default:
		nexus.Error(w, http.StatusInternalServerError, "could not change the task")
	}
}

func (m *Module) tasks(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	eventID := chi.URLParam(r, "id")
	if _, err := m.loadEvent(ctx, claims.WorkspaceID, claims.UserID, eventID); err != nil {
		eventError(w, err)
		return
	}
	list, err := m.listTasks(ctx, claims.WorkspaceID, eventID, "")
	if err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not list the tasks")
		return
	}
	nexus.JSON(w, http.StatusOK, map[string]any{"tasks": list, "can_manage": m.canManage(ctx, claims), "me": claims.UserID})
}

func (m *Module) listTasks(ctx context.Context, tenantID, eventID, taskID string) ([]Task, error) {
	rows, err := m.db.Query(ctx, `SELECT t.id::text, t.event_id::text, t.title, t.description, t.points, t.slots, t.created_at,
		(SELECT count(*) FROM events_task_assignments a WHERE a.task_id = t.id AND a.status IN ('accepted','done'))::int
		FROM events_tasks t WHERE t.tenant_id = $1::uuid AND t.event_id = $2::uuid AND ($3 = '' OR t.id::text = $3)
		ORDER BY t.created_at, t.id`, tenantID, eventID, taskID)
	if err != nil {
		return nil, err
	}
	list := make([]Task, 0, 8)
	index := map[string]int{}
	for rows.Next() {
		var t Task
		var created time.Time
		if err := rows.Scan(&t.ID, &t.EventID, &t.Title, &t.Description, &t.Points, &t.Slots, &created, &t.Taken); err != nil {
			rows.Close()
			return nil, err
		}
		t.CreatedAt, t.Assignments = stamp(created), []Assignment{}
		index[t.ID] = len(list)
		list = append(list, t)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows, err = m.db.Query(ctx, `SELECT a.task_id::text, a.user_id::text, COALESCE(u.name,''), a.status, a.assigned_by IS NULL,
		a.points_awarded, a.completed_at
		FROM events_task_assignments a LEFT JOIN registry.users u ON u.id = a.user_id
		WHERE a.tenant_id = $1::uuid AND a.event_id = $2::uuid ORDER BY a.created_at, a.id`, tenantID, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var taskID string
		var a Assignment
		var completed *time.Time
		if err := rows.Scan(&taskID, &a.UserID, &a.Name, &a.Status, &a.Volunteered, &a.PointsAwarded, &completed); err != nil {
			return nil, err
		}
		a.CompletedAt = stampPtr(completed)
		if i, ok := index[taskID]; ok {
			list[i].Assignments = append(list[i].Assignments, a)
		}
	}
	return list, rows.Err()
}

func (m *Module) answerTask(w http.ResponseWriter, r *http.Request, claims nexus.UserClaims, eventID, taskID string, status int) {
	list, err := m.listTasks(r.Context(), claims.WorkspaceID, eventID, taskID)
	if err != nil || len(list) == 0 {
		nexus.Error(w, http.StatusInternalServerError, "could not read the task back")
		return
	}
	nexus.JSON(w, status, list[0])
}

func (m *Module) createTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in taskInput
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	if err := in.validate(); err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	eventID := chi.URLParam(r, "id")
	event, err := m.loadEvent(ctx, claims.WorkspaceID, claims.UserID, eventID)
	if err != nil {
		eventError(w, err)
		return
	}
	if event.Status == "cancelled" {
		nexus.Error(w, http.StatusConflict, "this event is cancelled")
		return
	}
	var id string
	if err := m.db.QueryRow(ctx, `INSERT INTO events_tasks (tenant_id, event_id, title, description, points, slots, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
		claims.WorkspaceID, eventID, in.Title, in.Description, in.Points, in.Slots, claims.UserID).Scan(&id); err != nil {
		nexus.Error(w, http.StatusInternalServerError, "could not create the task")
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, "events.task.create", id, map[string]any{"event_id": eventID, "points": in.Points})
	m.answerTask(w, r, claims, eventID, id, http.StatusCreated)
}

// withTask runs a change on a locked task. Locking the task serialises
// everything that counts its places or moves its points.
func (m *Module) withTask(w http.ResponseWriter, r *http.Request, claims nexus.UserClaims, action string,
	change func(ctx context.Context, tx pgx.Tx, task Task) error) {
	ctx := r.Context()
	eventID, taskID := chi.URLParam(r, "id"), chi.URLParam(r, "taskID")
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		taskError(w, err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var task Task
	if err := tx.QueryRow(ctx, `SELECT id::text, event_id::text, title, points, slots FROM events_tasks
		WHERE tenant_id = $1::uuid AND event_id = $2::uuid AND id = $3::uuid FOR UPDATE`,
		claims.WorkspaceID, eventID, taskID).Scan(&task.ID, &task.EventID, &task.Title, &task.Points, &task.Slots); err != nil {
		taskError(w, err)
		return
	}
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM events_task_assignments WHERE task_id = $1 AND status IN ('accepted','done')`,
		task.ID).Scan(&task.Taken); err != nil {
		taskError(w, err)
		return
	}
	if err := change(ctx, tx, task); err != nil {
		taskError(w, err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		taskError(w, err)
		return
	}
	nexus.Audit(ctx, claims.WorkspaceID, claims.UserID, action, taskID, map[string]any{"event_id": eventID})
	if action == "events.task.delete" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	m.answerTask(w, r, claims, eventID, taskID, http.StatusOK)
}

func (m *Module) updateTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in taskInput
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	if err := in.validate(); err != nil {
		nexus.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	m.withTask(w, r, claims, "events.task.update", func(ctx context.Context, tx pgx.Tx, task Task) error {
		if in.Slots < task.Taken {
			return errConflict("fewer places than people already doing it")
		}
		if in.Points != task.Points {
			var done bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM events_task_assignments WHERE task_id=$1 AND status='done')`, task.ID).Scan(&done); err != nil {
				return err
			}
			if done {
				return errConflict("points cannot change after the work has been confirmed")
			}
		}
		_, err := tx.Exec(ctx, `UPDATE events_tasks SET title=$2, description=$3, points=$4, slots=$5, updated_at=now() WHERE id=$1`,
			task.ID, in.Title, in.Description, in.Points, in.Slots)
		return err
	})
}

func (m *Module) deleteTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	m.withTask(w, r, claims, "events.task.delete", func(ctx context.Context, tx pgx.Tx, task Task) error {
		var done bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM events_task_assignments WHERE task_id=$1 AND status='done')`, task.ID).Scan(&done); err != nil {
			return err
		}
		if done {
			return errConflict("a task whose work has been confirmed cannot be deleted")
		}
		_, err := tx.Exec(ctx, `DELETE FROM events_tasks WHERE id=$1`, task.ID)
		return err
	})
}

// assignTask offers the task to a member, who then accepts or declines.
func (m *Module) assignTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		UserID string `json:"user_id"`
	}
	if err := decode(r, &in); err != nil || strings.TrimSpace(in.UserID) == "" {
		nexus.Error(w, http.StatusBadRequest, "user_id is required")
		return
	}
	if !m.isActiveMember(r.Context(), claims.WorkspaceID, in.UserID) {
		nexus.Error(w, http.StatusBadRequest, "that person is not a member of this branch")
		return
	}
	m.withTask(w, r, claims, "events.task.assign", func(ctx context.Context, tx pgx.Tx, task Task) error {
		tag, err := tx.Exec(ctx, `INSERT INTO events_task_assignments (tenant_id, task_id, event_id, user_id, status, assigned_by)
			VALUES ($1, $2, $3, $4, 'offered', $5)
			ON CONFLICT (task_id, user_id) DO UPDATE SET status='offered', assigned_by=EXCLUDED.assigned_by, responded_at=NULL, updated_at=now()
			WHERE events_task_assignments.status = 'declined'`,
			claims.WorkspaceID, task.ID, task.EventID, in.UserID, claims.UserID)
		if err == nil && tag.RowsAffected() == 0 {
			return errConflict("this member already has this task")
		}
		return err
	})
}

// volunteer is a member taking a task with a free place.
func (m *Module) volunteer(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	if !m.isActiveMember(r.Context(), claims.WorkspaceID, claims.UserID) {
		nexus.Error(w, http.StatusForbidden, "only members of this branch may take a task")
		return
	}
	m.withTask(w, r, claims, "events.task.volunteer", func(ctx context.Context, tx pgx.Tx, task Task) error {
		if task.Taken >= task.Slots {
			return errConflict("every place on this task is taken")
		}
		tag, err := tx.Exec(ctx, `INSERT INTO events_task_assignments (tenant_id, task_id, event_id, user_id, status, responded_at)
			VALUES ($1, $2, $3, $4, 'accepted', now())
			ON CONFLICT (task_id, user_id) DO UPDATE SET status='accepted', responded_at=now(), updated_at=now()
			WHERE events_task_assignments.status IN ('declined','offered')`,
			claims.WorkspaceID, task.ID, task.EventID, claims.UserID)
		if err == nil && tag.RowsAffected() == 0 {
			return errConflict("you already have this task")
		}
		return err
	})
}

// respondTask is the member's answer to an offer, or stepping back from a
// task they had taken and that is not yet confirmed.
func (m *Module) respondTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	var in struct {
		Accept bool `json:"accept"`
	}
	if err := decode(r, &in); err != nil {
		nexus.Error(w, http.StatusBadRequest, "the request could not be read")
		return
	}
	m.withTask(w, r, claims, "events.task.respond", func(ctx context.Context, tx pgx.Tx, task Task) error {
		var status string
		if err := tx.QueryRow(ctx, `SELECT status FROM events_task_assignments WHERE task_id=$1 AND user_id=$2 FOR UPDATE`,
			task.ID, claims.UserID).Scan(&status); err != nil {
			return err
		}
		next := "declined"
		switch {
		case in.Accept && status == "offered":
			if task.Taken >= task.Slots {
				return errConflict("every place on this task is taken")
			}
			next = "accepted"
		case !in.Accept && (status == "offered" || status == "accepted"):
		default:
			return errConflict("there is nothing to answer on this task")
		}
		_, err := tx.Exec(ctx, `UPDATE events_task_assignments SET status=$3, responded_at=now(), updated_at=now()
			WHERE task_id=$1 AND user_id=$2`, task.ID, claims.UserID, next)
		return err
	})
}

// completeTask confirms the work and awards the task's points once; undoTask
// takes them back. Both move the ledger and the assignment together.
func (m *Module) completeTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	member := chi.URLParam(r, "userID")
	m.withTask(w, r, claims, "events.task.done", func(ctx context.Context, tx pgx.Tx, task Task) error {
		tag, err := tx.Exec(ctx, `UPDATE events_task_assignments SET status='done', points_awarded=$3, completed_at=now(), completed_by=$4, updated_at=now()
			WHERE task_id=$1 AND user_id=$2 AND status='accepted'`, task.ID, member, task.Points, claims.UserID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return errConflict("only a task the member has accepted can be confirmed")
		}
		if task.Points == 0 {
			return nil
		}
		_, err = tx.Exec(ctx, `INSERT INTO events_point_entries (tenant_id,event_id,user_id,delta,reason,actor_id)
			VALUES ($1,$2,$3,$4,'task.done',$5)`, claims.WorkspaceID, task.EventID, member, task.Points, claims.UserID)
		return err
	})
}

func (m *Module) undoTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	member := chi.URLParam(r, "userID")
	m.withTask(w, r, claims, "events.task.undo", func(ctx context.Context, tx pgx.Tx, task Task) error {
		var awarded int
		if err := tx.QueryRow(ctx, `SELECT points_awarded FROM events_task_assignments WHERE task_id=$1 AND user_id=$2 AND status='done' FOR UPDATE`,
			task.ID, member).Scan(&awarded); errors.Is(err, pgx.ErrNoRows) {
			return errConflict("this work has not been confirmed")
		} else if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE events_task_assignments SET status='accepted', points_awarded=0, completed_at=NULL, completed_by=NULL, updated_at=now()
			WHERE task_id=$1 AND user_id=$2`, task.ID, member); err != nil {
			return err
		}
		if awarded == 0 {
			return nil
		}
		_, err := tx.Exec(ctx, `INSERT INTO events_point_entries (tenant_id,event_id,user_id,delta,reason,actor_id)
			VALUES ($1,$2,$3,$4,'task.undo',$5)`, claims.WorkspaceID, task.EventID, member, -awarded, claims.UserID)
		return err
	})
}

func (m *Module) removeAssignment(w http.ResponseWriter, r *http.Request) {
	claims, ok := who(w, r)
	if !ok {
		return
	}
	member := chi.URLParam(r, "userID")
	m.withTask(w, r, claims, "events.task.unassign", func(ctx context.Context, tx pgx.Tx, task Task) error {
		tag, err := tx.Exec(ctx, `DELETE FROM events_task_assignments WHERE task_id=$1 AND user_id=$2 AND status <> 'done'`, task.ID, member)
		if err == nil && tag.RowsAffected() == 0 {
			return errConflict("confirmed work is undone before it is removed")
		}
		return err
	})
}

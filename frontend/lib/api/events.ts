/**
 * The events app's API (mn.sdy.events). Thin: every call is one route of
 * backend/internal/apps/events, and the shapes are that file's.
 */
import { request } from "./client";

export type EventStatus = "planned" | "done" | "cancelled";
export type AttendanceStatus = "registered" | "attended" | "absent";

export type EventRecord = {
  id: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  status: EventStatus;
  created_by: string;
  created_at: string;
  registered: number;
  attended: number;
  my_status: AttendanceStatus | "";
  points_value?: number;
  /** Points each signed vote in this event's discussion earns. */
  vote_points?: number;
};

export type EventInput = {
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  status: EventStatus;
  points_value?: number;
  vote_points?: number;
};

export type Participant = {
  user_id: string;
  name: string;
  email: string;
  status: AttendanceStatus;
  note: string;
  registered_at: string;
  checked_at: string | null;
};

export type MotionStatus = "proposed" | "voting" | "decided" | "withdrawn";
export type VoteChoice = "yes" | "no" | "abstain";
export type Motion = {
  id: string; event_id: string; title: string; body: string;
  proposer_id: string; proposer_name: string; status: MotionStatus; content_hash: string;
  opened_at: string | null; closed_at: string | null; result: "" | "approved" | "rejected";
  yes: number; no: number; abstain: number; note: string; created_at: string;
  my_vote: { choice: VoteChoice; status: "signing" | "signed" | "failed" } | null;
};
export type MotionList = {
  motions: Motion[]; eligible: number; can_vote: boolean; signing_ready: boolean;
  vote_points: number; can_manage: boolean; event_status: EventStatus; me: string;
};
export type SignedVote = { user_id: string; name: string; choice: VoteChoice; signed_at: string; digest: string };
export type AssignmentStatus = "offered" | "accepted" | "declined" | "done";
export type Task = {
  id: string; event_id: string; title: string; description: string; points: number; slots: number; taken: number; created_at: string;
  assignments: { user_id: string; name: string; status: AssignmentStatus; volunteered: boolean; points_awarded: number; completed_at: string | null }[];
};
export type TaskInput = { title: string; description: string; points: number; slots: number };
export type Standing = { rank: number; user_id: string; name: string; points: number; attended: number; tasks: number; votes: number };
export type LeaderboardPeriod = "month" | "year" | "all";

const one = (id: string) => `/events/${encodeURIComponent(id)}`;
const post = (body?: unknown) => ({ method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** Discussion, signed votes, tasks and the leaderboard (events 1.3.0). */
export const participationApi = {
  motions: (eventID: string) => request<MotionList>(`${one(eventID)}/motions`),
  propose: (eventID: string, input: { title: string; body: string }) => request<Motion>(`${one(eventID)}/motions`, post(input)),
  editMotion: (eventID: string, motionID: string, input: { title: string; body: string }) =>
    request<Motion>(`${one(eventID)}/motions/${encodeURIComponent(motionID)}`, { method: "PUT", body: JSON.stringify(input) }),
  motionAction: (eventID: string, motionID: string, action: "open" | "close" | "withdraw", note?: string) =>
    request<Motion>(`${one(eventID)}/motions/${encodeURIComponent(motionID)}/${action}`, post(note === undefined ? undefined : { note })),
  /** callbackUrl, from a phone: the answer's app_link opens the eID app, which returns there. */
  vote: (eventID: string, motionID: string, choice: VoteChoice, callbackUrl = "") =>
    request<{ session_id: string; verification_code: string; app_link?: string; state: string }>(`${one(eventID)}/motions/${encodeURIComponent(motionID)}/vote`, post({ choice, callback_url: callbackUrl })),
  /** An empty sessionID asks about the caller's own vote on the motion, whatever its session. */
  pollVote: (eventID: string, motionID: string, sessionID = "") =>
    request<{ state: "signing" | "signed" | "failed"; reason?: string; points?: number }>(`${one(eventID)}/motions/${encodeURIComponent(motionID)}/vote/poll`, post({ session_id: sessionID })),
  votes: (eventID: string, motionID: string) => request<{ votes: SignedVote[] }>(`${one(eventID)}/motions/${encodeURIComponent(motionID)}/votes`),

  tasks: (eventID: string) => request<{ tasks: Task[]; can_manage: boolean; me: string }>(`${one(eventID)}/tasks`),
  createTask: (eventID: string, input: TaskInput) => request<Task>(`${one(eventID)}/tasks`, post(input)),
  updateTask: (eventID: string, taskID: string, input: TaskInput) =>
    request<Task>(`${one(eventID)}/tasks/${encodeURIComponent(taskID)}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteTask: (eventID: string, taskID: string) => request<void>(`${one(eventID)}/tasks/${encodeURIComponent(taskID)}`, { method: "DELETE" }),
  assign: (eventID: string, taskID: string, userID: string) => request<Task>(`${one(eventID)}/tasks/${encodeURIComponent(taskID)}/assign`, post({ user_id: userID })),
  volunteer: (eventID: string, taskID: string) => request<Task>(`${one(eventID)}/tasks/${encodeURIComponent(taskID)}/volunteer`, post()),
  respond: (eventID: string, taskID: string, accept: boolean) => request<Task>(`${one(eventID)}/tasks/${encodeURIComponent(taskID)}/respond`, post({ accept })),
  assignment: (eventID: string, taskID: string, userID: string, action: "done" | "undo") =>
    request<Task>(`${one(eventID)}/tasks/${encodeURIComponent(taskID)}/assignments/${encodeURIComponent(userID)}/${action}`, post()),
  unassign: (eventID: string, taskID: string, userID: string) =>
    request<Task>(`${one(eventID)}/tasks/${encodeURIComponent(taskID)}/assignments/${encodeURIComponent(userID)}`, { method: "DELETE" }),

  leaderboard: (period: LeaderboardPeriod) =>
    request<{ period: LeaderboardPeriod; standings: Standing[]; me: Standing | null; from?: string; to?: string }>(`/events/leaderboard?period=${period}`),
};

export const eventsApi = {
  issueCheckin: (id: string) => request<{ event_id: string; token: string; expires_at: string }>(`/events/${encodeURIComponent(id)}/check-in-code`, { method: "POST" }),
  checkIn: (id: string, token: string) => request<{ status: string; changed: boolean; points?: number }>(`/events/${encodeURIComponent(id)}/check-in`, { method: "POST", body: JSON.stringify({ token }) }),
  mine: (offset = 0) => request<{ items: Array<{ event_id: string; title: string; starts_at: string; status: AttendanceStatus; points: number }>; has_more: boolean; next_offset: number }>(`/events/mine?offset=${offset}`),
  points: (offset = 0) => request<{ total: number; entries: Array<{ id: string; event_id: string; title: string; delta: number; reason: string; created_at: string }>; has_more: boolean; next_offset: number }>(`/events/points?offset=${offset}`),
  summary: (period = "") => request<{ events: number; registrations: number; attended: number; active_members: number; points: number }>(`/events/summary?period=${encodeURIComponent(period)}`),
  list: (status?: EventStatus) =>
    request<{ events: EventRecord[] }>(`/events${status ? `?status=${status}` : ""}`),
  get: (id: string) => request<EventRecord>(`/events/${encodeURIComponent(id)}`),
  create: (input: EventInput) =>
    request<EventRecord>("/events", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: EventInput) =>
    request<EventRecord>(`/events/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  register: (id: string) =>
    request<{ status: string; changed: boolean }>(`/events/${encodeURIComponent(id)}/register`, { method: "POST" }),
  withdraw: (id: string) =>
    request<{ status: string; changed: boolean }>(`/events/${encodeURIComponent(id)}/register`, { method: "DELETE" }),
  participants: (id: string) =>
    request<{ participants: Participant[] }>(`/events/${encodeURIComponent(id)}/attendance`),
  addParticipant: (id: string, userID: string, status: AttendanceStatus = "registered") =>
    request<{ status: string }>(`/events/${encodeURIComponent(id)}/attendance`, {
      method: "POST", body: JSON.stringify({ user_id: userID, status }),
    }),
  mark: (id: string, userID: string, status: AttendanceStatus, note = "") =>
    request<{ status: string }>(`/events/${encodeURIComponent(id)}/attendance/${encodeURIComponent(userID)}`, {
      method: "PUT", body: JSON.stringify({ status, note }),
    }),
  members: () => request<{ members: { user_id: string; name: string; email: string }[] }>("/events/members"),
};

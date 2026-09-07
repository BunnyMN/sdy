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
};

export type EventInput = {
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  status: EventStatus;
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

export const eventsApi = {
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

import { request } from "./client";

export type MemberStatus = "none" | "active" | "suspended" | "expired" | "left" | "alumni";
export interface MemberProfile { phone: string; residence: string; notifications_enabled: boolean }
export interface Affiliation { tenant_id: string; name: string; slug: string; is_primary: boolean; status: MemberStatus; member_since: string | null; has_access: boolean }
export interface MemberHistory { id: string; tenant_id: string; branch: string; from_status: MemberStatus; status: MemberStatus; reason: string; created_at: string }
export interface MemberRecord { memberships: Affiliation[]; profile: MemberProfile; history: MemberHistory[]; has_more: boolean; next_offset: number }
export interface ManagedMember { user_id: string; name: string; email: string; is_primary: boolean; status: MemberStatus; member_since: string | null; has_access: boolean; roles: string[] }
export interface MemberNotification { id: string; kind: string; title: string; body: string; path: string; created_at: string; read_at: string | null }
export interface MemberSummary { active_members: number; suspended_members: number; expired_members: number; former_members: number; access_without_membership: number; pending_applications: number; pending_transfers: number | null }
export interface PersonalDuesHistory { charges: { id: string; tenant_id: string; branch: string; period: string; amount: number; paid: number; balance: number; waived: boolean }[]; payments: { id: string; branch: string; amount: number; status: string; reference: string; review_note: string; created_at: string }[]; has_more: boolean; next_offset: number }
export interface PersonalParticipationHistory { items: { id: string; branch: string; title: string; starts_at: string; status: string; points: number }[]; entries: { id: string; branch: string; title: string; delta: number; reason: string; created_at: string }[]; total_points: number; has_more: boolean; next_offset: number }
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const memberApi = {
  record: (offset = 0) => request<MemberRecord>(`/me/member-record?offset=${offset}`),
  duesHistory: (offset = 0) => request<PersonalDuesHistory>(`/me/dues-history?offset=${offset}`),
  participationHistory: (offset = 0) => request<PersonalParticipationHistory>(`/me/participation-history?offset=${offset}`),
  save: (profile: MemberProfile) => request<MemberProfile>("/me/member-record", { method: "PUT", body: JSON.stringify(profile) }),
  members: (query = "", offset = 0) => request<{ members: ManagedMember[]; has_more: boolean; next_offset: number }>(`/membership/members?q=${encodeURIComponent(query)}&offset=${offset}`),
  status: (userID: string, status: MemberStatus, reason: string) => request(`/membership/members/${encodeURIComponent(userID)}/status`, post({ status, reason })),
  summary: () => request<MemberSummary>("/membership/summary"),
  notifications: (offset = 0) => request<{ items: MemberNotification[]; unread: number; has_more: boolean; next_offset: number }>(`/me/notifications?offset=${offset}`),
  read: (id: string) => request(`/me/notifications/${encodeURIComponent(id)}/read`, post({})),
  readAll: () => request("/me/notifications/read-all", post({})),
};

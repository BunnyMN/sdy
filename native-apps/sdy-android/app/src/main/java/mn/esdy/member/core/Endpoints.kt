package mn.esdy.member.core

import java.net.URLEncoder
import mn.esdy.member.models.*

// One function per backend route the member app uses (iOS: Endpoints.swift,
// Endpoints+Management.swift).

/** A path segment or query value, percent-encoded. */
fun enc(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")

// region Auth
suspend fun APIClient.me(): Me = get("/auth/me")
suspend fun APIClient.profile(): Profile = get("/profile")
suspend fun APIClient.login(email: String, password: String): LoginResponse =
    send(HTTPMethod.POST, "/auth/login", mapOf("email" to email, "password" to password), signsOutOn401 = false)
suspend fun APIClient.eidStartByID(nationalID: String): EIDStart =
    send(HTTPMethod.POST, "/auth/eid/start-id", mapOf("national_id" to nationalID, "callbackUrl" to AppConfig.eidCallbackURL()), signsOutOn401 = false)
suspend fun APIClient.eidStartSamePhone(): EIDStart =
    send(HTTPMethod.POST, "/auth/eid/start", mapOf("callbackUrl" to AppConfig.eidCallbackURL()), signsOutOn401 = false)
/**
 * The server holds this open for up to 25 s.
 * `binding` proves this app started the session (the server's answer to start).
 */
suspend fun APIClient.eidPoll(sessionID: String, binding: String? = null): EIDPoll {
    val body = mutableMapOf<String, Any?>("session_id" to sessionID)
    if (!binding.isNullOrEmpty()) body["binding"] = binding
    return send(HTTPMethod.POST, "/auth/eid/poll", body, timeoutSeconds = 35, signsOutOn401 = false)
}
suspend fun APIClient.logout() { try { raw(HTTPMethod.POST, "/auth/logout", signsOutOn401 = false) } catch (_: Exception) {} }
suspend fun APIClient.tenants(): TenantsResponse = get("/auth/tenants")
suspend fun APIClient.switchTenant(id: String): SwitchTenantResponse =
    send(HTTPMethod.POST, "/auth/switch-tenant", mapOf("tenant_id" to id))
// endregion

// region Membership
suspend fun APIClient.branches(): BranchesResponse = get("/me/branches")
suspend fun APIClient.memberRecord(offset: Int = 0): MemberRecord = get("/me/member-record?offset=$offset", cached = offset == 0)
suspend fun APIClient.saveMemberProfile(profile: MemberProfile): MemberProfile = send(HTTPMethod.PUT, "/me/member-record", profile.body)
suspend fun APIClient.askToJoin(slug: String, message: String): JoinResponse =
    send(HTTPMethod.POST, "/me/branch-requests", mapOf("slug" to slug, "message" to message))
suspend fun APIClient.myItems(): MyItemsResponse = get("/me/items")
suspend fun APIClient.transfers(): TransfersResponse = get("/me/transfers")
suspend fun APIClient.requestTransfer(from: String, slug: String, message: String) =
    perform(HTTPMethod.POST, "/me/transfers", mapOf("from_tenant_id" to from, "slug" to slug, "message" to message))
suspend fun APIClient.cancelTransfer(id: String) = perform(HTTPMethod.POST, "/me/transfers/${enc(id)}/cancel")
suspend fun APIClient.notifications(offset: Int = 0): NotificationsPage = get("/me/notifications?offset=$offset", cached = offset == 0)
suspend fun APIClient.markRead(id: String) = perform(HTTPMethod.POST, "/me/notifications/${enc(id)}/read")
suspend fun APIClient.markAllRead() = perform(HTTPMethod.POST, "/me/notifications/read-all")
suspend fun APIClient.participationHistory(offset: Int = 0): PersonalParticipationHistory =
    get("/me/participation-history?offset=$offset", cached = offset == 0)
suspend fun APIClient.duesHistory(offset: Int = 0): PersonalDuesHistory = get("/me/dues-history?offset=$offset", cached = offset == 0)
/** The signed-in person's profile photo (JPEG), or null when they have none. */
suspend fun APIClient.profilePhoto(): ByteArray? = try {
    raw(HTTPMethod.GET, "/profile/photo")
} catch (e: APIError) {
    if (e.status == 404) null else throw e
}
suspend fun APIClient.uploadProfilePhoto(jpeg: ByteArray) {
    raw(HTTPMethod.PUT, "/profile/photo", upload = jpeg to "image/jpeg", timeoutSeconds = 60)
}
suspend fun APIClient.deleteProfilePhoto() { raw(HTTPMethod.DELETE, "/profile/photo") }
suspend fun APIClient.deletionStatus(): DeletionStatus = get("/profile/deletion-request", cached = false)
suspend fun APIClient.requestDeletion(reason: String) =
    perform(HTTPMethod.POST, "/profile/deletion-request", if (reason.isEmpty()) emptyMap() else mapOf("reason" to reason))
// endregion

// region Events
suspend fun APIClient.events(): EventsResponse = get("/events")
suspend fun APIClient.event(id: String): EventRecord = get("/events/${enc(id)}")
suspend fun APIClient.register(id: String): ActionResult = send(HTTPMethod.POST, "/events/${enc(id)}/register")
suspend fun APIClient.withdraw(id: String): ActionResult = send(HTTPMethod.DELETE, "/events/${enc(id)}/register")
suspend fun APIClient.participants(id: String): ParticipantsResponse = get("/events/${enc(id)}/attendance")
suspend fun APIClient.checkIn(id: String, token: String): ActionResult =
    send(HTTPMethod.POST, "/events/${enc(id)}/check-in", mapOf("token" to token))
suspend fun APIClient.myEvents(offset: Int = 0): MyEventsPage = get("/events/mine?offset=$offset", cached = offset == 0)
suspend fun APIClient.points(offset: Int = 0): PointsPage = get("/events/points?offset=$offset", cached = offset == 0)
suspend fun APIClient.leaderboard(period: String): Leaderboard = get("/events/leaderboard?period=$period")
suspend fun APIClient.motions(eventID: String): MotionList = get("/events/${enc(eventID)}/motions")
suspend fun APIClient.propose(eventID: String, title: String, body: String) =
    perform(HTTPMethod.POST, "/events/${enc(eventID)}/motions", mapOf("title" to title, "body" to body))
suspend fun APIClient.reportMotion(eventID: String, motion: String, reason: String) =
    perform(HTTPMethod.POST, "/events/${enc(eventID)}/motions/${enc(motion)}/report", mapOf("reason" to reason))
suspend fun APIClient.blockedMembers(): BlockedList = get("/events/blocks", cached = false)
suspend fun APIClient.block(userID: String) = perform(HTTPMethod.POST, "/events/blocks/${enc(userID)}")
suspend fun APIClient.unblock(userID: String) = perform(HTTPMethod.DELETE, "/events/blocks/${enc(userID)}")
suspend fun APIClient.vote(eventID: String, motion: String, choice: String): VoteStart {
    val back = "/module/events/$eventID"
    return send(HTTPMethod.POST, "/events/${enc(eventID)}/motions/${enc(motion)}/vote",
        mapOf("choice" to choice, "callback_url" to AppConfig.eidCallbackURL(returnPath = back)))
}
/** An empty session asks about the caller's own vote on the motion. */
suspend fun APIClient.pollVote(eventID: String, motion: String, sessionID: String): VotePoll =
    send(HTTPMethod.POST, "/events/${enc(eventID)}/motions/${enc(motion)}/vote/poll", mapOf("session_id" to sessionID))
suspend fun APIClient.tasks(eventID: String): TasksResponse = get("/events/${enc(eventID)}/tasks")
suspend fun APIClient.volunteer(eventID: String, task: String) = perform(HTTPMethod.POST, "/events/${enc(eventID)}/tasks/${enc(task)}/volunteer")
suspend fun APIClient.respond(eventID: String, task: String, accept: Boolean) =
    perform(HTTPMethod.POST, "/events/${enc(eventID)}/tasks/${enc(task)}/respond", mapOf("accept" to accept))
// endregion

// region Dues
suspend fun APIClient.duesSettings(): DuesSettings = get("/dues/settings")
suspend fun APIClient.myDues(offset: Int = 0): MyDuesPage = get("/dues/mine?offset=$offset", cached = offset == 0)
suspend fun APIClient.reportPayment(chargeID: String, requestKey: String, amount: Double, reference: String): ReportResult =
    send(HTTPMethod.POST, "/dues/payments", mapOf(
        "charge_id" to chargeID, "request_key" to requestKey, "amount" to Formatters.roundHalfAway(amount).toLong(), "reference" to reference,
    ))
// endregion

// region Officers (positions, events, finance, the control committee) — never cached:
// an officer acts on what the server holds now.

// Push: registered once Firebase Cloud Messaging is set up (see README «Push»).
suspend fun APIClient.registerPushToken(token: String, appID: String) =
    perform(HTTPMethod.POST, "/push-tokens", mapOf("token" to token, "provider" to "FCM", "app_id" to appID))
suspend fun APIClient.unregisterPushToken(token: String) = perform(HTTPMethod.DELETE, "/push-tokens", mapOf("token" to token))

suspend fun APIClient.managedMembers(query: String = "", offset: Int = 0): ManagedMembers =
    get("/membership/members?q=${enc(query)}&offset=$offset", cached = false)
suspend fun APIClient.positionPolicy(): PositionPolicy = get("/membership/positions", cached = false)
suspend fun APIClient.setPosition(userID: String, position: String) =
    perform(HTTPMethod.POST, "/membership/members/${enc(userID)}/position", mapOf("position" to position))

suspend fun APIClient.createEvent(draft: EventDraft): EventRecord = send(HTTPMethod.POST, "/events", draft.body)
suspend fun APIClient.updateEvent(id: String, draft: EventDraft): EventRecord = send(HTTPMethod.PUT, "/events/${enc(id)}", draft.body)
suspend fun APIClient.markAttendance(eventID: String, userID: String, status: String, note: String = "") =
    perform(HTTPMethod.PUT, "/events/${enc(eventID)}/attendance/${enc(userID)}", mapOf("status" to status, "note" to note))
suspend fun APIClient.addParticipant(eventID: String, userID: String, status: String = "registered") =
    perform(HTTPMethod.POST, "/events/${enc(eventID)}/attendance", mapOf("user_id" to userID, "status" to status))
suspend fun APIClient.issueCheckin(eventID: String): IssuedCheckin = send(HTTPMethod.POST, "/events/${enc(eventID)}/check-in-code")
suspend fun APIClient.branchPeople(): BranchPeople = get("/events/members", cached = false)

suspend fun APIClient.sanctions(offset: Int = 0): SanctionList = get("/events/sanctions?offset=$offset", cached = false)
suspend fun APIClient.mySanctions(): SanctionList = get("/events/sanctions/mine", cached = false)
suspend fun APIClient.sanction(userID: String, points: Int, reason: String): Sanction =
    send(HTTPMethod.POST, "/events/sanctions", mapOf("user_id" to userID, "points" to points, "reason" to reason))

suspend fun APIClient.financeOverview(period: String = "", offset: Int = 0): FinanceOverview =
    get("/dues/finance?period=${enc(period)}&offset=$offset", cached = false)
suspend fun APIClient.reviewPayment(id: String, action: String, reason: String) =
    perform(HTTPMethod.POST, "/dues/payments/${enc(id)}/review", mapOf("action" to action, "reason" to reason))
suspend fun APIClient.waiveCharge(id: String, reason: String) =
    perform(HTTPMethod.POST, "/dues/charges/${enc(id)}/waive", mapOf("reason" to reason))
suspend fun APIClient.createCharges(period: String) = perform(HTTPMethod.POST, "/dues/charges", mapOf("period" to period))
// endregion

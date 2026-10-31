import Foundation

/// One function per backend route the member app uses.
extension APIClient {
    private func enc(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?#"))) ?? s }

    // MARK: Auth
    func me() async throws -> Me { try await get("/auth/me") }
    func profile() async throws -> Profile { try await get("/profile") }
    func login(email: String, password: String) async throws -> LoginResponse {
        try await send(.post, "/auth/login", body: ["email": email, "password": password], signsOutOn401: false)
    }
    func eidStartByID(nationalID: String) async throws -> EIDStart {
        try await send(.post, "/auth/eid/start-id", body: ["national_id": nationalID, "callbackUrl": AppConfig.eidCallbackURL()], signsOutOn401: false)
    }
    func eidStartSamePhone() async throws -> EIDStart {
        try await send(.post, "/auth/eid/start", body: ["callbackUrl": AppConfig.eidCallbackURL()], signsOutOn401: false)
    }
    /// The server holds this open for up to 25 s.
    func eidPoll(sessionID: String) async throws -> EIDPoll {
        try await send(.post, "/auth/eid/poll", body: ["session_id": sessionID], timeout: 35, signsOutOn401: false)
    }
    func logout() async { _ = try? await raw(.post, "/auth/logout", signsOutOn401: false) }
    func tenants() async throws -> TenantsResponse { try await get("/auth/tenants") }
    func switchTenant(_ id: String) async throws -> SwitchTenantResponse {
        try await send(.post, "/auth/switch-tenant", body: ["tenant_id": id])
    }

    // MARK: Membership
    func branches() async throws -> BranchesResponse { try await get("/me/branches") }
    func memberRecord(offset: Int = 0) async throws -> MemberRecord { try await get("/me/member-record?offset=\(offset)", cached: offset == 0) }
    func saveMemberProfile(_ profile: MemberProfile) async throws -> MemberProfile {
        try await send(.put, "/me/member-record", body: profile.body)
    }
    func askToJoin(slug: String, message: String) async throws -> JoinResponse {
        try await send(.post, "/me/branch-requests", body: ["slug": slug, "message": message])
    }
    func myItems() async throws -> MyItemsResponse { try await get("/me/items") }
    func transfers() async throws -> TransfersResponse { try await get("/me/transfers") }
    func requestTransfer(from: String, slug: String, message: String) async throws {
        try await perform(.post, "/me/transfers", body: ["from_tenant_id": from, "slug": slug, "message": message])
    }
    func cancelTransfer(_ id: String) async throws { try await perform(.post, "/me/transfers/\(enc(id))/cancel") }
    func notifications(offset: Int = 0) async throws -> NotificationsPage { try await get("/me/notifications?offset=\(offset)", cached: offset == 0) }
    func markRead(_ id: String) async throws { try await perform(.post, "/me/notifications/\(enc(id))/read") }
    func markAllRead() async throws { try await perform(.post, "/me/notifications/read-all") }
    func participationHistory(offset: Int = 0) async throws -> PersonalParticipationHistory {
        try await get("/me/participation-history?offset=\(offset)", cached: offset == 0)
    }
    func duesHistory(offset: Int = 0) async throws -> PersonalDuesHistory {
        try await get("/me/dues-history?offset=\(offset)", cached: offset == 0)
    }
    func deletionStatus() async throws -> DeletionStatus { try await get("/profile/deletion-request", cached: false) }
    func requestDeletion(reason: String) async throws {
        try await perform(.post, "/profile/deletion-request", body: reason.isEmpty ? [:] : ["reason": reason])
    }

    // MARK: Events
    func events() async throws -> EventsResponse { try await get("/events") }
    func event(_ id: String) async throws -> EventRecord { try await get("/events/\(enc(id))") }
    func register(_ id: String) async throws -> ActionResult { try await send(.post, "/events/\(enc(id))/register") }
    func withdraw(_ id: String) async throws -> ActionResult { try await send(.delete, "/events/\(enc(id))/register") }
    func participants(_ id: String) async throws -> ParticipantsResponse { try await get("/events/\(enc(id))/attendance") }
    func checkIn(_ id: String, token: String) async throws -> ActionResult {
        try await send(.post, "/events/\(enc(id))/check-in", body: ["token": token])
    }
    func myEvents(offset: Int = 0) async throws -> MyEventsPage { try await get("/events/mine?offset=\(offset)", cached: offset == 0) }
    func points(offset: Int = 0) async throws -> PointsPage { try await get("/events/points?offset=\(offset)", cached: offset == 0) }
    func leaderboard(period: String) async throws -> Leaderboard { try await get("/events/leaderboard?period=\(period)") }
    func motions(_ eventID: String) async throws -> MotionList { try await get("/events/\(enc(eventID))/motions") }
    func propose(_ eventID: String, title: String, body: String) async throws {
        try await perform(.post, "/events/\(enc(eventID))/motions", body: ["title": title, "body": body])
    }
    func vote(_ eventID: String, motion: String, choice: String) async throws -> VoteStart {
        let back = "/module/events/\(eventID)"
        return try await send(.post, "/events/\(enc(eventID))/motions/\(enc(motion))/vote",
                              body: ["choice": choice, "callback_url": AppConfig.eidCallbackURL(returnPath: back)])
    }
    /// An empty session asks about the caller's own vote on the motion.
    func pollVote(_ eventID: String, motion: String, sessionID: String) async throws -> VotePoll {
        try await send(.post, "/events/\(enc(eventID))/motions/\(enc(motion))/vote/poll", body: ["session_id": sessionID])
    }
    func tasks(_ eventID: String) async throws -> TasksResponse { try await get("/events/\(enc(eventID))/tasks") }
    func volunteer(_ eventID: String, task: String) async throws { try await perform(.post, "/events/\(enc(eventID))/tasks/\(enc(task))/volunteer") }
    func respond(_ eventID: String, task: String, accept: Bool) async throws {
        try await perform(.post, "/events/\(enc(eventID))/tasks/\(enc(task))/respond", body: ["accept": accept])
    }

    // MARK: Dues
    func duesSettings() async throws -> DuesSettings { try await get("/dues/settings") }
    func myDues(offset: Int = 0) async throws -> MyDuesPage { try await get("/dues/mine?offset=\(offset)", cached: offset == 0) }
    func reportPayment(chargeID: String, requestKey: String, amount: Double, reference: String) async throws -> ReportResult {
        try await send(.post, "/dues/payments", body: [
            "charge_id": chargeID, "request_key": requestKey, "amount": Int(amount.rounded()), "reference": reference,
        ])
    }
}

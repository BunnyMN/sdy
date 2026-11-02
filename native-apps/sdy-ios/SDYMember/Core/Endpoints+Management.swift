import Foundation

/// The officers' calls (positions, events, finance, the control committee).
/// Never cached: an officer acts on what the server holds now.
extension APIClient {
    private func q(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+?"))) ?? ""
    }
    private func p(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? ""
    }

    // MARK: Push
    func registerPushToken(_ token: String, appID: String) async throws {
        try await perform(.post, "/push-tokens", body: ["token": token, "provider": "APNS", "app_id": appID])
    }
    func unregisterPushToken(_ token: String) async throws {
        try await perform(.delete, "/push-tokens", body: ["token": token])
    }

    // MARK: Positions
    func managedMembers(query: String = "", offset: Int = 0) async throws -> ManagedMembers {
        try await get("/membership/members?q=\(q(query))&offset=\(offset)", cached: false)
    }
    func positionPolicy() async throws -> PositionPolicy { try await get("/membership/positions", cached: false) }
    func setPosition(_ userID: String, position: String) async throws {
        try await perform(.post, "/membership/members/\(p(userID))/position", body: ["position": position])
    }

    // MARK: Events (organisers)
    func createEvent(_ draft: EventDraft) async throws -> EventRecord { try await send(.post, "/events", body: draft.body) }
    func updateEvent(_ id: String, _ draft: EventDraft) async throws -> EventRecord { try await send(.put, "/events/\(p(id))", body: draft.body) }
    func markAttendance(_ eventID: String, userID: String, status: String, note: String = "") async throws {
        try await perform(.put, "/events/\(p(eventID))/attendance/\(p(userID))", body: ["status": status, "note": note])
    }
    func addParticipant(_ eventID: String, userID: String, status: String = "registered") async throws {
        try await perform(.post, "/events/\(p(eventID))/attendance", body: ["user_id": userID, "status": status])
    }
    func issueCheckin(_ eventID: String) async throws -> IssuedCheckin { try await send(.post, "/events/\(p(eventID))/check-in-code") }
    func branchPeople() async throws -> BranchPeople { try await get("/events/members", cached: false) }

    // MARK: Control committee
    func sanctions(offset: Int = 0) async throws -> SanctionList { try await get("/events/sanctions?offset=\(offset)", cached: false) }
    func mySanctions() async throws -> SanctionList { try await get("/events/sanctions/mine", cached: false) }
    func sanction(userID: String, points: Int, reason: String) async throws -> Sanction {
        try await send(.post, "/events/sanctions", body: ["user_id": userID, "points": points, "reason": reason])
    }

    // MARK: Finance
    func financeOverview(period: String = "", offset: Int = 0) async throws -> FinanceOverview {
        try await get("/dues/finance?period=\(q(period))&offset=\(offset)", cached: false)
    }
    func reviewPayment(_ id: String, action: String, reason: String) async throws {
        try await perform(.post, "/dues/payments/\(p(id))/review", body: ["action": action, "reason": reason])
    }
    func waiveCharge(_ id: String, reason: String) async throws {
        try await perform(.post, "/dues/charges/\(p(id))/waive", body: ["reason": reason])
    }
    func createCharges(period: String) async throws {
        try await perform(.post, "/dues/charges", body: ["period": period])
    }
}

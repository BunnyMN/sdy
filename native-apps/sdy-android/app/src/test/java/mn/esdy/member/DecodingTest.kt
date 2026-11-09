package mn.esdy.member

import java.io.File
import java.time.Instant
import kotlinx.serialization.KSerializer
import kotlinx.serialization.serializer
import mn.esdy.member.core.FixtureRouter
import mn.esdy.member.core.Formatters
import mn.esdy.member.models.*
import org.junit.Assert.*
import org.junit.Test

// Ported from the iOS app's DecodingTests.swift and ManagementTests.swift:
// every fixture (the same JSON files) decodes, and nulls never blank a screen.

private fun fixture(name: String): String {
    val f = listOf("src/debug/assets/fixtures/$name.json", "app/src/debug/assets/fixtures/$name.json").map(::File).first { it.exists() }
    return FixtureRouter.expandDates(f.readText())
}

private inline fun <reified T> load(name: String): T = ApiJson.decodeFromString(serializer<T>(), fixture(name))
private inline fun <reified T> decode(json: String): T = ApiJson.decodeFromString(serializer<T>(), json)

class DecodingTest {
    @Test fun identity() {
        val me = load<Me>("me")
        assertEquals("t-1", me.tenantId)
        assertEquals("organisation", me.workspaceKind)
        val profile = load<Profile>("profile")
        assertEquals(2, profile.organisations.size)
        assertEquals("batbold", profile.home?.slug)
    }

    @Test fun memberRecord() {
        val record = load<MemberRecord>("member_record")
        assertEquals("t-1", record.approvedBranch?.tenantId)
        assertTrue(record.profile.notificationsEnabled)
        assertNull(record.memberships[1].memberSince)
        val none = load<MemberRecord>("member_record_none")
        assertNull(none.approvedBranch)
        assertEquals("null slice decodes as empty", emptyList<MemberHistory>(), none.history)
    }

    @Test fun nullListsDecodeAsEmpty() {
        assertTrue(load<MyItemsResponse>("items_empty").items.isEmpty())
        assertEquals(emptyList<TaskAssignment>(), load<TasksResponse>("tasks").tasks[1].assignments)
        assertTrue(decode<EventsResponse>("{}").events.isEmpty())
    }

    @Test fun events() {
        val events = load<EventsResponse>("events").events
        assertEquals(4, events.size)
        val meeting = events[0]
        assertEquals("attended", meeting.myStatus)
        assertEquals("42/60 бүртгүүлсэн · 17 ирсэн", meeting.capacityText)
        assertNotNull(meeting.startDate)
        val open = events[2]
        assertNull(open.capacity)
        assertEquals("8 бүртгүүлсэн · 0 ирсэн", open.capacityText)
        assertNull(open.endsAt)
    }

    @Test fun motionsAndVotes() {
        val list = load<MotionList>("motions")
        assertTrue(list.canVote)
        assertTrue(list.needsMyVote(list.motions[0]))
        assertFalse(list.needsMyVote(list.motions[1]))
        assertEquals("approved", list.motions[1].displayStatus)
        assertTrue(list.motions[1].signedMine)
        assertEquals("1234", decode<VoteStart>("""{"session_id":"s","verification_code":"1234","app_link":"https://x","state":"signing"}""").verificationCode)
        assertEquals(5.0, decode<VotePoll>("""{"state":"signed","points":5}""").points!!, 0.0)
    }

    @Test fun tasks() {
        val tasks = load<TasksResponse>("tasks")
        assertEquals("offered", tasks.tasks[0].mine("u-1")?.status)
        assertTrue(tasks.tasks[0].isFree)
    }

    @Test fun dues() {
        assertEquals("5012345678", load<DuesSettings>("dues_settings").accountNumber)
        val page = load<MyDuesPage>("dues_mine")
        assertEquals(3, page.charges.size)
        assertEquals(50, page.totals?.paidPercent)
        assertTrue(page.charges[0].isOverdue())
        assertFalse("paid charges are never overdue", page.charges[2].isOverdue())
        assertEquals(0.0, page.charges[1].reportable, 0.0)
        assertEquals(10000.0, page.charges[0].reportable, 0.0)
    }

    @Test fun leaderboardPointsNotifications() {
        assertEquals(4, load<Leaderboard>("leaderboard").me?.rank)
        assertEquals(45.0, load<PointsPage>("points").total, 0.0)
        val notes = load<NotificationsPage>("notifications")
        assertEquals(2, notes.unread)
        assertFalse(notes.items[0].isRead)
        assertTrue(notes.items[2].isRead)
    }

    @Test fun everyFixtureDecodes() {
        val pairs: List<Pair<String, KSerializer<*>>> = listOf(
            "branches" to serializer<BranchesResponse>(), "tenants" to serializer<TenantsResponse>(), "items" to serializer<MyItemsResponse>(),
            "transfers" to serializer<TransfersResponse>(), "events_mine" to serializer<MyEventsPage>(), "participants" to serializer<ParticipantsResponse>(),
            "participation_history" to serializer<PersonalParticipationHistory>(), "dues_history" to serializer<PersonalDuesHistory>(),
            "eid_start" to serializer<EIDStart>(),
        )
        for ((name, s) in pairs) {
            try { ApiJson.decodeFromString(s, fixture(name)) } catch (e: Exception) { fail("$name: $e") }
        }
    }

    @Test fun eidResponses() {
        val start = load<EIDStart>("eid_start")
        assertEquals("7351", start.verificationCode)
        assertNotNull(Formatters.parseDate(start.expiresAt))
        assertEquals("abc", decode<EIDPoll>("""{"state":"COMPLETE","session_token":"abc"}""").sessionToken)
    }

    @Test fun deletionStatus() {
        val pending = decode<DeletionStatus>("""{"id":"d1","status":"pending","requested_at":"2026-10-26T02:00:00Z","scheduled_for":"2026-11-25T02:00:00Z","grace_days":30}""")
        assertTrue(pending.isPending)
        assertEquals("2026-11-25T02:00:00Z", pending.deadline)
        assertEquals(30, pending.graceDays)
        assertFalse(decode<DeletionStatus>("""{"status":"none"}""").isPending)
    }

    @Test fun fixtureDatesExpand() {
        val out = FixtureRouter.expandDates("""{"a":"@D(+1,18:30)"}""", Instant.ofEpochSecond(1_790_000_000))
        assertFalse(out.contains("@D"))
        assertTrue(out, out.contains("T10:30:00Z")) // 18:30 Ulaanbaatar = 10:30 UTC
    }
}

class ManagementTest {
    @Test fun sanctionsAndPolicyDecode() {
        val list = decode<SanctionList>("""{"sanctions":[{"id":"s1","user_id":"u1","user_name":"Б. Тэмүүлэн","actor_id":"u2","actor_name":"Хороо","event_id":null,"event_title":"","points":7,"reason":"Хурал тасалдуулсан","created_at":"2026-11-02T10:00:00Z"}],"has_more":false,"next_offset":1}""")
        assertEquals(7.0, list.sanctions.first().points, 0.0)
        assertNull(list.sanctions.first().eventId)
        val policy = decode<PositionPolicy>("""{"can_assign":true,"can_assign_chair":false,"can_set_seats":false,"auditor_seats":3,"auditors":1}""")
        assertTrue(policy.canAssign)
        assertFalse(policy.canAssignChair)
        assertEquals(3.0, policy.auditorSeats, 0.0)
        // A member list without positions (an older server) reads as members.
        assertEquals("member", decode<ManagedMembers>("""{"members":[{"user_id":"u1","name":"A","email":"a@b","status":"active"}]}""").members.first().positionValue)
    }

    @Test fun financeDecodes() {
        val overview = decode<FinanceOverview>("""{"charges":[{"id":"c1","name":"A","period":"2026-11","amount":10000,"paid":5000,"balance":5000,"pending":0,"waived":false,"waiver_reason":""}],"payments":[{"id":"p1","name":"A","amount":5000,"reference":"R1","status":"pending","review_note":"","created_at":"2026-11-02T10:00:00Z"}],"has_more":false,"next_offset":50,"totals":{"charged":10000,"received":5000,"outstanding":5000,"waived":0}}""")
        assertEquals(5000.0, overview.totals!!.outstanding, 0.0)
        assertEquals("pending", overview.payments.first().status)
    }

    @Test fun eventDraftBody() {
        var draft = EventDraft(title = "  Хурал ", capacity = "", pointsValue = "15")
        assertTrue(draft.isValid)
        assertEquals("Хурал", draft.body["title"])
        assertNull(draft.body["capacity"])
        assertEquals(15, draft.body["points_value"])
        draft = draft.copy(endsAt = draft.startsAt.minusSeconds(60))
        assertFalse("an event cannot end before it starts", draft.isValid)
        draft = draft.copy(hasEnd = false)
        assertTrue(draft.isValid)
        draft = draft.copy(title = " ")
        assertFalse(draft.isValid)
    }
}

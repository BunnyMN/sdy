package mn.esdy.member

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.time.Instant
import java.util.Collections
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.serializer
import mn.esdy.member.app.AppModel
import mn.esdy.member.app.HomeRoute
import mn.esdy.member.app.Route
import mn.esdy.member.core.*
import mn.esdy.member.design.Loader
import mn.esdy.member.features.checkin.CheckInConfirm
import mn.esdy.member.features.events.DiscussionModel
import mn.esdy.member.features.events.EventFilter
import mn.esdy.member.features.events.TasksModel
import mn.esdy.member.features.events.filtered
import mn.esdy.member.features.login.EIDLoginModel
import mn.esdy.member.features.login.KeyValues
import mn.esdy.member.features.login.PendingEIDSession
import mn.esdy.member.features.manage.PersonPicker
import mn.esdy.member.models.ApiJson
import mn.esdy.member.models.BranchPerson
import mn.esdy.member.models.EIDStart
import mn.esdy.member.models.EventRecord
import mn.esdy.member.models.EventTask
import mn.esdy.member.models.Me
import mn.esdy.member.models.Motion
import mn.esdy.member.models.Permission
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

// Ported from the iOS app's SDYMemberTests/AuditFixTests.swift — the fixes of
// docs/SDY_IOS_REVIEW_2026-11-09.md (code review #3–#23, the Low list, the
// UI/UX list), with the review of iOS PR #45 folded in: identity refresh is
// uncached and stale-safe, a 401 drops a pending tap, and an intent key
// survives A → B → A.

// region Helpers

/** One stubbed server answer; a negative status plays a dropped connection. */
private data class Answer(val status: Int, val body: String = "{}")

private typealias Handler = (Request) -> Answer

private class Stub {
    @Volatile var handler: Handler = { Answer(404) }
}

private fun Request.bodyJSON(): JSONObject = try {
    val buffer = Buffer()
    body?.writeTo(buffer)
    JSONObject(buffer.readUtf8().ifEmpty { "{}" })
} catch (e: Exception) {
    JSONObject()
}

/** The path below /api/v1, query included ("/auth/me"). */
private val Request.apiPath: String get() = url.encodedPath.removePrefix("/api/v1") + (url.encodedQuery?.let { "?$it" } ?: "")

private fun tempCache() = OfflineCache(Files.createTempDirectory("sdycache").toFile())

private fun stubClient(stub: Stub, store: TokenStore = TokenStore.inMemory(), cache: OfflineCache = tempCache()): APIClient {
    val http = OkHttpClient.Builder().addInterceptor { chain ->
        val answer = stub.handler(chain.request())
        if (answer.status < 0) throw IOException("offline")
        Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(answer.status).message("x")
            .body(answer.body.toResponseBody("application/json".toMediaType())).build()
    }.build()
    return APIClient(store, cache, null, http)
}

/** A thread-safe list of what the stub saw. */
private class Seen {
    private val items = Collections.synchronizedList(mutableListOf<String>())
    fun add(s: String) { items.add(s) }
    val all: List<String> get() = synchronized(items) { items.toList() }
    fun count(s: String) = all.count { it == s }
}

private suspend fun waitUntil(timeoutMs: Long = 3000, condition: () -> Boolean) {
    val end = System.currentTimeMillis() + timeoutMs
    while (!condition() && System.currentTimeMillis() < end) delay(10)
}

private inline fun <reified T> decode(json: String): T = ApiJson.decodeFromString(serializer<T>(), json)

private const val meT1 = """{"id":"u1","tenant_id":"t-1","tenant_name":"Салбар 1","name":"Бат Болд","email":"b@e","is_admin":false,"permissions":["events.manage"]}"""
private const val meT2 = """{"id":"u1","tenant_id":"t-2","tenant_name":"Салбар 2","name":"Бат Болд","email":"b@e","is_admin":false,"permissions":["membership.finance"]}"""
private const val recordJSON = """{"memberships":[{"tenant_id":"t-1","name":"Салбар 1","slug":"s1","is_primary":true,"status":"active","has_access":true},{"tenant_id":"t-2","name":"Салбар 2","slug":"s2","is_primary":false,"status":"active","has_access":true}],"profile":{"phone":"","residence":"","notifications_enabled":true},"history":[]}"""

/** AppModel's scope runs on Main: a plain thread stands in for it here. */
@OptIn(ExperimentalCoroutinesApi::class)
abstract class MainDispatcherTest {
    @Before fun setMainDispatcher() { Dispatchers.setMain(Dispatchers.Unconfined) }
    @After fun resetMainDispatcher() { Dispatchers.resetMain() }
}

private fun AppModel.homeRoutes(): List<Route> = paths.getValue(AppModel.Tab.Home).map { it.route }

// endregion

// region #3 branch switch

class SwitchBranchTest : MainDispatcherTest() {
    /**
     * The server switched, then /auth/me failed: the app must not stay in the
     * old branch (with its officer rights) while requests go to the new one.
     */
    @Test fun switchThatCannotReadTheNewIdentityStillLeavesTheOldBranch() = runBlocking {
        val stub = Stub()
        val api = stubClient(stub)
        api.tokens.save("tok1")
        val app = AppModel(api, null)
        app.me = decode<Me>(meT1)
        app.phase = AppModel.Phase.SignedIn
        app.openEvent("e1")
        stub.handler = { r ->
            when (r.url.encodedPath) {
                "/api/v1/auth/switch-tenant" -> Answer(200, """{"tenant_id":"t-2","switched":true,"session_token":"tok2"}""")
                "/api/v1/auth/me" -> Answer(500, """{"error":"boom"}""")
                "/api/v1/me/member-record" -> Answer(200, recordJSON)
                else -> Answer(404)
            }
        }
        try {
            app.switchBranch("t-2")
            fail("expected the /auth/me failure to be reported")
        } catch (_: APIError) {}
        assertEquals("t-2", app.me?.tenantId)
        assertEquals("Салбар 2", app.me?.tenantName)
        assertTrue("no rights carried over from the old branch", app.me?.permissions?.isEmpty() == true)
        assertFalse(app.can(Permission.manageEvents))
        assertEquals("t-2", api.cacheScope)
        assertEquals("tabs rebuild", 1, app.epoch)
        assertTrue(app.paths.getValue(AppModel.Tab.Events).isEmpty())
        assertEquals("tok2", api.tokens.token)
    }

    @Test fun successfulSwitch() = runBlocking {
        val stub = Stub()
        val api = stubClient(stub)
        api.tokens.save("tok1")
        val app = AppModel(api, null)
        app.me = decode<Me>(meT1)
        app.phase = AppModel.Phase.SignedIn
        stub.handler = { r ->
            when (r.url.encodedPath) {
                "/api/v1/auth/switch-tenant" -> Answer(200, """{"tenant_id":"t-2","switched":true,"session_token":"tok2"}""")
                "/api/v1/auth/me" -> Answer(200, meT2)
                "/api/v1/me/member-record" -> Answer(200, recordJSON)
                "/api/v1/me/notifications" -> Answer(200, """{"items":[],"unread":4}""")
                else -> Answer(404)
            }
        }
        app.switchBranch("t-2")
        assertEquals("t-2", app.me?.tenantId)
        assertTrue(app.can(Permission.finance))
        assertEquals(1, app.epoch)
        assertEquals(4, app.unreadCount)
    }
}

// endregion

// region #4 pending tap, #7 identity refresh, read marks

class PushAndIdentityTest : MainDispatcherTest() {
    private fun serve(stub: Stub, seen: Seen, me: () -> String = { meT1 }) {
        stub.handler = { r ->
            seen.add("${r.method} ${r.url.encodedPath.removePrefix("/api/v1")}")
            when (r.url.encodedPath.removePrefix("/api/v1")) {
                "/auth/me" -> Answer(200, me())
                "/me/member-record" -> Answer(200, recordJSON)
                "/me/notifications" -> Answer(200, """{"items":[],"unread":0}""")
                "/me/notifications/n1/read" -> Answer(200)
                "/events/x" -> Answer(403, """{"error":"forbidden"}""")
                else -> Answer(404)
            }
        }
    }

    /** A notification tapped while the app was not signed in opens its screen once the sign-in finishes. */
    @Test fun pushTappedBeforeSignInOpensAfterIt() = runBlocking {
        val stub = Stub()
        val api = stubClient(stub)
        val app = AppModel(api, null)
        app.phase = AppModel.Phase.SignedOut
        app.openPushed("/member/history", "n1")
        assertNotNull(app.pendingPush)
        assertTrue(app.homeRoutes().isEmpty())

        val seen = Seen()
        serve(stub, seen)
        api.tokens.save("tok")
        app.signedIn()
        assertEquals(AppModel.Phase.SignedIn, app.phase)
        assertEquals(AppModel.Tab.Home, app.tab)
        assertEquals(listOf<Route>(Route.Home(HomeRoute.History)), app.homeRoutes())
        assertNull(app.pendingPush)
        assertEquals(1, seen.count("POST /me/notifications/n1/read"))
    }

    @Test fun signOutDropsAPendingPush() = runBlocking {
        val stub = Stub()
        val app = AppModel(stubClient(stub), null)
        app.phase = AppModel.Phase.SignedOut
        app.openPushed("/member/history")
        serve(stub, Seen())
        app.signOut()
        assertNull(app.pendingPush)
    }

    /** A 401-driven sign-out (clearLocal) drops it too: it was the last person's. */
    @Test fun sessionEndDropsAPendingPush() {
        val app = AppModel(stubClient(Stub()), null)
        app.phase = AppModel.Phase.SignedOut
        app.openPushed("/member/history")
        app.clearLocal()
        assertNull(app.pendingPush)
    }

    /** eID's return to a vote while the session is still being checked opens the event afterwards. */
    @Test fun eidReturnBeforeSignInIsKept() {
        val app = AppModel(stubClient(Stub()), null)
        app.phase = AppModel.Phase.Launching
        app.handle(DeepLink.EidCallback("s1", "/module/events/3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61", forApp = true))
        assertEquals("/module/events/3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61", app.pendingPush?.path)
    }

    /** A position given while the app is open: permissions follow on refresh. */
    @Test fun refreshIdentityPicksUpNewPermissions() = runBlocking {
        val stub = Stub()
        val api = stubClient(stub)
        api.tokens.save("tok")
        val app = AppModel(api, null)
        app.me = decode<Me>(meT1)
        app.phase = AppModel.Phase.SignedIn
        var current = """{"id":"u1","tenant_id":"t-1","tenant_name":"Салбар 1","permissions":["events.manage","events.discipline"]}"""
        serve(stub, Seen()) { current }
        app.refreshIdentity()
        assertTrue(app.can(Permission.discipline))
        current = """{"id":"u1","tenant_id":"t-1","tenant_name":"Салбар 1","permissions":[]}"""
        app.refreshIdentity(minimumIntervalMs = 60_000)
        assertTrue("throttled: not read again within the interval", app.can(Permission.discipline))
        app.refreshIdentity()
        assertFalse(app.can(Permission.manageEvents))
        assertEquals("same branch: nothing rebuilds", 0, app.epoch)
    }

    /** No signal is not an answer: never back to a cached identity of another branch. */
    @Test fun refreshIdentityOfflineChangesNothing() = runBlocking {
        val stub = Stub()
        val cache = tempCache()
        val api = stubClient(stub, cache = cache)
        api.tokens.save("tok")
        // An old /auth/me for branch t-2 sits in the cache.
        cache.save(meT2.toByteArray(), api.scope("/auth/me"), "/auth/me")
        val app = AppModel(api, null)
        app.me = decode<Me>(meT1)
        app.phase = AppModel.Phase.SignedIn
        stub.handler = { Answer(-1) }
        app.refreshIdentity()
        assertEquals("t-1", app.me?.tenantId)
        assertTrue(app.can(Permission.manageEvents))
        assertEquals(0, app.epoch)
    }

    /** A branch switch while the refresh is in flight: its late answer is not applied. */
    @Test fun refreshIdentityBailsWhenTheBranchMovedMeanwhile() = runBlocking {
        val stub = Stub()
        val api = stubClient(stub)
        api.tokens.save("tok")
        val app = AppModel(api, null)
        app.me = decode<Me>(meT1)
        app.phase = AppModel.Phase.SignedIn
        stub.handler = { r ->
            if (r.url.encodedPath.endsWith("/auth/me")) {
                // Meanwhile the member switched branch on this phone.
                app.me = decode<Me>(meT2); app.epoch += 1
                Answer(200, meT1)
            } else Answer(200, recordJSON)
        }
        app.refreshIdentity()
        assertEquals("t-2", app.me?.tenantId)
        assertEquals(1, app.epoch)
    }

    /** A 403 means the rights the app shows may be stale: it reads them again. */
    @Test fun forbiddenAnswerRereadsIdentity() = runBlocking {
        val stub = Stub()
        val api = stubClient(stub)
        api.tokens.save("tok")
        val app = AppModel(api, null)
        app.me = decode<Me>(meT1)
        app.phase = AppModel.Phase.SignedIn
        val seen = Seen()
        serve(stub, seen) { """{"id":"u1","tenant_id":"t-1","permissions":[]}""" }
        try { api.raw(HTTPMethod.GET, "/events/x") } catch (_: APIError) {}
        waitUntil { !app.can(Permission.manageEvents) }
        assertFalse(app.can(Permission.manageEvents))
        assertEquals(1, seen.count("GET /auth/me"))
    }

    /** Read only when the server agreed (Low: read mark on failure). */
    @Test fun notificationMarkedReadOnlyOnSuccess() = runBlocking {
        val stub = Stub()
        val api = stubClient(stub)
        api.tokens.save("tok")
        val app = AppModel(api, null)
        app.unreadCount = 3
        stub.handler = { Answer(500) }
        assertFalse(app.markNotificationRead("n1"))
        assertEquals(3, app.unreadCount)
        stub.handler = { Answer(200) }
        assertTrue(app.markNotificationRead("n1"))
        assertEquals(2, app.unreadCount)
    }
}

// endregion

// region #5 binding, eID countdown, EIDLoginModel state machine

class EIDLoginModelTest {
    private lateinit var scope: CoroutineScope

    @Before fun setUp() {
        PendingEIDSession.defaults = KeyValues.Memory()
        PendingEIDSession.bindingStore = TokenStore.inMemory()
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    }

    @After fun tearDown() {
        scope.cancel()
        PendingEIDSession.forget()
    }

    private fun iso(seconds: Long) = Instant.now().plusSeconds(seconds).toString()

    /** The model, started with a registration number, and polls answered in turn by `polls`. */
    private fun started(start: String, polls: List<Answer>, seen: Seen = Seen()): Pair<EIDLoginModel, APIClient> {
        val stub = Stub()
        val api = stubClient(stub)
        val queue = polls.toMutableList()
        stub.handler = { r ->
            when (r.url.encodedPath) {
                "/api/v1/auth/eid/start-id" -> Answer(200, start)
                "/api/v1/auth/eid/poll" -> {
                    seen.add(r.bodyJSON().optString("binding", "-").ifEmpty { "-" })
                    synchronized(queue) { if (queue.size > 1) queue.removeAt(0) else queue.firstOrNull() ?: Answer(200, """{"state":"RUNNING"}""") }
                }
                else -> Answer(404)
            }
        }
        val model = EIDLoginModel(api, null, scope, gapMs = 5)
        model.method = EIDLoginModel.Method.RegisterNumber
        model.updateRegisterNumber("УБ90010112")
        model.start()
        return model to api
    }

    private val EIDLoginModel.isWaiting get() = phase is EIDLoginModel.Phase.Waiting
    private val EIDLoginModel.isFailed get() = phase is EIDLoginModel.Phase.Failed

    @Test fun countdownFromExpiresAtAndBindingKept() = runBlocking {
        val seen = Seen()
        val (model, _) = started("""{"session_id":"s9","verification_code":"12","expires_at":"${iso(120)}","binding":"bb"}""", listOf(Answer(200, """{"state":"RUNNING"}""")), seen)
        waitUntil { model.isWaiting && seen.all.isNotEmpty() && model.secondsLeft != null }
        assertTrue(model.isWaiting)
        assertTrue("${model.secondsLeft}", (115..120).contains(model.secondsLeft ?: 0))
        assertEquals("the start's binding goes with the poll", "bb", seen.all.first())
        assertEquals("bb", PendingEIDSession.resumable("s9")?.binding)
        model.cancel()
    }

    @Test fun noExpiresAtFallsBackToBackstopWithoutCountdown() = runBlocking {
        val (model, _) = started("""{"session_id":"s9","verification_code":"12"}""", listOf(Answer(200, """{"state":"RUNNING"}""")))
        waitUntil { model.isWaiting }
        assertTrue(model.isWaiting)
        assertNull(model.secondsLeft)
        model.cancel()
    }

    @Test fun completeSignsIn() = runBlocking {
        var signedIn = false
        val (model, api) = started(
            """{"session_id":"s9","verification_code":"12"}""",
            listOf(Answer(200, """{"state":"RUNNING"}"""), Answer(200, """{"state":"COMPLETE","session_token":"T"}""")),
        )
        model.onSignedIn = { signedIn = true }
        waitUntil { model.phase == EIDLoginModel.Phase.Success && signedIn }
        assertEquals(EIDLoginModel.Phase.Success, model.phase)
        assertTrue(signedIn)
        assertEquals("T", api.tokens.token)
        assertNull("forgotten once finished", PendingEIDSession.resumable("s9"))
    }

    @Test fun completeWithoutTokenFails() = runBlocking {
        val (model, _) = started("""{"session_id":"s9"}""", listOf(Answer(200, """{"state":"COMPLETE"}""")))
        waitUntil { model.isFailed }
        assertTrue("${model.phase}", model.isFailed)
    }

    @Test fun expiredAndRefused() = runBlocking {
        val (a, _) = started("""{"session_id":"s9"}""", listOf(Answer(200, """{"state":"EXPIRED"}""")))
        waitUntil { a.phase == EIDLoginModel.Phase.Expired }
        assertEquals(EIDLoginModel.Phase.Expired, a.phase)
        val (b, _) = started("""{"session_id":"s9"}""", listOf(Answer(200, """{"state":"REFUSED"}""")))
        waitUntil { b.phase == EIDLoginModel.Phase.Refused }
        assertEquals(EIDLoginModel.Phase.Refused, b.phase)
    }

    /** The server no longer knows the session (404 "eID session expired"). */
    @Test fun poll404IsExpired() = runBlocking {
        val (model, _) = started("""{"session_id":"s9"}""", listOf(Answer(404, """{"error":"eID session expired"}""")))
        waitUntil { model.phase == EIDLoginModel.Phase.Expired }
        assertEquals(EIDLoginModel.Phase.Expired, model.phase)
    }

    @Test fun otherDeviceIsExplained() = runBlocking {
        val (model, _) = started("""{"session_id":"s9"}""", listOf(Answer(403, """{"error":"eid_session_other_device"}""")))
        waitUntil { model.isFailed }
        assertEquals(EIDLoginModel.Phase.Failed("Энэ eID хүсэлтийг өөр төхөөрөмж эхлүүлсэн байна. Дахин эхлүүлнэ үү."), model.phase)
    }

    @Test fun threeDroppedConnectionsAreTolerated() = runBlocking {
        val (model, _) = started(
            """{"session_id":"s9"}""",
            listOf(Answer(-1), Answer(-1), Answer(-1), Answer(200, """{"state":"COMPLETE","session_token":"T"}""")),
        )
        waitUntil { model.phase == EIDLoginModel.Phase.Success }
        assertEquals(EIDLoginModel.Phase.Success, model.phase)
    }

    @Test fun fourDroppedConnectionsFail() = runBlocking {
        val (model, _) = started("""{"session_id":"s9"}""", listOf(Answer(-1)))
        waitUntil { model.isFailed }
        assertEquals(EIDLoginModel.Phase.Failed(ErrorText.network), model.phase)
    }

    @Test fun startRefusalUsesTheServerSentence() = runBlocking {
        val stub = Stub()
        stub.handler = { Answer(400, """{"error":"Регистрийн дугаар олдсонгүй эсвэл eID апп-д бүртгэлгүй байна"}""") }
        val model = EIDLoginModel(stubClient(stub), null, scope, gapMs = 5)
        model.method = EIDLoginModel.Method.RegisterNumber
        model.updateRegisterNumber("УБ90010112")
        model.start()
        waitUntil { model.isFailed }
        assertEquals(
            EIDLoginModel.Phase.Failed("Регистрийн дугаар олдсонгүй эсвэл eID апп-д бүртгэлгүй байна. eID Mongolia аппаа идэвхжүүлсэн эсэхээ шалгана уу."),
            model.phase,
        )
    }

    /** Android ended the app while the member was in eID; eID's link reopened it. The poll carries the kept binding. */
    @Test fun resumeAfterRelaunchSendsTheKeptBinding() = runBlocking {
        PendingEIDSession.remember("s1", binding = "b1", expiresAt = iso(300))
        val seen = Seen()
        val stub = Stub()
        stub.handler = { r ->
            seen.add(r.bodyJSON().optString("binding", "-"))
            Answer(200, """{"state":"COMPLETE","session_token":"T"}""")
        }
        val model = EIDLoginModel(stubClient(stub), null, scope, gapMs = 5)
        model.resume(sessionFromLink = "someone-else")
        assertEquals("a session this phone did not start is ignored", EIDLoginModel.Phase.Idle, model.phase)
        model.resume(sessionFromLink = "s1")
        waitUntil { model.phase == EIDLoginModel.Phase.Success }
        assertEquals(EIDLoginModel.Phase.Success, model.phase)
        assertEquals(listOf("b1"), seen.all)
    }

    @Test fun pendingSessionKeepsBindingAndEnd() {
        PendingEIDSession.remember("s1", binding = "b1", expiresAt = "2030-01-01T00:00:00Z")
        assertEquals("b1", PendingEIDSession.resumable("s1")?.binding)
        assertEquals("2030-01-01T00:00:00Z", PendingEIDSession.resumable("s1")?.expiresAt)
        assertNull(PendingEIDSession.resumable("s2"))
        PendingEIDSession.forget()
        assertNull(PendingEIDSession.resumable("s1"))
        assertNull(PendingEIDSession.bindingStore.token)
    }

    @Test fun startDecodesExpiresAtAndBinding() {
        val s = decode<EIDStart>("""{"session_id":"s","verification_code":"1234","expires_at":"2030-01-01T00:00:00Z","binding":"b"}""")
        assertEquals("2030-01-01T00:00:00Z", s.expiresAt)
        assertEquals("b", s.binding)
        assertNull(decode<EIDStart>("""{"session_id":"s"}""").expiresAt)
    }
}

// endregion

// region #8 idempotency

class IdempotencyTest {
    @Test fun oneKeyPerIntent() {
        val intent = IntentKey()
        val first = intent.key("u1|5|late")
        assertEquals("a retry reuses the key", first, intent.key("u1|5|late"))
        val changed = intent.key("u1|6|late")
        assertNotEquals("a different decision gets a new key", first, changed)
        assertEquals("back to the first decision: its own key again (A → B → A)", first, intent.key("u1|5|late"))
        intent.reset()
        assertNotEquals(changed, intent.key("u1|6|late"))
    }

    @Test fun sanctionSendsTheKeyOnEveryRetry() = runBlocking {
        val stub = Stub()
        val api = stubClient(stub)
        api.tokens.save("tok")
        val seen = Seen()
        stub.handler = { r ->
            seen.add(r.header("Idempotency-Key") ?: "-")
            Answer(200, """{"id":"s1","points":5}""")
        }
        val intent = IntentKey()
        val key = intent.key("u2|5|reason")
        api.sanction("u2", 5, "reason", idempotencyKey = key)
        api.sanction("u2", 5, "reason", idempotencyKey = intent.key("u2|5|reason"))
        assertEquals(listOf(key, key), seen.all)
        assertEquals(key, UUID.fromString(key).toString())
    }
}

// endregion

// region #15 error mapping, #16 transient

class AuditErrorTextTest {
    private fun text(status: Int, message: String) = APIError(APIError.Kind.Server(status), message).message

    @Test fun newServerSentences() {
        assertEquals("Энэ ажлын бүх суудал дүүрсэн байна.", text(409, "every place on this task is taken"))
        assertEquals("Өөрийнхөө талаарх шийдвэрийг хорооны бусад гишүүд гаргана.", text(403, "a decision about yourself is for the rest of the committee"))
        assertEquals("Ирц бүртгэгдсэний дараа оноог өөрчлөх боломжгүй.", text(409, "points cannot change after attendance has been recorded"))
        assertEquals("Ирц залруулах шалтгаанаа бичнэ үү.", text(400, "provide a reason for the attendance correction"))
        assertEquals("Төлбөрийн төлөв өөрчлөгдсөн байна. Шинэчлээд дахин оролдоно уу.", text(409, "this payment cannot make that transition"))
        assertEquals("Гарын үсэг ирэхээс өмнө санал хураалт хаагдсан тул санал тоологдсонгүй.", text(409, "the vote closed before your signature arrived"))
        assertEquals("eID хүсэлтийн хугацаа дууслаа. Дахин эхлүүлнэ үү.", text(404, "eID session expired"))
        assertEquals("eID буцах хаяг буруу байна. Аппаа шинэчилнэ үү.", text(400, "invalid eID callback URL"))
    }

    /** Wording the backend is still adding is recognised by its parts. */
    @Test fun selfActionsAndCancelledEventsByStatus() {
        assertEquals("Өөрийнхөө ажлыг өөрөө батлах боломжгүй.", text(403, "you cannot confirm your own task"))
        assertEquals("Өөрийнхөө талаар энэ үйлдлийг хийх боломжгүй. Өөр эрх бүхий хүнд хандана уу.", text(403, "organisers cannot mark their own attendance"))
        assertEquals("Өөрийнхөө талаар энэ үйлдлийг хийх боломжгүй. Өөр эрх бүхий хүнд хандана уу.", text(403, "finance cannot approve a payment for yourself"))
        assertEquals("Энэ арга хэмжээ цуцлагдсан тул үйлдлийг хийх боломжгүй.", text(409, "the event was cancelled"))
        assertEquals("Энэ арга хэмжээ цуцлагдсан.", text(409, "this event is cancelled"))
        assertEquals("Хүлээгдэж буй төлбөртэй хураамжийг чөлөөлөх боломжгүй. Эхлээд төлбөрийг батлах эсвэл татгалзана уу.", text(409, "cannot waive a charge with a pending payment"))
        assertEquals("Энэ үйлдлийг хийх эрх танд алга.", text(403, "forbidden"))
        assertEquals(ErrorText.fallback(409), text(409, "something else"))
    }

    @Test fun transient() {
        assertTrue(APIError.network.isTransient)
        assertTrue(APIError(APIError.Kind.Server(503)).isTransient)
        assertTrue(APIError(APIError.Kind.Server(502)).isTransient)
        assertFalse(APIError(APIError.Kind.Server(500)).isTransient)
        assertFalse(APIError(APIError.Kind.Server(409)).isTransient)
    }

    @Test fun eidPollMessages() {
        assertEquals("Энэ системд нэвтрэх эрх олгогдоогүй байна. Салбартаа хандана уу.", EIDLoginModel.pollMessage(APIError(APIError.Kind.Server(403), "suspended")))
        assertEquals("eID баталгаажуулалт амжилтгүй боллоо. Дахин оролдоно уу.", EIDLoginModel.pollMessage(APIError(APIError.Kind.Unauthorized, "unauthorized")))
        assertEquals("eID Mongolia-тай холбогдож чадсангүй. Дахин оролдоно уу.", EIDLoginModel.pollMessage(APIError(APIError.Kind.Server(502), "eID Mongolia session check failed")))
    }
}

// endregion

// region #16, #17 votes; #19 tasks

class VoteAndTaskTest {
    private lateinit var scope: CoroutineScope
    @Before fun setUp() { scope = CoroutineScope(SupervisorJob() + Dispatchers.Default) }
    @After fun tearDown() { scope.cancel() }

    private val motion = decode<Motion>("""{"id":"m1","event_id":"e1","title":"Асуудал","status":"voting","my_vote":{"choice":"yes","status":"signing"}}""")

    /** eID's gateway failing once does not fail the vote. */
    @Test fun gatewayErrorOnceIsRetried() = runBlocking {
        val seen = Seen()
        val stub = Stub()
        stub.handler = { r ->
            val path = r.url.encodedPath
            when {
                path.endsWith("/vote/poll") -> {
                    seen.add("poll")
                    if (seen.count("poll") == 1) Answer(503) else Answer(200, """{"state":"signed","points":5}""")
                }
                path.endsWith("/vote") -> Answer(200, """{"session_id":"v1","verification_code":"12","state":"signing"}""")
                else -> Answer(200, """{"motions":[],"can_vote":true,"signing_ready":true}""")
            }
        }
        val model = DiscussionModel("e1", stubClient(stub), null, scope, pollIntervalMs = 5)
        model.vote(motion, "yes")
        waitUntil { model.signing?.phase == DiscussionModel.SigningPhase.Done || model.signing?.phase == DiscussionModel.SigningPhase.Failed }
        assertEquals(DiscussionModel.SigningPhase.Done, model.signing?.phase)
        assertEquals(2, seen.count("poll"))
    }

    /** «Шалгах» on a vote left signing asks about it (empty session) instead of voting again. */
    @Test fun checkAsksAboutTheOwnVote() = runBlocking {
        val seen = Seen()
        val stub = Stub()
        stub.handler = { r ->
            val path = r.url.encodedPath
            when {
                path.endsWith("/vote/poll") -> { seen.add("session=" + r.bodyJSON().optString("session_id", "?")); Answer(200, """{"state":"signed"}""") }
                path.endsWith("/vote") -> { seen.add("VOTE"); Answer(500) }
                else -> Answer(200, """{"motions":[]}""")
            }
        }
        val model = DiscussionModel("e1", stubClient(stub), null, scope, pollIntervalMs = 5)
        model.check(motion)
        waitUntil { model.signing?.phase == DiscussionModel.SigningPhase.Done }
        assertEquals(DiscussionModel.SigningPhase.Done, model.signing?.phase)
        assertEquals("session=", seen.all.first())
        assertEquals(0, seen.count("VOTE"))
    }

    /** The last place went to somebody else: the list is read again. */
    @Test fun refusedTaskReloadsTheList() = runBlocking {
        val seen = Seen()
        val stub = Stub()
        stub.handler = { r ->
            if (r.method == "POST") Answer(409, """{"error":"every place on this task is taken"}""")
            else {
                seen.add("GET")
                Answer(200, """{"tasks":[{"id":"t1","title":"Ширээ","points":5,"slots":1,"taken":1,"assignments":[]}],"me":"u1"}""")
            }
        }
        val model = TasksModel("e1", stubClient(stub), scope)
        val task = decode<EventTask>("""{"id":"t1","event_id":"e1","title":"Ширээ","points":5,"slots":1,"taken":0}""")
        model.volunteer(task).join()
        assertEquals("Энэ ажлын бүх суудал дүүрсэн байна.", model.error)
        assertEquals(1, seen.count("GET"))
        assertEquals(1, model.data?.tasks?.first()?.taken)
    }
}

// endregion

// region Formatting (Ulaanbaatar time), events, paging

class AuditFormattingTest {
    private lateinit var savedZone: java.util.TimeZone

    @Before fun setUp() {
        savedZone = java.util.TimeZone.getDefault()
        // The phone is set elsewhere: nothing below may follow it.
        java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("America/New_York"))
    }

    @After fun tearDown() { java.util.TimeZone.setDefault(savedZone) }

    private fun at(s: String) = Formatters.parseDate(s)!!

    @Test fun rangeOnOneDayAndAcross() {
        val now = at("2026-11-01T00:00:00Z")
        // 10:30Z = 18:30 in Ulaanbaatar.
        assertEquals("11-р сарын 9, 18:30–20:30", Formatters.range("2026-11-09T10:30:00Z", "2026-11-09T12:30:00Z", now))
        assertEquals("11-р сарын 9, 18:30 – 11-р сарын 10, 12:00", Formatters.range("2026-11-09T10:30:00Z", "2026-11-10T04:00:00Z", now))
        assertEquals("11-р сарын 9, 18:30", Formatters.range("2026-11-09T10:30:00Z", null, now))
        assertEquals("2027 оны 1-р сарын 5, 10:00", Formatters.range("2027-01-05T02:00:00Z", null, now))
        assertEquals("—", Formatters.range(null, null, now))
    }

    @Test fun listBadgeIsUlaanbaatarsDay() {
        // 17:30Z on the 9th is already 01:30 on the 10th in Ulaanbaatar.
        assertEquals(10 to 11, Formatters.dayMonth(at("2026-11-09T17:30:00Z")))
    }

    @Test fun duesPeriodsFollowUlaanbaatarsMonth() {
        // 31 Oct 17:00Z is 1 Nov 01:00 in Ulaanbaatar.
        assertEquals(listOf("2026-11", "2026-10", "2026-09"), Formatters.recentPeriods(3, at("2026-10-31T17:00:00Z")))
    }

    /** A three-day camp is upcoming until it ends, not six hours after it starts. */
    @Test fun multiDayEventIsPastOnlyAfterItEnds() {
        val now = at("2026-11-10T12:00:00Z")
        val camp = decode<EventRecord>("""{"id":"c","title":"Зуслан","starts_at":"2026-11-09T02:00:00Z","ends_at":"2026-11-12T02:00:00Z","status":"planned"}""")
        val talk = decode<EventRecord>("""{"id":"t","title":"Хурал","starts_at":"2026-11-10T02:00:00Z","status":"planned"}""")
        val done = decode<EventRecord>("""{"id":"d","title":"Болсон","starts_at":"2026-11-20T02:00:00Z","status":"done"}""")
        assertFalse(camp.isPast(now))
        assertTrue("no end: six hours after the start", talk.isPast(now))
        assertTrue(done.isPast(now))
        assertEquals(listOf("c"), filtered(listOf(camp, talk, done), EventFilter.Upcoming, now).map { it.id })
        assertEquals(listOf("d", "t"), filtered(listOf(camp, talk, done), EventFilter.Past, now).map { it.id })
    }

    @Test fun shortCapacity() {
        assertEquals("12/50 бүртгүүлсэн", decode<EventRecord>("""{"id":"a","registered":12,"attended":0,"capacity":50}""").capacityShort)
        assertEquals("12 бүртгүүлсэн · 3 ирсэн", decode<EventRecord>("""{"id":"a","registered":12,"attended":3}""").capacityShort)
    }

    @Test fun pagesDoNotRepeatRows() {
        val first = listOf(1, 2, 3)
        // A row inserted on the server shifted the offset: 3 comes again.
        assertEquals(listOf(1, 2, 3, 4), first.appendingUnique(listOf(3, 4)) { it })
        assertEquals(listOf(1, 2, 3), first.appendingUnique(emptyList()) { it })
    }
}

// endregion

// region Session leftovers: cache after sign-out

class SessionLeftoverTest {
    /** An answer that arrives after sign-out (the cache was wiped while it was in flight) is not written back. */
    @Test fun lateAnswerAfterSignOutIsNotCached() = runBlocking {
        val cache = tempCache()
        val stub = Stub()
        val api = stubClient(stub, cache = cache)
        api.tokens.save("tok")
        val path = "/me/notifications?offset=0"
        stub.handler = {
            cache.clearAll() // signed out meanwhile
            Answer(200, """{"items":[],"unread":7}""")
        }
        api.notifications()
        assertNull(cache.load(api.scope(path), path))

        stub.handler = { Answer(200, """{"items":[],"unread":7}""") }
        api.notifications()
        assertNotNull(cache.load(api.scope(path), path))
    }

    /**
     * iOS clears a Keychain token left from before a reinstall. Android needs
     * no such step: uninstall deletes SharedPreferences and the Keystore key,
     * and backup is off — checked here so it stays that way.
     */
    @Test fun backupStaysOffSoAReinstallStartsSignedOut() {
        val manifest = listOf(File("src/main/AndroidManifest.xml"), File("app/src/main/AndroidManifest.xml")).first { it.exists() }.readText()
        assertTrue(manifest.contains("android:allowBackup=\"false\""))
    }
}

// endregion

// region Small screen logic

class ScreenLogicTest {
    private fun event(json: String) = decode<EventRecord>(json)

    /** #18 / UI #8: nothing to confirm → a reason and «Хаах», never a dead button. */
    @Test fun checkInConfirmBlockedReasons() {
        assertNull(CheckInConfirm.blockedReason(event("""{"id":"e","status":"planned","my_status":"registered"}""")))
        assertNull(CheckInConfirm.blockedReason(event("""{"id":"e","status":"planned","my_status":""}""")))
        assertEquals("Таны ирц аль хэдийн баталгаажсан байна.", CheckInConfirm.blockedReason(event("""{"id":"e","status":"planned","my_status":"attended"}""")))
        assertEquals("Энэ арга хэмжээ хаагдсан тул ирц бүртгэх боломжгүй.", CheckInConfirm.blockedReason(event("""{"id":"e","status":"done","my_status":"registered"}""")))
        assertEquals("Энэ арга хэмжээ цуцлагдсан тул ирц бүртгэх боломжгүй.", CheckInConfirm.blockedReason(event("""{"id":"e","status":"cancelled","my_status":"registered"}""")))
        assertNotNull(CheckInConfirm.blockedReason(event("""{"id":"e","status":"planned","my_status":"absent"}""")))
    }

    /** #20: Нүүр reloads when what it shows is older than a minute. */
    @Test fun loaderRefreshesOnlyWhenStale() = runBlocking {
        var calls = 0
        val loader = Loader(this) { calls += 1; calls }
        loader.refresh(60_000)
        assertEquals("nothing shown yet is loadIfNeeded's job", 0, calls)
        loader.loadIfNeeded()
        assertEquals(1, calls)
        loader.refresh(60_000)
        assertEquals("fresh", 1, calls)
        loader.refresh(60_000, now = System.currentTimeMillis() + 61_000)
        assertEquals(2, calls)
    }

    /** #10: anybody in the branch can be found, not only the first 30. */
    @Test fun personPickerSearches() {
        val list = (0 until 80).joinToString(",") { """{"user_id":"u$it","name":"Гишүүн $it","email":"m$it@e-sdy.mn"}""" }
        val people = decode<List<BranchPerson>>("[$list]")
        assertEquals(80, PersonPicker.filter(people, "").size)
        assertEquals(listOf("u75"), PersonPicker.filter(people, "Гишүүн 75").map { it.userId })
        assertEquals(listOf("u42"), PersonPicker.filter(people, "M42@").map { it.userId })
    }

    /** The binding is a credential: kept apart from the session token. */
    @Test fun bindingStoreIsSeparateFromTheSessionToken() {
        val session = TokenStore.inMemory()
        PendingEIDSession.bindingStore = TokenStore.inMemory()
        PendingEIDSession.defaults = KeyValues.Memory()
        session.save("tok")
        PendingEIDSession.remember("s", binding = "b")
        PendingEIDSession.forget()
        assertEquals("tok", session.token)
    }

}

// endregion

// region Backend PR #46 (fix/audit-2026-11-backend)

class BackendPR46Test {
    private fun text(status: Int, message: String) = APIError(APIError.Kind.Server(status), message).message

    /** The backend's exact sentences, each with its own Mongolian wording. */
    @Test fun exactBackendSentences() {
        val cases = listOf(
            Triple(403, "you cannot record your own attendance", "Өөрийнхөө ирц, оноог өөрөө батлах боломжгүй. Өөр зохион байгуулагчид хандана уу."),
            Triple(403, "you cannot confirm your own task", "Өөрийнхөө ажлыг өөрөө батлах боломжгүй."),
            Triple(403, "you cannot check in with a check-in code you issued", "Өөрийн гаргасан QR кодоор ирцээ бүртгэх боломжгүй. Өөр зохион байгуулагчийн кодыг уншуулна уу."),
            Triple(403, "you cannot review your own payment", "Өөрийнхөө төлбөрийг өөрөө батлах боломжгүй. Өөр санхүүчид хандана уу."),
            Triple(403, "you cannot change the exemption of your own charge", "Өөрийнхөө хураамжийн чөлөөлөлтийг өөрөө өөрчлөх боломжгүй. Өөр санхүүчид хандана уу."),
            Triple(409, "this event is cancelled", "Энэ арга хэмжээ цуцлагдсан."),
            Triple(409, "check-in is open from 2 hours before the event starts until 2 hours after it ends", "Ирц арга хэмжээ эхлэхээс 2 цагийн өмнөөс дууссанаас хойш 2 цаг хүртэл бүртгэгдэнэ."),
            Triple(409, "this charge has a pending payment report; approve or reject it before exempting the charge", "Энэ хураамжид хүлээгдэж буй төлбөрийн мэдэгдэл байна. Чөлөөлөхийн өмнө төлбөрийг батлах эсвэл татгалзана уу."),
            Triple(409, "this Idempotency-Key was already used for a different decision", "Шийдвэрийг өөр утгатайгаар давхар илгээсэн байна. Цонхоо хаагаад дахин оролдоно уу."),
            Triple(400, "Idempotency-Key must be a UUID", "Шийдвэрийн түлхүүр буруу байна. Аппаа шинэчилнэ үү."),
            Triple(400, "provide a reason for the attendance correction", "Ирц залруулах шалтгаанаа бичнэ үү."),
            Triple(404, "no waived charge with that id", "Хураамж олдсонгүй эсвэл чөлөөлөгдөөгүй байна."),
            Triple(400, "provide the reason for withdrawing the exemption", "Чөлөөлөлтийг буцаах шалтгаанаа бичнэ үү."),
        )
        for ((status, message, expected) in cases) assertEquals(message, expected, text(status, message))
        // The generic fallbacks stay for wording not known yet.
        assertEquals("Өөрийнхөө талаар энэ үйлдлийг хийх боломжгүй. Өөр эрх бүхий хүнд хандана уу.", text(403, "you cannot do something else to your own thing"))
    }

    /** A repeated key: 200 with `Idempotent-Replayed: true` and the decision as first recorded — success, not an error. */
    @Test fun replayedSanctionIsSuccess() = runBlocking {
        val http = OkHttpClient.Builder().addInterceptor { chain ->
            Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .header("Idempotent-Replayed", "true")
                .body("""{"id":"s1","user_id":"u2","points":5,"reason":"r"}""".toResponseBody("application/json".toMediaType())).build()
        }.build()
        val api = APIClient(TokenStore.inMemory(), tempCache(), null, http)
        api.tokens.save("tok")
        assertEquals("s1", api.sanction("u2", 5, "r", idempotencyKey = UUID.randomUUID().toString()).id)
    }

    /** Charges ran out, payments did not: only the payments move on. */
    @Test fun perListPaging() {
        val page = decode<mn.esdy.member.models.MyDuesPage>("""{"charges":[],"payments":[],"has_more":true,"next_offset":50,"charges_has_more":false,"payments_has_more":true,"next_charges_offset":null,"next_payments_offset":50}""")
        assertEquals("charges_offset=3&payments_offset=50", page.nextPageQuery(3, 50))
        val both = decode<mn.esdy.member.models.FinanceOverview>("""{"has_more":true,"next_offset":50,"charges_has_more":true,"payments_has_more":true,"next_charges_offset":50,"next_payments_offset":50}""")
        assertEquals("charges_offset=50&payments_offset=50", both.nextPageQuery(50, 50))
        val done = decode<mn.esdy.member.models.MyDuesPage>("""{"has_more":false,"charges_has_more":false,"payments_has_more":false}""")
        assertNull(done.nextPageQuery(1, 1))
    }

    /** An older server: one shared offset, as before. */
    @Test fun sharedOffsetFallback() {
        assertEquals("offset=50", decode<mn.esdy.member.models.MyDuesPage>("""{"has_more":true,"next_offset":50}""").nextPageQuery(50, 12))
        assertEquals("offset=50", decode<mn.esdy.member.models.FinanceOverview>("""{"has_more":true}""").nextPageQuery(50, 12))
    }

    @Test fun unwaivePathAndReason() = runBlocking {
        val stub = Stub()
        val api = stubClient(stub)
        api.tokens.save("tok")
        val seen = Seen()
        stub.handler = { r ->
            seen.add("${r.method} ${r.url.encodedPath} ${r.bodyJSON().optString("reason")}")
            Answer(200, """{"ok":true,"waived":false}""")
        }
        api.unwaiveCharge("c1", "Алдаа")
        assertEquals(listOf("POST /api/v1/dues/charges/c1/unwaive Алдаа"), seen.all)
    }
}

// endregion

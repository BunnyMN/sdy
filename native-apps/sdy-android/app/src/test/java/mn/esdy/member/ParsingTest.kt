package mn.esdy.member

import mn.esdy.member.app.AppModel
import mn.esdy.member.app.HomeRoute
import mn.esdy.member.core.*
import mn.esdy.member.models.DuesMath
import org.junit.Assert.*
import org.junit.Test
import java.io.File

// Ported from the iOS app's SDYMemberTests/ParsingTests.swift — the same
// cases, so both apps read links, register numbers, cookies and dates alike.

class QRParserTest {
    private val token = "a1".repeat(24)
    private val event = "3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61"

    @Test fun validCode() {
        assertEquals(CheckinCode(event, token), LinkParser.checkin("https://e-sdy.mn/member/check-in#event=$event&token=$token"))
    }

    @Test fun wwwHostAndUppercaseEvent() {
        assertNotNull(LinkParser.checkin("https://www.e-sdy.mn/member/check-in#event=$event&token=$token"))
        assertNotNull(LinkParser.checkin("https://e-sdy.mn/member/check-in/#event=${event.uppercase()}&token=$token"))
    }

    @Test fun rejectsOtherHosts() {
        assertNull(LinkParser.checkin("https://evil.mn/member/check-in#event=$event&token=$token"))
        assertNull(LinkParser.checkin("https://e-sdy.mn.evil.com/member/check-in#event=$event&token=$token"))
        assertNull(LinkParser.checkin("http://e-sdy.mn/member/check-in#event=$event&token=$token"))
    }

    @Test fun rejectsBadTokenOrEvent() {
        assertNull(LinkParser.checkin("https://e-sdy.mn/member/check-in#event=$event&token=${token.uppercase()}"))
        assertNull(LinkParser.checkin("https://e-sdy.mn/member/check-in#event=$event&token=abc"))
        assertNull(LinkParser.checkin("https://e-sdy.mn/member/check-in#event=not-a-uuid&token=$token"))
        assertNull(LinkParser.checkin("https://e-sdy.mn/member/other#event=$event&token=$token"))
        assertNull(LinkParser.checkin("just text"))
    }
}

class RegisterNumberTest {
    @Test fun latinLookalikesBecomeCyrillic() {
        assertEquals("АК90010112", RegisterNumber.normalize("ak90010112"))
        assertEquals("ТХ90010112", RegisterNumber.normalize("TX 9001 0112"))
        assertEquals("УБ90010112", RegisterNumber.normalize("уб90010112"))
        assertEquals("УР90010112", RegisterNumber.normalize("YP90010112"))
    }

    @Test fun lengthIsCapped() = assertEquals(10, RegisterNumber.normalize("УБ900101129999").length)

    @Test fun validation() {
        assertTrue(RegisterNumber.isValid("УБ90010112"))
        assertTrue(RegisterNumber.isValid("ӨҮ90010112"))
        assertFalse(RegisterNumber.isValid("UB90010112"))
        assertFalse(RegisterNumber.isValid("УБ9001011"))
        assertNull(RegisterNumber.hint(""))
        assertNull(RegisterNumber.hint("УБ90010112"))
        assertNotNull(RegisterNumber.hint("УБ900"))
        assertNotNull(RegisterNumber.hint("1Б90010112"))
        assertNotNull(RegisterNumber.hint("УБ9001011Б"))
    }
}

class SessionCookieTest {
    @Test fun set() = assertEquals(SessionCookieUpdate.Set("abc123"), SessionCookieParser.parse("session_token=abc123; Path=/; HttpOnly; Secure; SameSite=Lax"))

    @Test fun clearedByEmptyValueOrMaxAge() {
        assertEquals(SessionCookieUpdate.Cleared, SessionCookieParser.parse("session_token=; Path=/; Max-Age=0"))
        assertEquals(SessionCookieUpdate.Cleared, SessionCookieParser.parse("session_token=abc; Path=/; Max-Age=-1"))
        assertEquals(SessionCookieUpdate.Cleared, SessionCookieParser.parse("session_token=abc; Expires=Thu, 01 Jan 1970 00:00:00 GMT"))
    }

    @Test fun foldedHeaderWithExpiresComma() {
        val header = "csrf_token=x; Path=/; Expires=Wed, 21 Oct 2099 07:28:00 GMT, session_token=newtoken; Path=/; Expires=Wed, 21 Oct 2099 07:28:00 GMT; HttpOnly"
        assertEquals(SessionCookieUpdate.Set("newtoken"), SessionCookieParser.parse(header))
        assertEquals(2, SessionCookieParser.split(header).size)
    }

    @Test fun otherCookiesIgnored() {
        assertNull(SessionCookieParser.parse("csrf_token=x; Path=/"))
        assertNull(SessionCookieParser.parse(null))
        assertNull(SessionCookieParser.parse("my_session_token=x"))
    }

    @Test fun jsonTokenAndClientCapture() {
        assertEquals("t1", APIClient.jsonSessionToken("""{"state":"COMPLETE","session_token":"t1"}""".toByteArray()))
        assertNull(APIClient.jsonSessionToken("""{"session_token":""}""".toByteArray()))
        assertNull(APIClient.jsonSessionToken("[]".toByteArray()))

        val store = TokenStore.inMemory()
        val dir = File(System.getProperty("java.io.tmpdir"), "sdy-test-" + System.nanoTime())
        val client = APIClient(store, OfflineCache(dir), null)
        val path = "/api/v1/auth/switch-tenant"
        client.captureToken(200, "session_token=fromcookie; Path=/", "{}".toByteArray(), sentToken = null, requestPath = path)
        assertEquals("fromcookie", store.token)
        // JSON wins over the cookie.
        client.captureToken(200, "session_token=fromcookie; Path=/", """{"session_token":"fromjson"}""".toByteArray(), sentToken = "fromcookie", requestPath = path)
        assertEquals("fromjson", store.token)
        // A late answer cleared for an older token leaves the current one alone…
        client.captureToken(200, "session_token=; Max-Age=0", ByteArray(0), sentToken = "older", requestPath = path)
        assertEquals("fromjson", store.token)
        // …and a late cookie does not overwrite it either.
        client.captureToken(200, "session_token=fromcookie; Path=/", "{}".toByteArray(), sentToken = "older", requestPath = path)
        assertEquals("fromjson", store.token)
        client.captureToken(200, "session_token=; Max-Age=0", ByteArray(0), sentToken = "fromjson", requestPath = path)
        assertNull(store.token)
        dir.deleteRecursively()
    }

    @Test fun tokenStoreCompareAndClear() {
        val store = TokenStore.inMemory()
        store.save("new")
        assertFalse(store.clear(ifStill = "old"))
        assertEquals("new", store.token)
        assertFalse(store.clear(ifStill = null))
        assertTrue(store.clear(ifStill = "new"))
        assertNull(store.token)
    }
}

class StaleTokenTest {
    private fun client(store: TokenStore, answer: (String) -> Pair<Int, String>): APIClient {
        val http = okhttp3.OkHttpClient.Builder().addInterceptor { chain ->
            val (status, body) = answer(chain.request().header("Authorization") ?: "")
            okhttp3.Response.Builder().request(chain.request()).protocol(okhttp3.Protocol.HTTP_1_1)
                .code(status).message("x").body(okhttp3.ResponseBody.create(null, body)).build()
        }.build()
        return APIClient(store, OfflineCache(File(System.getProperty("java.io.tmpdir"), "sdy-stale-" + System.nanoTime())), null, http)
    }

    /**
     * A branch switch revokes the old token at once. A request that went out
     * with it and comes back 401 must not sign the member out of the new
     * session: it is sent again with the new token.
     */
    @Test fun requestWithReplacedTokenRetriesInsteadOfSigningOut() = kotlinx.coroutines.runBlocking {
        val store = TokenStore.inMemory()
        store.save("old")
        val seen = mutableListOf<String>()
        val api = client(store) { auth ->
            seen += auth
            if (auth == "Bearer old") {
                // The switch lands while this request is on the wire.
                store.save("new")
                401 to """{"error":"session revoked"}"""
            } else 200 to """{"ok":true}"""
        }
        var ended = false
        api.onSessionEnded = { ended = true }
        api.raw(HTTPMethod.GET, "/me/notifications")
        assertEquals(listOf("Bearer old", "Bearer new"), seen)
        assertEquals("new", store.token)
        assertFalse(ended)
    }

    /** A 401 for the token still in use is a real end of the session. */
    @Test fun requestWithCurrentTokenSignsOutOn401() = kotlinx.coroutines.runBlocking {
        val store = TokenStore.inMemory()
        store.save("only")
        val api = client(store) { 401 to "" }
        var ended = false
        api.onSessionEnded = { ended = true }
        try {
            api.raw(HTTPMethod.GET, "/me/notifications")
            fail("expected 401")
        } catch (e: APIError) {
            assertEquals(APIError.Kind.Unauthorized, e.kind)
        }
        assertTrue(ended)
        assertNull(store.token)
    }
}

/**
 * Every path the server writes into registry.member_notifications
 * (migrations 00112, 00113, 00119; membership 00002; events 00002–00004)
 * leads somewhere real in the app.
 */
class NotificationTargetTest {
    @Test fun serverPaths() {
        val event = "3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61"
        val tenant = "9a8b7c6d-0000-4000-8000-000000000001"
        assertEquals(NotificationTarget.Event(event, tenant), LinkParser.notificationTarget("/module/events/$event?workspace=$tenant"))
        assertEquals(NotificationTarget.Event(event, tenant), LinkParser.notificationTarget("/module/events/$event?workspace=$tenant#discussion"))
        assertEquals(NotificationTarget.Event(event, tenant), LinkParser.notificationTarget("/module/events/$event?workspace=$tenant#tasks"))
        assertEquals(NotificationTarget.Screen(HomeRoute.History), LinkParser.notificationTarget("/member/history"))
        assertEquals(NotificationTarget.Screen(HomeRoute.Record), LinkParser.notificationTarget("/member/record"))
        assertEquals(NotificationTarget.Screen(HomeRoute.Participation), LinkParser.notificationTarget("/member/participation"))
        assertEquals(NotificationTarget.Home, LinkParser.notificationTarget("/member"))
    }

    @Test fun otherPaths() {
        assertEquals(NotificationTarget.TabTarget(AppModel.Tab.Dues), LinkParser.notificationTarget("/member/dues"))
        assertEquals(NotificationTarget.TabTarget(AppModel.Tab.Checkin), LinkParser.notificationTarget("/member/check-in"))
        assertEquals(NotificationTarget.Screen(HomeRoute.History), LinkParser.notificationTarget("/member/history/"))
        assertEquals(NotificationTarget.Screen(HomeRoute.Record), LinkParser.notificationTarget("/member/record?x=1#top"))
        assertEquals(NotificationTarget.None, LinkParser.notificationTarget(""))
        assertEquals(NotificationTarget.None, LinkParser.notificationTarget("/settings"))
        assertEquals(NotificationTarget.None, LinkParser.notificationTarget("https://evil.example/member"))
    }
}

class DeepLinkTest {
    private fun link(s: String) = LinkParser.deepLink(LinkParser.parse(s)!!)

    @Test fun eidLoginCallback() =
        assertEquals(DeepLink.EidCallback("abc", null, forApp = true), link("https://e-sdy.mn/auth/eid/callback?app=android&sessionId=abc"))

    @Test fun webSignInCallbackIsNotTheApps() {
        // Same path without app=android: the browser's sign-in, handed back to the browser.
        assertEquals(DeepLink.EidCallback("abc", null, forApp = false), link("https://e-sdy.mn/auth/eid/callback?sessionId=abc"))
        assertEquals(false, (link("https://e-sdy.mn/auth/eid/callback?app=ios&sessionId=abc") as DeepLink.EidCallback).forApp)
    }

    @Test fun voteCallbackWithReturn() {
        val back = (link("https://e-sdy.mn/auth/eid/callback?app=android&return=%2Fmodule%2Fevents%2F3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61") as DeepLink.EidCallback).returnPath
        assertEquals("/module/events/3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61", back)
        assertEquals("3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61", LinkParser.eventPath(back!!)?.first)
    }

    @Test fun unsafeReturnIsDropped() =
        assertEquals(DeepLink.EidCallback(null, null, forApp = false), link("https://e-sdy.mn/auth/eid/callback?return=%2F%2Fevil.com"))

    @Test fun checkinLink() {
        val token = "0f".repeat(24)
        assertEquals(
            DeepLink.CheckIn(CheckinCode("3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61", token)),
            link("https://e-sdy.mn/member/check-in#event=3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61&token=$token"),
        )
    }

    @Test fun foreignLinksIgnored() {
        assertNull(link("https://example.com/auth/eid/callback"))
        assertNull(link("https://e-sdy.mn/member"))
    }

    @Test fun notificationEventPath() {
        assertEquals("t-2", LinkParser.eventPath("/module/events/3f6c2a10-8b1e-4c55-9a8e-1d2f3a4b5c61?workspace=t-2")?.second)
        assertNull(LinkParser.eventPath("/member/dues"))
    }

    @Test fun callbackURL() {
        assertEquals("https://e-sdy.mn/auth/eid/callback?app=android", AppConfig.eidCallbackURL())
        assertTrue(AppConfig.eidCallbackURL(returnPath = "/module/events/x").contains("return=/module/events/x"))
    }
}

class FormattingTest {
    @Test fun money() {
        assertEquals("1,250,000₮", Formatters.money(1_250_000.0))
        assertEquals("0₮", Formatters.money(0.0))
        assertEquals("1,000₮", Formatters.money(999.6))
    }

    @Test fun dateInUlaanbaatar() {
        assertEquals("2026-10-26 18:30", Formatters.dateTime("2026-10-26T10:30:00Z"))
        assertEquals("2026-10-26 18:30", Formatters.dateTime("2026-10-26T10:30:00.123Z"))
        assertEquals("—", Formatters.dateTime("garbage"))
        assertEquals("2026-10-25", Formatters.day("2026-10-25"))
    }

    @Test fun relative() {
        val now = Formatters.parseDate("2026-10-26T02:00:00Z")!! // 10:00 in Ulaanbaatar
        assertEquals("Өнөөдөр 18:30", Formatters.relative("2026-10-26T10:30:00Z", now))
        assertEquals("Маргааш 09:00", Formatters.relative("2026-10-27T01:00:00Z", now))
        assertEquals("Өчигдөр 09:00", Formatters.relative("2026-10-25T01:00:00Z", now))
        assertEquals("3 өдрийн дараа · 09:00", Formatters.relative("2026-10-29T01:00:00Z", now))
        assertEquals("2026-12-01 09:00", Formatters.relative("2026-12-01T01:00:00Z", now))
    }

    @Test fun clockAndPoints() {
        assertEquals("4:59", Formatters.clock(299))
        assertEquals("0:00", Formatters.clock(-5))
        assertEquals("10 оноо", Formatters.points(10.0))
    }

    @Test fun duesMath() {
        assertEquals(33, DuesMath.percent(1.0, 3.0))
        assertEquals(100, DuesMath.percent(5.0, 0.0))
        assertEquals(5001.0, DuesMath.partAmount(10001.0, 2), 0.0)
        assertEquals(listOf(1, 2, 3), DuesMath.partChoices(3.0))
        assertEquals(listOf(1), DuesMath.partChoices(1.0))
    }
}

class ErrorTextTest {
    @Test fun knownMessagesBecomeMongolian() {
        assertEquals("Арга хэмжээний хүний тоо дүүрсэн байна.", APIError(APIError.Kind.Server(409), "this event is full").message)
        assertTrue(APIError(APIError.Kind.Server(409), "the check-in code is invalid or expired").message.contains("хүчингүй"))
        assertTrue(APIError(APIError.Kind.Server(409), "you have already voted on this issue").message.contains("аль хэдийн санал"))
        assertEquals("Өөр шилжих хүсэлт шийдвэр хүлээж байна.", APIError(APIError.Kind.Server(409), "transfer_already_pending").message)
    }

    @Test fun unknownEnglishNeverShown() {
        assertFalse(APIError(APIError.Kind.Server(500), "could not frobnicate the widget").message.contains("frobnicate"))
        assertEquals(ErrorText.network, APIError.network.message)
        assertTrue(APIError.network.message.startsWith("Холболт тасарсан"))
        for (status in listOf(400, 401, 403, 404, 409, 429, 502, 500, 418)) {
            val m = APIError(APIError.Kind.Server(status), "Something English").message
            assertFalse("$status: $m", Regex("[A-Za-z]{4,}").containsMatchIn(m))
        }
    }
}

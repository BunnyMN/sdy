package mn.esdy.member.core

import android.content.Context
import java.time.Instant
import java.time.format.DateTimeFormatter
import org.json.JSONObject

/**
 * DEBUG-only stand-in for the backend: the `SDYFixtures` launch extra makes
 * every request answer from the JSON files in src/debug/assets/fixtures (the
 * iOS app's Resources/Fixtures), so each screen can be seen without a
 * network or an account. Release builds carry no fixture files.
 *
 * Dates in fixtures are written relative to now as `@D(+2,18:30)` (days,
 * Ulaanbaatar wall time) so upcoming events stay upcoming.
 */
class FixtureRouter(private val context: Context) {
    var variant: String = AppConfig.launchArgument("SDYFixtureVariant") ?: ""

    fun respond(method: HTTPMethod, path: String, @Suppress("UNUSED_PARAMETER") body: Map<String, Any?>?): ByteArray {
        val clean = path.substringBefore("?")
        val p = clean.split("/").filter { it.isNotEmpty() }
        fun text(s: String) = s.toByteArray()
        val get = method == HTTPMethod.GET
        return when {
            get && p == listOf("auth", "me") -> file("me")
            get && p == listOf("profile") -> file("profile")
            get && p == listOf("profile", "deletion-request") -> text("""{"status":"none"}""")
            get && p == listOf("profile", "photo") -> throw APIError(APIError.Kind.Server(404), "no photo")
            (method == HTTPMethod.PUT || method == HTTPMethod.DELETE) && p == listOf("profile", "photo") -> text("{}")
            get && p == listOf("me", "branches") -> file("branches")
            get && p == listOf("me", "member-record") -> file(if (variant == "nobranch") "member_record_none" else "member_record")
            get && p == listOf("auth", "tenants") -> file("tenants")
            get && p == listOf("me", "items") -> file(if (variant == "nobranch") "items" else "items_empty")
            get && p == listOf("me", "transfers") -> file("transfers")
            get && p == listOf("me", "notifications") -> file("notifications")
            get && p == listOf("me", "participation-history") -> file("participation_history")
            get && p == listOf("me", "dues-history") -> file("dues_history")
            get && p == listOf("events") -> file("events")
            get && p == listOf("events", "mine") -> file("events_mine")
            get && p == listOf("events", "points") -> file("points")
            get && p == listOf("events", "leaderboard") -> file("leaderboard")
            get && p == listOf("events", "blocks") ->
                text("""{"blocked":[{"user_id":"u-9","name":"Жишээ Гишүүн","blocked_at":"2026-11-01T10:00:00Z"}]}""")
            get && p == listOf("events", "sanctions", "mine") -> text("""{"sanctions":[]}""")
            get && p == listOf("events", "sanctions") -> text("""{"sanctions":[]}""")
            get && p == listOf("events", "members") -> text("""{"members":[{"user_id":"u-2","name":"Б. Тэмүүлэн","email":"t@example.mn"}]}""")
            get && p.size == 2 && p[0] == "events" -> event(p[1])
            get && p.size == 3 && p[0] == "events" && p[2] == "motions" -> file("motions")
            get && p.size == 3 && p[0] == "events" && p[2] == "tasks" -> file("tasks")
            get && p.size == 3 && p[0] == "events" && p[2] == "attendance" -> file("participants")
            get && p == listOf("dues", "settings") -> file("dues_settings")
            get && p == listOf("dues", "mine") -> file("dues_mine")
            get && p == listOf("dues", "finance") -> text("""{"charges":[],"payments":[],"totals":{"charged":0,"received":0,"outstanding":0,"waived":0}}""")
            get && p == listOf("membership", "members") -> text("""{"members":[]}""")
            get && p == listOf("membership", "positions") -> text("""{"can_assign":true}""")
            method == HTTPMethod.POST && (p == listOf("auth", "eid", "start") || p == listOf("auth", "eid", "start-id")) -> file("eid_start")
            method == HTTPMethod.POST && p == listOf("auth", "eid", "poll") -> text("""{"state":"COMPLETE","session_token":"fixture-token"}""")
            method == HTTPMethod.POST && p == listOf("auth", "login") -> text("""{"expires_at":"2030-01-01T00:00:00Z","session_token":"fixture-token"}""")
            method == HTTPMethod.POST && p == listOf("auth", "switch-tenant") -> text("""{"tenant_id":"t-1","switched":true,"session_token":"fixture-token"}""")
            method == HTTPMethod.POST && p.lastOrNull() == "check-in" -> text("""{"status":"attended","changed":true,"points":10}""")
            method == HTTPMethod.POST && p.lastOrNull() == "check-in-code" -> text("""{"token":"${"ab".repeat(24)}","expires_at":"2030-01-01T00:00:00Z"}""")
            method == HTTPMethod.POST && p.lastOrNull() == "register" -> text("""{"status":"registered","changed":true}""")
            method == HTTPMethod.DELETE && p.lastOrNull() == "register" -> text("""{"status":"","changed":true}""")
            method == HTTPMethod.POST && p.lastOrNull() == "vote" -> text("""{"session_id":"vote-fixture","verification_code":"4821","state":"signing"}""")
            method == HTTPMethod.POST && p.lastOrNull() == "poll" && "vote" in p -> text("""{"state":"signed","points":5}""")
            method != HTTPMethod.GET -> text("""{"ok":true,"id":"fixture","changed":true}""")
            else -> throw APIError(APIError.Kind.Server(404), "no fixture")
        }
    }

    private fun event(id: String): ByteArray {
        val events = JSONObject(String(file("events"))).optJSONArray("events")
        for (i in 0 until (events?.length() ?: 0)) {
            val e = events!!.getJSONObject(i)
            if (e.optString("id") == id) return e.toString().toByteArray()
        }
        throw APIError(APIError.Kind.Server(404), "no such event")
    }

    fun file(name: String): ByteArray {
        val raw = try {
            context.assets.open("fixtures/$name.json").bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            throw APIError(APIError.Kind.Server(404), "no fixture $name")
        }
        return expandDates(raw).toByteArray()
    }

    companion object {
        fun expandDates(raw: String, now: Instant = Instant.now()): String {
            val regex = Regex("""@D\(([+-]?\d+),(\d{2}):(\d{2})\)""")
            return regex.replace(raw) { m ->
                val days = m.groupValues[1].toLong()
                val hour = m.groupValues[2].toInt()
                val minute = m.groupValues[3].toInt()
                val date = now.atZone(Formatters.zone).toLocalDate().plusDays(days).atTime(hour, minute).atZone(Formatters.zone)
                DateTimeFormatter.ISO_INSTANT.format(date.toInstant())
            }
        }
    }
}

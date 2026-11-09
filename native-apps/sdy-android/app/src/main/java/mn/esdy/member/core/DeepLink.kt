package mn.esdy.member.core

import java.util.UUID
import mn.esdy.member.app.AppModel
import mn.esdy.member.app.HomeRoute

/**
 * A check-in code as printed in the organiser's QR:
 * https://e-sdy.mn/member/check-in#event=<uuid>&token=<48 hex>
 */
data class CheckinCode(val eventId: String, val token: String) {
    val id: String get() = eventId + token
}

sealed interface DeepLink {
    /**
     * eID returned to the app. A login carries a session id; a vote carries
     * the path it started on. `forApp` is false when the link belongs to the
     * web sign-in (no `app=android`) and only reached the app because Android
     * cannot match App Links on the query before Android 15.
     */
    data class EidCallback(val sessionId: String?, val returnPath: String?, val forApp: Boolean = true) : DeepLink
    data class CheckIn(val code: CheckinCode) : DeepLink
}

/** Where a notification leads inside the app. */
sealed interface NotificationTarget {
    /** An event (in `workspace`, when the link names a branch). */
    data class Event(val id: String, val workspace: String?) : NotificationTarget
    data class TabTarget(val tab: AppModel.Tab) : NotificationTarget
    data class Screen(val route: HomeRoute) : NotificationTarget
    /** Нүүр itself — where join and transfer decisions show. */
    data object Home : NotificationTarget
    /** Nothing more to open than the notification itself. */
    data object None : NotificationTarget
}

object LinkParser {
    private val tokenPattern = Regex("^[a-f0-9]{48}$")

    fun isAllowedHost(host: String?): Boolean {
        val h = host?.lowercase() ?: return false
        return h == AppConfig.host || h == "www." + AppConfig.host
    }

    private fun isUUID(value: String): Boolean =
        value.length == 36 && try { UUID.fromString(value); true } catch (e: Exception) { false }

    /**
     * Reads a scanned QR or opened link. Anything that is not exactly an
     * e-sdy.mn check-in link answers null.
     */
    fun checkin(string: String): CheckinCode? = parse(string.trim())?.let { checkin(it) }

    fun checkin(url: ParsedURL): CheckinCode? {
        if (url.scheme?.lowercase() != "https" || !isAllowedHost(url.host)) return null
        val path = url.path.removeSuffix("/")
        if (path != "/member/check-in") return null
        // Parameters ride in the fragment so they never reach server logs;
        // accept the query too for robustness.
        val source = url.fragment ?: url.query ?: ""
        val params = mutableMapOf<String, String>()
        for (pair in source.split("&")) {
            val kv = pair.split("=", limit = 2)
            if (kv.size != 2) continue
            params[kv[0]] = decode(kv[1])
        }
        val event = params["event"] ?: return null
        val token = params["token"] ?: return null
        if (!isUUID(event) || !tokenPattern.matches(token)) return null
        return CheckinCode(event.lowercase(), token)
    }

    fun deepLink(url: ParsedURL): DeepLink? {
        checkin(url)?.let { return DeepLink.CheckIn(it) }
        if (url.scheme?.lowercase() != "https" || !isAllowedHost(url.host)) return null
        if (url.path.removeSuffix("/") != "/auth/eid/callback") return null
        fun value(name: String) = url.queryItems.firstOrNull { it.first == name }?.second?.takeIf { it.isNotEmpty() }
        val session = value("sessionId") ?: value("session_id")
        var back = value("return")
        if (back != null && !(back.startsWith("/") && !back.startsWith("//") && !back.startsWith("/\\"))) back = null
        return DeepLink.EidCallback(session, back, forApp = value("app") == "android")
    }

    /**
     * A notification's `path` (registry.member_notifications, the same links
     * the web opens) → the screen in this app. The server sends:
     * `/module/events/<uuid>?workspace=<tenant>[#discussion|#tasks]`,
     * `/member/history` (dues, payments, attendance), `/member/record`
     * (membership status, positions), `/member/participation` (points) and
     * `/member` (join and transfer decisions).
     */
    fun notificationTarget(path: String): NotificationTarget {
        eventPath(path)?.let { return NotificationTarget.Event(it.first, it.second) }
        var trimmed = path.split('?', '#').firstOrNull() ?: ""
        while (trimmed.length > 1 && trimmed.endsWith("/")) trimmed = trimmed.dropLast(1)
        return when (trimmed) {
            "/member", "/member/overview" -> NotificationTarget.Home
            "/member/history" -> NotificationTarget.Screen(HomeRoute.History)
            "/member/record" -> NotificationTarget.Screen(HomeRoute.Record)
            "/member/participation" -> NotificationTarget.Screen(HomeRoute.Participation)
            "/member/leaderboard" -> NotificationTarget.Screen(HomeRoute.Leaderboard)
            "/member/transfers" -> NotificationTarget.Screen(HomeRoute.Transfers)
            "/member/dues" -> NotificationTarget.TabTarget(AppModel.Tab.Dues)
            "/member/check-in" -> NotificationTarget.TabTarget(AppModel.Tab.Checkin)
            else -> NotificationTarget.None
        }
    }

    /** `/module/events/<uuid>` (optionally `?workspace=<tenant>`) → (event, tenant). */
    fun eventPath(path: String): Pair<String, String?>? {
        val url = parse(if (path.startsWith("/")) "https://${AppConfig.host}$path" else path) ?: return null
        val parts = url.path.split("/").filter { it.isNotEmpty() }
        if (parts.size < 3 || parts[0] != "module" || parts[1] != "events" || !isUUID(parts[2])) return null
        return parts[2] to url.queryItems.firstOrNull { it.first == "workspace" }?.second
    }

    /**
     * A URL split into its parts without android.net.Uri, so the parsing is
     * the same in unit tests and on the phone.
     */
    data class ParsedURL(val scheme: String?, val host: String?, val path: String, val query: String?, val fragment: String?) {
        val queryItems: List<Pair<String, String>>
            get() = (query ?: "").split("&").filter { it.isNotEmpty() }.map {
                val kv = it.split("=", limit = 2)
                decode(kv[0]) to decode(kv.getOrElse(1) { "" })
            }
    }

    fun parse(raw: String): ParsedURL? = try {
        val uri = java.net.URI(raw)
        ParsedURL(uri.scheme, uri.host, uri.rawPath ?: "", uri.rawQuery, uri.rawFragment)
    } catch (e: Exception) {
        null
    }

    private fun decode(s: String): String = try { java.net.URLDecoder.decode(s, "UTF-8") } catch (e: Exception) { s }
}

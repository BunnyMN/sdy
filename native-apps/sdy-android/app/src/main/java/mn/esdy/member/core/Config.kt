package mn.esdy.member.core

import mn.esdy.member.BuildConfig

/**
 * Fixed addresses of the SDY deployment. The app talks to exactly one
 * backend — the same one the web PWA (frontend/) and the iOS app use.
 */
object AppConfig {
    const val host = "e-sdy.mn"
    const val webOrigin = "https://e-sdy.mn"
    const val apiBase = "https://e-sdy.mn/api/v1"
    const val websiteURL = "https://e-sdy.mn"
    const val privacyURL = "https://e-sdy.mn/privacy"
    const val supportURL = "https://e-sdy.mn/support"
    const val eidStoreURL = "https://play.google.com/store/search?q=eID%20Mongolia&c=apps"
    const val sessionCookieName = "session_token"

    /**
     * Where eID returns the citizen after approving in the eID app. The path
     * is an App Link (assetlinks.json), so it reopens this app; `app=android`
     * tells it apart from the web sign-in on the same path.
     */
    fun eidCallbackURL(returnPath: String? = null): String {
        var url = "https://$host/auth/eid/callback?app=android"
        // Like iOS URLComponents: the path's slashes stay as they are.
        if (returnPath != null) url += "&return=" + enc(returnPath).replace("%2F", "/")
        return url
    }

    val appVersion: String get() = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

    /**
     * DEBUG-only launch options, read from the launching intent's extras
     * (iOS: launch arguments). `adb shell am start -n mn.esdy.member/.MainActivity
     * --ez SDYFixtures true --es SDYTab events`.
     */
    @Volatile var launchArguments: Map<String, String> = emptyMap()

    val fixturesEnabled: Boolean get() = BuildConfig.DEBUG && launchArguments["SDYFixtures"] == "true"

    fun launchArgument(name: String): String? = if (BuildConfig.DEBUG) launchArguments[name] else null
}

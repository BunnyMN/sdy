package mn.esdy.member.core

import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * What a response's Set-Cookie header says about the session cookie.
 *
 * The app never stores cookies (the session is a bearer token), but the
 * server still rotates the session through Set-Cookie on some answers, so
 * every response is read for it.
 */
sealed interface SessionCookieUpdate {
    data class Set(val token: String) : SessionCookieUpdate
    data object Cleared : SessionCookieUpdate
}

object SessionCookieParser {
    /**
     * Parses one or more Set-Cookie headers (possibly folded into one
     * comma-joined string) and returns the last statement about `name`, or
     * null when the header does not mention it.
     */
    fun parse(header: String?, name: String = AppConfig.sessionCookieName, nowEpochSeconds: Long = System.currentTimeMillis() / 1000): SessionCookieUpdate? {
        if (header.isNullOrEmpty()) return null
        var result: SessionCookieUpdate? = null
        for (cookie in split(header)) {
            val parts = cookie.split(";").map { it.trim() }
            val first = parts.firstOrNull() ?: continue
            val eq = first.indexOf('=')
            if (eq < 0) continue
            if (first.substring(0, eq).trim() != name) continue
            var value = first.substring(eq + 1).trim()
            if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) value = value.substring(1, value.length - 1)
            var expired = false
            for (attribute in parts.drop(1)) {
                val pair = attribute.split("=", limit = 2).map { it.trim() }
                val key = pair.firstOrNull()?.lowercase() ?: continue
                val attrValue = if (pair.size > 1) pair[1] else ""
                if (key == "max-age") attrValue.toIntOrNull()?.let { if (it <= 0) expired = true }
                if (key == "expires") parseExpires(attrValue)?.let { if (it <= nowEpochSeconds) expired = true }
            }
            result = if (value.isEmpty() || expired) SessionCookieUpdate.Cleared else SessionCookieUpdate.Set(value)
        }
        return result
    }

    /**
     * Splits a folded header on the commas that start a new cookie, not the
     * one inside an `Expires=Wed, 21 Oct 2026 …` date.
     */
    fun split(header: String): List<String> {
        val cookies = mutableListOf<String>()
        val current = StringBuilder()
        var i = 0
        while (i < header.length) {
            val c = header[i]
            if (c == ',') {
                var j = i + 1
                while (j < header.length && header[j] == ' ') j++
                var k = j
                while (k < header.length && header[k] != '=' && header[k] != ';' && header[k] != ',' && header[k] != ' ') k++
                if (k < header.length && header[k] == '=' && k > j) {
                    cookies.add(current.toString())
                    current.clear()
                    i++
                    continue
                }
            }
            current.append(c)
            i++
        }
        if (current.isNotBlank()) cookies.add(current.toString())
        return cookies.map { it.trim() }
    }

    private val expiresFormat = DateTimeFormatter.ofPattern("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US)

    private fun parseExpires(value: String): Long? = try {
        ZonedDateTime.parse(value, expiresFormat).toEpochSecond()
    } catch (e: Exception) {
        try { ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toEpochSecond() } catch (e: Exception) { null }
    }
}

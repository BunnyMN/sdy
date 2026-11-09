package mn.esdy.member.core

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.serializer
import mn.esdy.member.BuildConfig
import mn.esdy.member.models.ApiJson
import mn.esdy.member.models.EmptyResponse
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject

enum class HTTPMethod { GET, POST, PUT, DELETE }

/**
 * The only door to the backend.
 *
 * The session is a bearer token: OkHttp here never stores or sends cookies,
 * every request carries `Authorization: Bearer …` and
 * `X-Session-Transport: bearer`. A token arrives in the JSON `session_token`
 * field of sign-in / switch-tenant answers, or — as a fallback, on any
 * answer — in a `session_token` Set-Cookie, which is also how the server
 * rotates or ends a session.
 */
class APIClient(
    val tokens: TokenStore,
    val cache: OfflineCache,
    private val context: Context?,
    /** Tests hand in a client whose interceptor plays the server. */
    http: OkHttpClient? = null,
) {

    /** Branch the cached answers belong to. Set from /auth/me. */
    @Volatile var cacheScope: String = "none"

    /** Called on the main thread when the server says the session is gone. */
    var onSessionEnded: (() -> Unit)? = null
    /** Called on the main thread with whether the last request reached the server. */
    var onReachability: ((Boolean) -> Unit)? = null

    /** DEBUG-only: answers from bundled JSON instead of the network. */
    var fixtures: FixtureRouter? = null

    private val client = http ?: OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val main: Handler? = Looper.getMainLooper()?.let { Handler(it) }

    // region Public API

    /**
     * GET with offline fallback: a failure to reach the server answers with
     * the last good copy for this branch, if there is one.
     */
    suspend inline fun <reified T> get(path: String, cached: Boolean = true): T {
        try {
            val data = raw(HTTPMethod.GET, path)
            val value = decode<T>(data)
            if (cached) cache.save(data, scope(path), path)
            return value
        } catch (error: APIError) {
            if (error.isNetwork && cached) {
                val data = cache.load(scope(path), path)
                if (data != null) {
                    try { return decode<T>(data) } catch (_: APIError) {}
                }
            }
            throw error
        }
    }

    /**
     * Who a cached answer belongs to: the person (identity, membership,
     * notifications) or the branch currently acted in (events, dues).
     */
    fun scope(path: String): String =
        if (path.startsWith("/auth/") || path.startsWith("/profile") || path.startsWith("/me/")) "user" else "tenant-$cacheScope"

    suspend inline fun <reified T> send(
        method: HTTPMethod,
        path: String,
        body: Map<String, Any?>? = null,
        timeoutSeconds: Long = 30,
        signsOutOn401: Boolean = true,
    ): T = decode(raw(method, path, body, timeoutSeconds = timeoutSeconds, signsOutOn401 = signsOutOn401))

    suspend fun perform(method: HTTPMethod, path: String, body: Map<String, Any?>? = null) {
        raw(method, path, body)
    }

    inline fun <reified T> decode(data: ByteArray): T {
        if (T::class == EmptyResponse::class) return EmptyResponse() as T
        return try {
            val text = if (data.isEmpty()) "{}" else String(data, Charsets.UTF_8)
            ApiJson.decodeFromString(serializer<T>(), text)
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.w("APIClient", "Decoding ${T::class.simpleName} failed: $e")
            throw APIError.decoding
        }
    }

    // endregion

    // region Transport

    suspend fun raw(
        method: HTTPMethod,
        path: String,
        body: Map<String, Any?>? = null,
        upload: Pair<ByteArray, String>? = null,
        timeoutSeconds: Long = 30,
        signsOutOn401: Boolean = true,
    ): ByteArray = try {
        transmit(method, path, body, upload, timeoutSeconds, signsOutOn401)
    } catch (e: StaleToken) {
        // The token this request carried was replaced while it was in flight
        // (a branch switch revokes the old one at once). The server turned it
        // away before acting, so once more with the current one.
        try {
            transmit(method, path, body, upload, timeoutSeconds, signsOutOn401)
        } catch (e: StaleToken) {
            throw APIError(APIError.Kind.Unauthorized)
        }
    }

    /** A 401 for a token that is no longer the current one. */
    private class StaleToken : Exception()

    private suspend fun transmit(
        method: HTTPMethod,
        path: String,
        body: Map<String, Any?>?,
        upload: Pair<ByteArray, String>?,
        timeoutSeconds: Long,
        signsOutOn401: Boolean,
    ): ByteArray {
        fixtures?.let {
            delay(150)
            // Sign-in answers carry a token here too, so the sign-in screens work end to end.
            return it.respond(method, path, body).also { data -> jsonSessionToken(data)?.let(tokens::save) }
        }

        val builder = Request.Builder().url(AppConfig.apiBase + path)
            .header("Accept", "application/json")
            .header("Accept-Language", "mn")
            .header("X-Session-Transport", "bearer")
            .header("X-Client", "SDYMember-Android/${AppConfig.appVersion}")
        // The token this request goes out with: whatever the answer says about
        // the session is about this token, which may be stale by then.
        val sentToken = tokens.token?.takeIf { it.isNotEmpty() }
        val hadToken = sentToken != null
        sentToken?.let { builder.header("Authorization", "Bearer $it") }

        val requestBody = when {
            upload != null -> upload.first.toRequestBody(upload.second.toMediaType())
            body != null -> JSONObject(body).toString().toRequestBody(JSON)
            method != HTTPMethod.GET -> "{}".toRequestBody(JSON)
            else -> null
        }
        builder.method(method.name, requestBody)

        val call = client.newCall(builder.build())
        call.timeout().timeout(timeoutSeconds, TimeUnit.SECONDS)

        val (status, data, setCookie, requestPath) = try {
            call.await()
        } catch (e: IOException) {
            val wrapped = if (call.isCanceled()) APIError.cancelled else APIError.network
            if (wrapped.isNetwork) notifyReachability(false)
            throw wrapped
        }
        notifyReachability(true)

        captureToken(status, setCookie, data, sentToken, requestPath)

        if (status == 401) {
            if (hadToken && tokens.token != sentToken) throw StaleToken()
            if (signsOutOn401 && hadToken && tokens.clear(ifStill = sentToken)) notifySessionEnded()
            val (message, code) = errorBody(data)
            throw APIError(APIError.Kind.Unauthorized, message, code)
        }
        if (status !in 200..299) {
            val (message, code) = errorBody(data)
            throw APIError(APIError.Kind.Server(status), message, code)
        }
        return data
    }

    /**
     * Reads a new token from the answer: the JSON field wins over the cookie.
     * A cookie that rotates or clears the session only counts while the token
     * the request carried is still the current one — a late answer from
     * before a branch switch must not drop or overwrite the new token.
     */
    fun captureToken(status: Int, setCookie: String?, data: ByteArray, sentToken: String?, requestPath: String) {
        when (val update = SessionCookieParser.parse(setCookie)) {
            is SessionCookieUpdate.Set -> tokens.save(update.token, ifStill = sentToken)
            SessionCookieUpdate.Cleared -> if (sentToken != null && tokens.clear(ifStill = sentToken)) {
                // A cleared cookie on a successful answer ends the session;
                // a logout call expects it and handles sign-out itself.
                if (status in 200..299 && !requestPath.endsWith("/auth/logout")) notifySessionEnded()
            }
            null -> {}
        }
        jsonSessionToken(data)?.let { tokens.save(it) }
    }

    private fun notifySessionEnded() { main?.post { onSessionEnded?.invoke() } ?: onSessionEnded?.invoke() }
    private fun notifyReachability(reachable: Boolean) { main?.post { onReachability?.invoke(reachable) } ?: onReachability?.invoke(reachable) }

    // endregion

    companion object {
        private val JSON = "application/json".toMediaType()

        fun jsonSessionToken(data: ByteArray): String? {
            if (data.isEmpty() || data[0] != '{'.code.toByte()) return null
            return try {
                JSONObject(String(data, Charsets.UTF_8)).text("session_token").takeIf { it.isNotEmpty() }
            } catch (e: Exception) {
                null
            }
        }

        fun errorBody(data: ByteArray): Pair<String, String?> = try {
            val o = JSONObject(String(data, Charsets.UTF_8))
            val message = o.text("error").ifEmpty { o.text("message") }
            message to o.text("code").ifEmpty { null }
        } catch (e: Exception) {
            "" to null
        }
    }
}

/** A string field, "" when absent, null or not a string. */
private fun JSONObject.text(name: String): String = (opt(name) as? String) ?: ""

private data class Answer(val status: Int, val data: ByteArray, val setCookie: String, val path: String)

/** Runs the call off the main thread; the body is read on OkHttp's thread. */
private suspend fun Call.await(): Answer = withContext(Dispatchers.IO) {
    suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { cancel() }
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { if (cont.isActive) cont.resumeWithException(e) }
            override fun onResponse(call: Call, response: Response) {
                try {
                    val answer = response.use {
                        Answer(it.code, it.body?.bytes() ?: ByteArray(0), it.headers("Set-Cookie").joinToString(", "), it.request.url.encodedPath)
                    }
                    if (cont.isActive) cont.resume(answer)
                } catch (e: IOException) {
                    if (cont.isActive) cont.resumeWithException(e)
                }
            }
        })
    }
}

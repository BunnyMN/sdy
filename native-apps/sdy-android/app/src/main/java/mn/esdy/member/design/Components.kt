package mn.esdy.member.design

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.APIError
import mn.esdy.member.core.Haptics

/** Loads one screen's data and remembers how it went (iOS Loader<T>). */
@Stable
class Loader<T>(private val scope: CoroutineScope, private var fetch: suspend () -> T) {
    var value by mutableStateOf<T?>(null)
    var error by mutableStateOf<APIError?>(null)
    var isLoading by mutableStateOf(false)
        private set

    /** Replaces the fetch, for screens whose fetch depends on values that change. */
    fun setFetch(fetch: suspend () -> T) { this.fetch = fetch }

    suspend fun load() {
        isLoading = true
        try {
            value = fetch()
            error = null
        } catch (e: Throwable) {
            val wrapped = APIError.wrap(e)
            if (wrapped.kind != APIError.Kind.Cancelled) error = wrapped
            if (e is kotlinx.coroutines.CancellationException) throw e
        } finally {
            isLoading = false
        }
    }

    suspend fun loadIfNeeded() { if (value == null) load() }

    /** Fire-and-forget reload from a button. */
    fun reload() { scope.launch { load() } }
}

/**
 * A Loader that lives as long as the screen and loads once when it appears
 * (iOS: @StateObject Loader + .task { await loader.loadIfNeeded() }).
 */
@Composable
fun <T> rememberLoader(vararg keys: Any?, autoLoad: Boolean = true, fetch: suspend () -> T): Loader<T> {
    val scope = rememberCoroutineScope()
    val latest by rememberUpdatedState(fetch)
    val loader = remember(*keys) { Loader(scope) { latest() } }
    if (autoLoad) LaunchedEffect(loader) { loader.loadIfNeeded() }
    return loader
}

/** Skeleton → content, or an explained error with retry. */
@Composable
fun <T> LoadingView(loader: Loader<T>, skeletonRows: Int = 6, content: @Composable (T) -> Unit) {
    val value = loader.value
    val error = loader.error
    when {
        value != null -> content(value)
        error != null -> ErrorStateView(error) { loader.reload() }
        else -> SkeletonList(skeletonRows)
    }
}

/** Grey bars where a list's rows will be (iOS .redacted(reason: .placeholder)). */
@Composable
fun SkeletonList(rows: Int = 6, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(16.dp)
            .background(Theme.groupedCell, RoundedCornerShape(12.dp))
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clearAndSetSemantics { contentDescription = "Ачаалж байна" },
    ) {
        repeat(rows) { i ->
            Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.width(200.dp).height(15.dp).background(Theme.fill, RoundedCornerShape(4.dp)))
                Box(Modifier.width(150.dp).height(12.dp).background(Theme.fill, RoundedCornerShape(4.dp)))
            }
            if (i < rows - 1) ListDivider()
        }
    }
}

/**
 * Centred icon, title, explanation and an optional action
 * (iOS ContentUnavailableView).
 */
@Composable
fun UnavailableView(
    title: String,
    icon: ImageVector,
    message: String? = null,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(icon, null, tint = Theme.secondaryText, modifier = Modifier.size(52.dp))
        Text(title, style = SdyType.title2, color = Color.White, textAlign = TextAlign.Center)
        if (message != null) Text(message, style = SdyType.subheadline, color = Theme.secondaryText, textAlign = TextAlign.Center)
        if (action != null) { Spacer(Modifier.height(6.dp)); action() }
    }
}

@Composable
fun ErrorStateView(error: APIError, modifier: Modifier = Modifier, retry: () -> Unit) {
    UnavailableView(
        title = if (error.isNetwork) "Холболт тасарсан" else "Мэдээллийг авч чадсангүй",
        icon = if (error.isNetwork) Icons.Rounded.WifiOff else Icons.Rounded.WarningAmber,
        message = error.message,
        modifier = modifier,
    ) { PrimaryButton("Дахин оролдох", onClick = retry) }
}

@Composable
fun EmptyStateView(
    title: String,
    icon: ImageVector,
    message: String,
    modifier: Modifier = Modifier,
    actionTitle: String? = null,
    action: (() -> Unit)? = null,
) {
    UnavailableView(title, icon, message, modifier, action = if (actionTitle != null && action != null) ({ SecondaryButton(actionTitle, onClick = action) }) else null)
}

/** Shown on every signed-in screen while the last request could not reach the server. */
@Composable
fun OfflineBanner() {
    val app = LocalApp.current
    AnimatedVisibility(app.isOffline) {
        Row(
            Modifier.fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color(0xFFFF9F0A), Color(0xFFE08600))))
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .clearAndSetSemantics { contentDescription = "Офлайн. Сүүлд хадгалсан мэдээлэл." },
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.WifiOff, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Text("Офлайн — сүүлд хадгалсан мэдээллийг харуулж байна. Өөрчлөлт хийх боломжгүй.", style = SdyType.footnote, color = Color.White)
        }
    }
}

/** An inline result message for actions (success / error). */
enum class NoticeKind { Success, Error, Info }

@Composable
fun NoticeView(text: String, kind: NoticeKind = NoticeKind.Info, modifier: Modifier = Modifier) {
    val color = when (kind) {
        NoticeKind.Success -> Theme.success
        NoticeKind.Error -> Theme.danger
        NoticeKind.Info -> Theme.secondaryText
    }
    val icon = when (kind) {
        NoticeKind.Success -> Icons.Rounded.CheckCircle
        NoticeKind.Error -> Icons.Rounded.Warning
        NoticeKind.Info -> Icons.Rounded.Info
    }
    Row(modifier.semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, null, tint = color, modifier = Modifier.size(18.dp).padding(top = 1.dp))
        Text(text, style = SdyType.subheadline, color = color)
    }
}

/** A copy-to-clipboard row with haptic and a short "Хуулагдлаа" confirmation. */
@Composable
fun CopyRow(label: String, value: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { delay(1600); copied = false } }
    Row(
        modifier.fillMaxWidth().heightIn(min = Theme.minTap)
            .pressable(0.98f, enabled = value.isNotEmpty()) {
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText(label, value))
                Haptics.success()
                copied = true
            }
            .semantics(mergeDescendants = true) { contentDescription = "$label: $value. Хуулах" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, style = SdyType.caption, color = Theme.secondaryText)
            Text(value.ifEmpty { "—" }, style = SdyType.body.copy(fontWeight = FontWeight.Medium), color = Color.White)
        }
        Crossfade(copied, label = "copied") { done ->
            if (done) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Rounded.Check, null, tint = Theme.success, modifier = Modifier.size(14.dp))
                    Text("Хуулагдлаа", style = SdyType.caption.copy(fontWeight = FontWeight.SemiBold), color = Theme.success)
                }
            } else {
                Icon(Icons.Rounded.ContentCopy, null, tint = Theme.accent, modifier = Modifier.size(20.dp))
            }
        }
    }
}

/** A two-part progress bar: verified (solid) and awaiting review (light). */
@Composable
fun DuesProgressBar(paidPercent: Int, pendingPercent: Int, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().height(8.dp).background(Theme.fill, CircleShape)
            .clearAndSetSemantics { contentDescription = "$paidPercent хувь төлөгдсөн" },
    ) {
        val paid = paidPercent.coerceIn(0, 100) / 100f
        val pending = pendingPercent.coerceIn(0, 100 - paidPercent.coerceIn(0, 100)) / 100f
        if (paid > 0) Box(Modifier.weight(paid).fillMaxSize().background(Theme.accent, if (pending == 0f && paid == 1f) CircleShape else RoundedCornerShape(topStart = 4.dp, bottomStart = 4.dp)))
        if (pending > 0) Box(Modifier.weight(pending).fillMaxSize().background(Theme.accent.copy(alpha = 0.35f)))
        val rest = 1f - paid - pending
        if (rest > 0.0001f) Spacer(Modifier.weight(rest))
    }
}


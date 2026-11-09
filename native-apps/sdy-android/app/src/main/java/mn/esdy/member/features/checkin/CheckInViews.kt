package mn.esdy.member.features.checkin

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.Apartment
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.PendingActions
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.StarOutline
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import mn.esdy.member.app.HomeRoute
import mn.esdy.member.app.LocalApp
import mn.esdy.member.app.LocalNav
import mn.esdy.member.app.Route
import mn.esdy.member.core.*
import mn.esdy.member.design.*
import mn.esdy.member.models.ActionResult
import mn.esdy.member.models.EventRecord
import mn.esdy.member.models.MyEventsPage
import mn.esdy.member.models.PointsPage
import mn.esdy.member.models.Tenant

/** The "Ирц" tab: scan a QR, then my attendance and points. */
@Composable
fun CheckInTabScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    var scanning by remember { mutableStateOf(false) }
    val loader = rememberLoader {
        coroutineScope {
            val mine = async { app.api.myEvents() }
            val points = async { app.api.points() }
            mine.await() to points.await()
        }
    }
    // A confirmed (or dismissed) check-in refreshes the list.
    var seenPending by remember { mutableStateOf(app.pendingCheckin != null) }
    LaunchedEffect(app.pendingCheckin) {
        if (app.pendingCheckin == null && seenPending) loader.load()
        seenPending = app.pendingCheckin != null
    }

    SdyListScreen(title = "Ирц", onRefresh = { loader.load() }) {
        item {
            Column(Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 64.dp)
                        .graphicsLayer { alpha = if (app.isOffline) 0.45f else 1f }
                        .background(Theme.brandRed, RoundedCornerShape(12.dp))
                        .pressable(0.98f, enabled = !app.isOffline) { scanning = true }
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                        .semantics(mergeDescendants = true) {},
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Icon(Icons.Rounded.QrCodeScanner, null, tint = Color.White, modifier = Modifier.size(36.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("QR уншуулж ирцээ батлах", style = SdyType.headline, color = Color.White)
                        Text("Арга хэмжээн дээр зохион байгуулагчийн QR-ийг уншуулна", style = SdyType.caption, color = Color.White.copy(alpha = 0.85f))
                    }
                }
                if (app.isOffline) {
                    Text("Ирц батлахад интернэт холболт шаардлагатай.", style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(start = 16.dp, top = 7.dp))
                }
            }
        }
        val value = loader.value
        val error = loader.error
        when {
            value != null -> {
                val (mine, points) = value
                item { PointsSection(points) { nav.push(Route.Home(HomeRoute.Leaderboard)) } }
                item { MineSection(mine) { app.openEvent(it) } }
                if (points.entries.isNotEmpty()) {
                    item { HistorySection(points) { nav.push(Route.Home(HomeRoute.Participation)) } }
                }
            }
            error != null -> item { ErrorStateView(error) { loader.reload() } }
            else -> item { SkeletonList(3, Modifier.padding(0.dp)) }
        }
    }

    if (scanning) {
        QRScannerScreen(onDismiss = { scanning = false }) { code -> app.pendingCheckin = code }
    }
}

@Composable
private fun PointsSection(points: PointsPage, onLeaderboard: () -> Unit) {
    ListSection {
        Column(Modifier.padding(vertical = 10.dp).semantics(mergeDescendants = true) {}) {
            Text("Нийт оноо", style = SdyType.caption, color = Theme.secondaryText)
            Text("${points.total.toInt()}", fontSize = 36.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }
        ListDivider()
        ListRow(onClick = onLeaderboard) {
            Icon(Icons.Rounded.EmojiEvents, null, tint = Theme.accent, modifier = Modifier.size(22.dp))
            Text("Тэргүүлэгчид", style = SdyType.body, color = Color.White, modifier = Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Theme.tertiaryText)
        }
    }
}

@Composable
private fun MineSection(mine: MyEventsPage, onOpen: (String) -> Unit) {
    ListSection(header = "Миний ирц") {
        if (mine.items.isEmpty()) {
            Text(
                "Одоогоор оролцооны бүртгэл алга. Арга хэмжээнд бүртгүүлж, QR-ээр ирцээ батлаарай.",
                style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp),
            )
        }
        mine.items.forEachIndexed { i, item ->
            if (i > 0) ListDivider()
            ListRow(onClick = { onOpen(item.eventId) }) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(item.title, style = SdyType.body, color = Color.White)
                    Text(Formatters.dateTime(item.startsAt), style = SdyType.caption, color = Theme.secondaryText)
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Chips.attendance(item.status)?.let { StatusChip(it) }
                    if (item.points > 0) Text("+${item.points.toInt()}", style = SdyType.caption.copy(fontWeight = FontWeight.Bold), color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun HistorySection(points: PointsPage, onAll: () -> Unit) {
    ListSection(header = "Онооны түүх") {
        points.entries.take(10).forEach { entry ->
            ListRow(Modifier.semantics(mergeDescendants = true) {}) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(entry.title, style = SdyType.body, color = Color.White)
                    Text("${Labels.pointReason(entry.reason)} · ${Formatters.dateTime(entry.createdAt)}", style = SdyType.caption, color = Theme.secondaryText)
                }
                Text("${if (entry.delta > 0) "+" else ""}${entry.delta.toInt()}", style = SdyType.body.copy(fontWeight = FontWeight.Bold), color = Color.White)
            }
            ListDivider()
        }
        ListRow(onClick = onAll) {
            Text("Бүх түүх", style = SdyType.body, color = Color.White, modifier = Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Theme.tertiaryText)
        }
    }
}

/** "Би ирсэн — батлах": confirm one scanned check-in code. */
@Composable
fun CheckInConfirmSheet(code: CheckinCode, onDismiss: () -> Unit) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var event by remember(code) { mutableStateOf<EventRecord?>(null) }
    var error by remember(code) { mutableStateOf<APIError?>(null) }
    var wrongBranch by remember(code) { mutableStateOf(false) }
    var tenants by remember(code) { mutableStateOf<List<Tenant>>(emptyList()) }
    var busy by remember(code) { mutableStateOf(false) }
    var actionError by remember(code) { mutableStateOf<String?>(null) }
    var done by remember(code) { mutableStateOf<ActionResult?>(null) }

    suspend fun load() {
        error = null; wrongBranch = false
        try {
            event = app.api.event(code.eventId)
        } catch (e: Throwable) {
            val err = APIError.wrap(e)
            if (err.status == 404 || err.status == 403) {
                wrongBranch = true
                tenants = try { app.api.tenants().tenants } catch (_: Exception) { emptyList() }
            } else {
                error = err
            }
        }
    }

    fun submit(ev: EventRecord) {
        busy = true; actionError = null
        scope.launch {
            try {
                if (ev.myStatus.isEmpty()) app.api.register(code.eventId)
                val result = app.api.checkIn(code.eventId, code.token)
                Haptics.success()
                done = result
            } catch (e: Throwable) {
                Haptics.error()
                actionError = APIError.wrap(e).message
            } finally { busy = false }
        }
    }

    fun switchAndRetry(tenant: Tenant) {
        busy = true; actionError = null
        scope.launch {
            try {
                app.switchBranch(tenant.id)
                load()
                if (wrongBranch) actionError = "Энэ салбарт ч арга хэмжээ олдсонгүй."
            } catch (e: Throwable) {
                actionError = APIError.wrap(e).message
            } finally { busy = false }
        }
    }

    LaunchedEffect(code) { load() }

    val close = { app.pendingCheckin = null; onDismiss() }
    FormSheet(title = "Ирцээ бүртгүүлэх", onDismiss = close, cancelTitle = if (done == null) "Болих" else "Хаах") {
        item {
            Column(
                Modifier.fillMaxWidth().padding(8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                val ev = event
                val d = done
                val err = error
                when {
                    d != null -> Success(d, ev, close)
                    wrongBranch -> BranchMismatch(app.me?.tenantName ?: "", tenants.filter { it.id != app.me?.tenantId }, actionError, busy, ::switchAndRetry)
                    ev != null -> Confirm(ev, busy, actionError, app.isOffline) { submit(ev) }
                    err != null -> ErrorStateView(err) { scope.launch { load() } }
                    else -> Column(Modifier.padding(top = 60.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        CircularProgressIndicator(color = Theme.accent)
                        Text("Арга хэмжээг шалгаж байна…", style = SdyType.subheadline, color = Theme.secondaryText)
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoLine(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(icon, null, tint = Theme.secondaryText, modifier = Modifier.size(16.dp))
        Text(text, style = SdyType.subheadline, color = Theme.secondaryText)
    }
}

@Composable
private fun Confirm(event: EventRecord, busy: Boolean, actionError: String?, offline: Boolean, onSubmit: () -> Unit) {
    Icon(Icons.Rounded.PendingActions, null, tint = Theme.accent, modifier = Modifier.size(56.dp))
    Text(event.title, style = SdyType.title2, color = Color.White, textAlign = TextAlign.Center)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (event.location.isNotEmpty()) InfoLine(Icons.Rounded.LocationOn, event.location)
        InfoLine(Icons.Rounded.AccessTime, Formatters.dateTime(event.startsAt))
        val points = event.pointsValue
        if (points != null && points > 0) InfoLine(Icons.Rounded.StarOutline, "Ирцийн оноо: ${points.toInt()}")
    }
    if (event.myStatus == "attended") NoticeView("Таны ирц аль хэдийн баталгаажсан байна.", NoticeKind.Success)
    if (event.myStatus.isEmpty()) {
        Text(
            "Та энэ арга хэмжээнд бүртгүүлээгүй байна. Батлахад эхлээд автоматаар бүртгэнэ.",
            style = SdyType.footnote, color = Theme.secondaryText, textAlign = TextAlign.Center,
        )
    }
    if (actionError != null) NoticeView(actionError, NoticeKind.Error)
    PrimaryButton(
        "Би ирсэн — батлах", fillWidth = true, busy = busy,
        enabled = !busy && event.myStatus != "attended" && !offline, onClick = onSubmit,
    )
}

@Composable
private fun Success(result: ActionResult, event: EventRecord?, close: () -> Unit) {
    Spacer(Modifier.height(24.dp))
    Icon(Icons.Rounded.Verified, null, tint = Theme.success, modifier = Modifier.size(68.dp))
    Text("Таны ирц баталгаажлаа.", style = SdyType.title2, color = Color.White)
    if (event != null) Text(event.title, style = SdyType.body, color = Theme.secondaryText, textAlign = TextAlign.Center)
    val points = result.points ?: event?.pointsValue
    if (points != null && points > 0) {
        Text("+${points.roundToInt()} оноо", fontSize = 34.sp, fontWeight = FontWeight.Bold, color = Theme.accent)
    }
    PrimaryButton("Болсон", onClick = close)
}

@Composable
private fun BranchMismatch(current: String, others: List<Tenant>, actionError: String?, busy: Boolean, onSwitch: (Tenant) -> Unit) {
    Icon(Icons.Rounded.Apartment, null, tint = Theme.warning, modifier = Modifier.size(56.dp))
    Text("Энэ арга хэмжээ өөр салбарынх байна", style = SdyType.title3.copy(fontWeight = FontWeight.Bold), color = Color.White, textAlign = TextAlign.Center)
    Text(
        "Та одоо «$current» салбарт идэвхтэй байна. QR-ийн арга хэмжээ таны идэвхтэй салбарт олдсонгүй. Арга хэмжээ зохиож буй салбар руу шилжээд дахин оролдоно уу.",
        style = SdyType.subheadline, color = Theme.secondaryText, textAlign = TextAlign.Center,
    )
    if (actionError != null) NoticeView(actionError, NoticeKind.Error)
    if (others.isEmpty()) Text("Танд шилжих өөр салбар алга. Зохион байгуулагчид хандана уу.", style = SdyType.footnote, color = Color.White)
    others.forEach { tenant ->
        SecondaryButton("«${tenant.name}» руу шилжих", icon = Icons.Rounded.SwapHoriz, fillWidth = true, enabled = !busy) { onSwitch(tenant) }
    }
}


package mn.esdy.member.features.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.MilitaryTech
import androidx.compose.material.icons.rounded.WorkspacePremium
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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import mn.esdy.member.app.HomeRoute
import mn.esdy.member.app.LocalApp
import mn.esdy.member.app.LocalNav
import mn.esdy.member.app.Route
import mn.esdy.member.core.*
import mn.esdy.member.design.*
import mn.esdy.member.features.manage.SanctionRow
import mn.esdy.member.models.*

private val numberStyle = SdyType.body.copy(fontWeight = FontWeight.Bold, fontFeatureSettings = "tnum")

@Composable
fun ParticipationScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var mine by remember { mutableStateOf<MyEventsPage?>(null) }
    var points by remember { mutableStateOf<PointsPage?>(null) }
    var sanctions by remember { mutableStateOf<List<Sanction>>(emptyList()) }
    var error by remember { mutableStateOf<APIError?>(null) }
    var busy by remember { mutableStateOf(false) }

    suspend fun load() {
        try {
            coroutineScope {
                val m = async { app.api.myEvents() }
                val p = async { app.api.points() }
                mine = m.await(); points = p.await()
            }
            error = null
        } catch (e: Throwable) {
            error = APIError.wrap(e)
        }
        // Decisions about this member; a branch without the app says nothing.
        sanctions = try { app.api.mySanctions().sanctions } catch (_: Exception) { emptyList() }
    }

    fun moreMine() {
        val current = mine ?: return
        busy = true
        scope.launch {
            try {
                val next = app.api.myEvents(current.nextOffset ?: current.items.size)
                mine = next.copy(items = current.items + next.items)
            } catch (_: Exception) {} finally { busy = false }
        }
    }

    fun morePoints() {
        val current = points ?: return
        busy = true
        scope.launch {
            try {
                val next = app.api.points(current.nextOffset ?: current.entries.size)
                points = next.copy(entries = current.entries + next.entries)
            } catch (_: Exception) {} finally { busy = false }
        }
    }

    LaunchedEffect(Unit) { if (mine == null) load() }

    val m = mine
    val p = points
    InlineListScreen("Ирц ба оноо", onRefresh = if (m != null && p != null) ({ load() }) else null) {
        when {
            m != null && p != null -> {
                item {
                    ListSection {
                        Column(Modifier.padding(vertical = 11.dp).semantics(mergeDescendants = true) {}) {
                            Text("Нийт оноо", style = SdyType.caption, color = Theme.secondaryText)
                            Text("${p.total.toInt()}", fontSize = 40.sp, fontWeight = FontWeight.Bold, color = Color.White, style = numberStyle)
                        }
                        ListDivider()
                        ListRow(onClick = { nav.push(Route.Home(HomeRoute.Leaderboard)) }) {
                            Icon(Icons.Rounded.EmojiEvents, null, tint = Theme.accent, modifier = Modifier.size(22.dp))
                            Text("Тэргүүлэгчдийн самбар", style = SdyType.body, color = Color.White, modifier = Modifier.weight(1f))
                            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Theme.tertiaryText)
                        }
                    }
                }
                item {
                    ListSection(header = "Миний ирц") {
                        if (m.items.isEmpty()) SecondaryLine("Одоогоор оролцооны бүртгэл алга.")
                        m.items.forEachIndexed { i, item ->
                            if (i > 0) ListDivider()
                            ListRow(Modifier.semantics(mergeDescendants = true) {}) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(item.title, style = SdyType.body, color = Color.White)
                                    Text("${Labels.attendance(item.status)} · ${Formatters.dateTime(item.startsAt)}", style = SdyType.caption, color = Theme.secondaryText)
                                }
                                Text("${item.points.toInt()}", style = numberStyle, color = Color.White)
                            }
                        }
                        if (m.hasMore) {
                            ListDivider()
                            RowButton("Цааш үзэх", enabled = !busy) { moreMine() }
                        }
                    }
                }
                if (sanctions.isNotEmpty()) {
                    item {
                        ListSection(header = "Хяналтын хорооны шийдвэр") {
                            sanctions.forEachIndexed { i, s ->
                                if (i > 0) ListDivider()
                                SanctionRow(s)
                            }
                        }
                    }
                }
                item {
                    ListSection(header = "Онооны түүх") {
                        if (p.entries.isEmpty()) SecondaryLine("Онооны өөрчлөлт алга.")
                        p.entries.forEachIndexed { i, entry ->
                            if (i > 0) ListDivider()
                            ListRow(Modifier.semantics(mergeDescendants = true) {}) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(entry.title, style = SdyType.body, color = Color.White)
                                    Text("${Labels.pointReason(entry.reason)} · ${Formatters.dateTime(entry.createdAt)}", style = SdyType.caption, color = Theme.secondaryText)
                                }
                                Text("${if (entry.delta > 0) "+" else ""}${entry.delta.toInt()}", style = numberStyle, color = Color.White)
                            }
                        }
                        if (p.hasMore) {
                            ListDivider()
                            RowButton("Цааш үзэх", enabled = !busy) { morePoints() }
                        }
                    }
                }
            }
            error != null -> item { ErrorStateView(error!!) { scope.launch { load() } } }
            else -> item { SkeletonList() }
        }
    }
}

@Composable
fun LeaderboardScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var period by remember { mutableStateOf("month") }
    var data by remember { mutableStateOf<Leaderboard?>(null) }
    var error by remember { mutableStateOf<APIError?>(null) }

    suspend fun load() {
        try { data = app.api.leaderboard(period); error = null } catch (e: Throwable) { data = null; error = APIError.wrap(e) }
    }
    LaunchedEffect(period) { load() }

    val periods = listOf("month" to "Энэ сар", "year" to "Энэ жил", "all" to "Бүх цаг")
    InlineListScreen("Тэргүүлэгчид", onRefresh = { load() }) {
        item {
            Column(Modifier.padding(bottom = 24.dp)) {
                SegmentedControl(periods.map { it.first }, period, { k -> periods.first { it.first == k }.second }, { period = it })
                Text(
                    "Ирц, батлагдсан ажил үүрэг, зурсан саналаар цуглуулсан оноо. Зөвхөн өөрийн салбарын гишүүд.",
                    style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 7.dp),
                )
            }
        }
        val d = data
        val e = error
        when {
            d != null -> {
                item {
                    ListSection(header = "Таны байр") {
                        val me = d.me
                        if (me != null) {
                            Row(Modifier.padding(vertical = 11.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                Icon(Icons.Rounded.WorkspacePremium, null, tint = Theme.accent, modifier = Modifier.size(32.dp))
                                Column {
                                    Text("${me.rank}-р байр · ${me.points.toInt()} оноо", style = SdyType.title3.copy(fontWeight = FontWeight.Bold, fontFeatureSettings = "tnum"), color = Color.White)
                                    Counts(me)
                                }
                            }
                        } else {
                            SecondaryLine("Та энэ хугацаанд оноо цуглуулаагүй байна.")
                        }
                    }
                }
                item {
                    ListSection(header = "Тэргүүлэгчид") {
                        if (d.standings.isEmpty()) SecondaryLine("Энэ хугацаанд оноо цуглуулсан гишүүн алга.")
                        d.standings.forEachIndexed { i, s ->
                            if (i > 0) ListDivider()
                            val mine = s.userId == d.me?.userId
                            ListRow(
                                Modifier
                                    .then(if (mine) Modifier.background(Theme.accent.copy(alpha = 0.08f), RoundedCornerShape(8.dp)) else Modifier)
                                    .clearAndSetSemantics { contentDescription = "${s.rank}-р байр, ${s.name}, ${s.points.toInt()} оноо${if (mine) ", та" else ""}" },
                            ) {
                                Row(Modifier.width(44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text("${s.rank}", style = SdyType.headline.copy(fontFeatureSettings = "tnum"), color = if (s.rank <= 3) Color.White else Theme.secondaryText)
                                    if (s.rank <= 3) {
                                        val medal = when (s.rank) { 1 -> Color(0xFFFFD60A); 2 -> Color(0xFF8E8E93); else -> Color(0xFFAC8E68) }
                                        Icon(Icons.Rounded.MilitaryTech, null, tint = medal, modifier = Modifier.size(14.dp))
                                    }
                                }
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        if (s.name.isEmpty()) "—" else s.name + if (mine) " (та)" else "",
                                        style = if (mine) SdyType.body.copy(fontWeight = FontWeight.Bold) else SdyType.body,
                                        color = if (mine) Theme.accent else Color.White,
                                    )
                                    Counts(s)
                                }
                                Text("${s.points.toInt()}", style = SdyType.headline.copy(fontFeatureSettings = "tnum"), color = Color.White)
                            }
                        }
                    }
                }
            }
            e != null -> item { ErrorStateView(e) { scope.launch { load() } } }
            else -> item {
                ListSection {
                    repeat(5) { i ->
                        if (i > 0) ListDivider()
                        Box(Modifier.padding(vertical = 14.dp).width(180.dp).height(16.dp).background(Theme.fill, RoundedCornerShape(4.dp)))
                    }
                }
            }
        }
    }
}

@Composable
private fun Counts(s: Standing) {
    Text(
        "Ирц ${s.attended.toInt()} · Ажил ${s.tasks.toInt()} · Санал ${s.votes.toInt()}",
        style = SdyType.caption.copy(fontFeatureSettings = "tnum"), color = Theme.secondaryText,
    )
}

@Composable
fun PersonalHistoryScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var events by remember { mutableStateOf<PersonalParticipationHistory?>(null) }
    var dues by remember { mutableStateOf<PersonalDuesHistory?>(null) }
    var error by remember { mutableStateOf<APIError?>(null) }

    suspend fun load() {
        try {
            coroutineScope {
                val e = async { app.api.participationHistory() }
                val d = async { app.api.duesHistory() }
                events = e.await(); dues = d.await()
            }
            error = null
        } catch (e: Throwable) {
            error = APIError.wrap(e)
        }
    }
    LaunchedEffect(Unit) { if (events == null) load() }

    val ev = events
    val du = dues
    InlineListScreen("Миний түүх", onRefresh = if (ev != null && du != null) ({ load() }) else null) {
        when {
            ev != null && du != null -> {
                item {
                    ListSection {
                        Text("Өмнөх болон одоогийн салбар дахь өөрийн түүхийг энд харна.", style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
                    }
                }
                item {
                    ListSection(header = "Ирц · ${ev.totalPoints.toInt()} оноо") {
                        if (ev.items.isEmpty()) SecondaryLine("Бүртгэл алга.")
                        ev.items.forEachIndexed { i, e ->
                            if (i > 0) ListDivider()
                            HistoryLines(
                                e.title,
                                "${e.branch} · ${Formatters.dateTime(e.startsAt)}" to Theme.secondaryText,
                                "${Labels.attendance(e.status)} · ${e.points.toInt()} оноо" to Color.White,
                            )
                        }
                    }
                }
                item {
                    ListSection(header = "Хураамж") {
                        if (du.charges.isEmpty()) SecondaryLine("Хураамж алга.")
                        du.charges.forEachIndexed { i, c ->
                            if (i > 0) ListDivider()
                            HistoryLines(
                                "${c.branch} · ${c.period}",
                                "Дүн: ${Formatters.money(c.amount)} · Төлсөн: ${Formatters.money(c.paid)}" to Color.White,
                                (if (c.waived) "Чөлөөлсөн" else "Үлдэгдэл: ${Formatters.money(c.balance)}") to Theme.secondaryText,
                            )
                        }
                    }
                }
                item {
                    ListSection(header = "Төлөлт") {
                        if (du.payments.isEmpty()) SecondaryLine("Төлөлт алга.")
                        du.payments.forEachIndexed { i, p ->
                            if (i > 0) ListDivider()
                            HistoryLines(
                                "${p.branch} · ${Formatters.money(p.amount)}",
                                "${Labels.payment(p.status)} · ${Formatters.dateTime(p.createdAt)}" to Color.White,
                                if (p.reference.isNotEmpty()) p.reference to Theme.secondaryText else null,
                            )
                        }
                    }
                }
            }
            error != null -> item { ErrorStateView(error!!) { scope.launch { load() } } }
            else -> item { SkeletonList() }
        }
    }
}

@Composable
private fun HistoryLines(title: String, vararg lines: Pair<String, Color>?) {
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, style = SdyType.subheadline.copy(fontWeight = FontWeight.Medium, fontFeatureSettings = "tnum"), color = Color.White)
        lines.filterNotNull().forEach { (text, color) -> Text(text, style = SdyType.caption.copy(fontFeatureSettings = "tnum"), color = color) }
    }
}

/** Members blocked in the discussion, with a way back. */
@Composable
fun BlockedMembersScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<BlockedList?>(null) }
    var error by remember { mutableStateOf<APIError?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try { data = app.api.blockedMembers(); error = null } catch (e: Throwable) { error = APIError.wrap(e) }
    }
    fun unblock(member: BlockedMember) {
        busy = member.userId
        scope.launch {
            try {
                app.api.unblock(member.userId)
                data = data?.let { it.copy(blocked = it.blocked.filter { b -> b.userId != member.userId }) }
            } catch (e: Throwable) {
                error = APIError.wrap(e)
            } finally {
                busy = null
            }
        }
    }
    LaunchedEffect(Unit) { load() }

    InlineListScreen("Блоклосон гишүүд", onRefresh = { load() }) {
        item {
            ListSection(footer = "Блоклосон гишүүний дэвшүүлсэн, санал хураалтад ороогүй асуудлууд танд харагдахгүй. Зүй бус контентыг асуудлын «…» цэсээр мэдээлнэ үү.") {
                val d = data
                val e = error
                when {
                    d != null -> {
                        if (d.blocked.isEmpty()) SecondaryLine("Та хэнийг ч блоклоогүй байна.")
                        d.blocked.forEachIndexed { i, member ->
                            if (i > 0) ListDivider()
                            ListRow {
                                Text(member.name.ifEmpty { "—" }, style = SdyType.body, color = Color.White, modifier = Modifier.weight(1f))
                                SecondaryButton(
                                    "Блок цуцлах", enabled = busy == null && !app.isOffline,
                                    modifier = Modifier.height(36.dp),
                                ) { unblock(member) }
                            }
                        }
                    }
                    e != null -> ErrorStateView(e) { scope.launch { load() } }
                    else -> Box(Modifier.fillMaxWidth().padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(Modifier.size(22.dp), color = Theme.secondaryText, strokeWidth = 2.dp)
                    }
                }
            }
        }
    }
}

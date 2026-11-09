package mn.esdy.member.features.home

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Apartment
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.EventAvailable
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.HourglassEmpty
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.NotificationImportant
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.PanTool
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.QuestionMark
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import mn.esdy.member.R
import mn.esdy.member.app.AppModel
import mn.esdy.member.app.HomeRoute
import mn.esdy.member.app.LocalApp
import mn.esdy.member.app.LocalNav
import mn.esdy.member.app.Route
import mn.esdy.member.core.APIClient
import mn.esdy.member.core.APIError
import mn.esdy.member.core.AppConfig
import mn.esdy.member.core.Formatters
import mn.esdy.member.core.branches
import mn.esdy.member.core.events
import mn.esdy.member.core.leaderboard
import mn.esdy.member.core.motions
import mn.esdy.member.core.myDues
import mn.esdy.member.core.myItems
import mn.esdy.member.core.notifications
import mn.esdy.member.core.profile
import mn.esdy.member.core.tasks
import mn.esdy.member.core.transfers
import mn.esdy.member.design.DarkCard
import mn.esdy.member.design.ErrorStateView
import mn.esdy.member.design.GlassCapsule
import mn.esdy.member.design.GlassCircleButton
import mn.esdy.member.design.GlassTile
import mn.esdy.member.design.HeroScaffold
import mn.esdy.member.design.IconRow
import mn.esdy.member.design.Labels
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.OfflineBanner
import mn.esdy.member.design.RowDivider
import mn.esdy.member.design.RowGroup
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SheetHeader
import mn.esdy.member.design.SkeletonCards
import mn.esdy.member.design.StatusChip
import mn.esdy.member.design.Theme
import mn.esdy.member.design.Tone
import mn.esdy.member.design.pressable
import mn.esdy.member.design.rememberLoader
import mn.esdy.member.design.rise
import mn.esdy.member.features.profile.AvatarView
import mn.esdy.member.models.Branch
import mn.esdy.member.models.EventRecord
import mn.esdy.member.models.EventTask
import mn.esdy.member.models.Motion
import mn.esdy.member.models.MembershipTransfer
import mn.esdy.member.models.MyDuesPage
import mn.esdy.member.models.MyItem
import mn.esdy.member.models.Organisation
import mn.esdy.member.models.Profile

/** Everything Нүүр shows, fetched together. */
data class HomeData(
    val profile: Profile,
    val branches: List<Branch>,
    val joinItems: List<MyItem>,
    val transfers: List<MembershipTransfer>,
    val dues: MyDuesPage? = null,
    val nextEvent: EventRecord? = null,
    val openVotes: List<Pair<EventRecord, Motion>> = emptyList(),
    val taskOffers: List<Pair<EventRecord, EventTask>> = emptyList(),
    val unread: Int,
    val points: Int? = null,
)

@Composable
fun HomeScreen() {
    val app = LocalApp.current
    val loader = rememberLoader { fetchHome(app) }
    var pointsHidden by rememberSaveable { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        val data = loader.value
        val error = loader.error
        when {
            data != null -> HeroScaffold(
                heroHeight = 416.dp,
                onRefresh = { loader.load(); app.refreshUnread() },
                compact = { CompactBar(data, pointsHidden) },
                pinned = { TopRow(data, pointsHidden) { pointsHidden = !pointsHidden } },
                header = { HeroHeader(data, pointsHidden) },
            ) {
                if (app.hasApprovedBranch) TodoSection(data) else JoinSection(data)
                BranchSection(data)
                if (app.hasApprovedBranch || data.transfers.isNotEmpty()) {
                    val nav = LocalNav.current
                    DarkCard(Modifier.rise(8).pressable(0.98f) { nav.push(Route.Home(HomeRoute.Transfers)) }, padding = 16.dp) {
                        IconRow(
                            title = "Харьяалал шилжүүлэх",
                            icon = Icons.Rounded.SwapHoriz,
                            subtitle = data.transfers.firstOrNull { it.status == "PENDING" }?.let { "Хүлээгдэж буй: ${it.toName}" },
                        )
                    }
                }
            }
            error != null -> Box(Modifier.fillMaxSize().statusBarsPadding(), contentAlignment = Alignment.Center) {
                ErrorStateView(error) { loader.reload() }
            }
            else -> HeroScaffold(
                heroHeight = 416.dp,
                pinned = { TopRow(null, pointsHidden) { pointsHidden = !pointsHidden } },
                header = { HeroHeader(null, pointsHidden) },
            ) { SkeletonCards() }
        }
        Box(Modifier.fillMaxWidth().statusBarsPadding()) { OfflineBanner() }
    }
}

// region Header

@Composable
private fun HeroHeader(data: HomeData?, pointsHidden: Boolean) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().statusBarsPadding(), horizontalAlignment = Alignment.CenterHorizontally) {
        // Room for the pinned top row, which HeroScaffold draws.
        Spacer(Modifier.height(80.dp))
        Spacer(Modifier.weight(1f).heightIn(min = 12.dp))

        if (app.hasApprovedBranch) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    app.me?.tenantName?.ifEmpty { null } ?: "Миний оноо",
                    style = SdyType.subheadline, color = Color.White.copy(alpha = 0.7f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                val points = data?.points ?: 0
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.clearAndSetSemantics {
                        contentDescription = if (pointsHidden) "Оноо нуугдсан" else "Миний оноо $points"
                    },
                ) {
                    val big = SdyType.largeTitle.copy(fontSize = 46.sp, lineHeight = 52.sp, fontWeight = FontWeight.Bold)
                    if (pointsHidden) {
                        Text("••••", style = big, color = Color.White)
                    } else {
                        Text("$points", style = big, color = Color.White)
                        Text("оноо", style = SdyType.title3, color = Color.White.copy(alpha = 0.7f), modifier = Modifier.padding(bottom = 8.dp))
                    }
                }
                GlassCapsule("Тэргүүлэгчид") { nav.push(Route.Home(HomeRoute.Leaderboard)) }
            }
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Image(
                    painterResource(R.drawable.logo), null, contentScale = ContentScale.Crop,
                    modifier = Modifier.size(72.dp).clip(RoundedCornerShape(20.dp)),
                )
                Text("Салбартаа элсээд бүх боломжийг нээгээрэй", style = SdyType.subheadline, color = Color.White.copy(alpha = 0.75f))
            }
        }

        Spacer(Modifier.weight(1f).heightIn(min = 16.dp))

        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(bottom = 52.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val tile = Modifier.weight(1f)
            if (app.hasApprovedBranch) {
                GlassTile("Арга хэмжээ", Icons.Rounded.CalendarMonth, tile) { app.tab = AppModel.Tab.Events }
                GlassTile("Ирц", Icons.Rounded.QrCodeScanner, tile) { app.tab = AppModel.Tab.Checkin }
                GlassTile("Хураамж", Icons.Rounded.Payments, tile) { app.tab = AppModel.Tab.Dues }
                GlassTile("Түүх", Icons.Rounded.History, tile) { nav.push(Route.Home(HomeRoute.History)) }
            } else {
                GlassTile("Элсэх", Icons.Rounded.PersonAdd, tile) { nav.push(Route.Home(HomeRoute.JoinRequest)) }
                GlassTile("Мэдэгдэл", Icons.Rounded.Notifications, tile, badge = app.unreadCount) { nav.push(Route.Home(HomeRoute.Notifications)) }
                GlassTile("Гишүүнчлэл", Icons.Rounded.Badge, tile) { nav.push(Route.Home(HomeRoute.Record)) }
                GlassTile("Тусламж", Icons.Rounded.QuestionMark, tile) {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(AppConfig.supportURL)))
                }
            }
        }
    }
}

/** The greeting and the round buttons: held in place by HeroScaffold. */
@Composable
private fun TopRow(data: HomeData?, pointsHidden: Boolean, togglePoints: () -> Unit) {
    val app = LocalApp.current
    val nav = LocalNav.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.pressable(0.9f) { app.tab = AppModel.Tab.Profile }.semantics { contentDescription = "Профайл" }) { AvatarView(50.dp) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(greeting(), style = SdyType.subheadline, color = Color.White.copy(alpha = 0.65f))
            Text(
                displayName(data?.profile?.name ?: app.me?.name ?: ""),
                style = SdyType.title2, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (app.hasApprovedBranch) {
            GlassCircleButton(
                if (pointsHidden) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                if (pointsHidden) "Оноог харуулах" else "Оноог нуух",
                onClick = togglePoints,
            )
        }
        GlassCircleButton(
            Icons.Rounded.Notifications,
            if (app.unreadCount > 0) "Мэдэгдэл, ${app.unreadCount} уншаагүй" else "Мэдэгдэл",
            dot = app.unreadCount > 0,
        ) { nav.push(Route.Home(HomeRoute.Notifications)) }
    }
}

/** Pinned at the top once the header has scrolled away. */
@Composable
private fun CompactBar(data: HomeData, pointsHidden: Boolean) {
    val app = LocalApp.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        AvatarView(32.dp)
        Text(displayName(data.profile.name), style = SdyType.headline, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        if (app.hasApprovedBranch) {
            Text(
                if (pointsHidden) "•••• оноо" else "${data.points ?: 0} оноо",
                style = SdyType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = Color.White.copy(alpha = 0.8f),
            )
        }
    }
}

private fun greeting(): String = when (LocalTime.now(Formatters.zone).hour) {
    in 5..11 -> "Өглөөний мэнд"
    in 12..17 -> "Өдрийн мэнд"
    else -> "Оройн мэнд"
}

/** "Батболд Ганзориг" → "Б. ГАНЗОРИГ", the way a bank card prints a name. */
internal fun displayName(full: String): String {
    val parts = full.split(" ").filter { it.isNotEmpty() }
    if (parts.size < 2) return full.uppercase()
    return "${parts[0].first()}. ${parts[1]}".uppercase()
}

// endregion

// region Sheet

private class TodoRow(val icon: ImageVector, val title: String, val subtitle: String, val action: () -> Unit)

@Composable
private fun TodoSection(data: HomeData) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val toReport = data.dues?.totals?.let { it.outstanding - it.pending } ?: 0.0
    val anything = toReport > 0 || data.nextEvent != null || data.openVotes.isNotEmpty() || data.taskOffers.isNotEmpty() || data.unread > 0

    SheetHeader("Танд хийх зүйл", Modifier.rise(0)) {
        if (data.unread > 0) {
            Box(
                Modifier.defaultMinSize(34.dp, 34.dp).background(Theme.brandRed, CircleShape)
                    .clearAndSetSemantics { contentDescription = "${data.unread} уншаагүй мэдэгдэл" },
                contentAlignment = Alignment.Center,
            ) { Text("${data.unread}", style = SdyType.subheadline.copy(fontWeight = FontWeight.Bold), color = Color.White, modifier = Modifier.padding(horizontal = 6.dp)) }
        }
    }

    val dues = data.dues
    val totals = dues?.totals
    if (dues != null && totals != null && toReport > 0) {
        val overdue = dues.charges.any { it.isOverdue() }
        DarkCard(
            Modifier.rise(1).pressable(0.98f) { app.tab = AppModel.Tab.Dues }
                .semantics(mergeDescendants = true) { contentDescription = "Төлөх хураамж ${Formatters.money(totals.outstanding - totals.pending)}. Хураамжийн хэсэг рүү шилжинэ" },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(52.dp).background(Color.White, RoundedCornerShape(15.dp)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.Payments, null, tint = Color.Black, modifier = Modifier.size(22.dp))
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Төлөх хураамж", style = SdyType.subheadline, color = Theme.secondaryText)
                    Text(Formatters.money(totals.outstanding - totals.pending), fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    if (overdue) StatusChip("Хугацаа хэтэрсэн", Icons.Rounded.Warning, Tone.Danger)
                }
                Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Theme.tertiaryText, modifier = Modifier.size(20.dp))
            }
        }
    }

    val rows = buildList {
        data.nextEvent?.let { event ->
            add(TodoRow(Icons.Rounded.EventAvailable, event.title, "Дараагийн арга хэмжээ · ${Formatters.relative(event.startsAt)}") { app.openEvent(event.id) })
        }
        for ((event, motion) in data.openVotes) {
            add(TodoRow(Icons.Rounded.Verified, "Санал өгөх: ${motion.title}", event.title) { app.openEvent(event.id) })
        }
        for ((event, task) in data.taskOffers) {
            add(TodoRow(Icons.Rounded.PanTool, "Танд санал болгосон ажил: ${task.title}", event.title) { app.openEvent(event.id) })
        }
        if (data.unread > 0) {
            add(TodoRow(Icons.Rounded.NotificationImportant, "${data.unread} уншаагүй мэдэгдэл", "Шинэ мэдээллээ үзнэ үү") {
                nav.push(Route.Home(HomeRoute.Notifications))
            })
        }
    }
    if (rows.isNotEmpty()) {
        RowGroup(Modifier.rise(2)) {
            rows.forEachIndexed { index, row ->
                IconRow(row.title, row.icon, subtitle = row.subtitle, onClick = row.action)
                if (index < rows.size - 1) RowDivider()
            }
        }
    }

    if (!anything) {
        DarkCard(Modifier.rise(1)) {
            IconRow(
                "Одоогоор хийх зүйл алга", Icons.Rounded.Check,
                subtitle = "Сайн байна! Шинэ зүйл гарвал энд харагдана.",
                tint = Color.White, tile = Theme.cardRaised, chevron = false,
            )
        }
    }
}

@Composable
private fun JoinSection(data: HomeData) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val pending = data.joinItems.filter { it.status.uppercase() == "PENDING" }
    SheetHeader("Гишүүнчлэл", Modifier.rise(0))
    if (data.joinItems.isNotEmpty()) {
        RowGroup(Modifier.rise(1)) {
            data.joinItems.forEachIndexed { index, item ->
                IconRow(
                    title = item.provider,
                    icon = if (item.status.uppercase() == "PENDING") Icons.Rounded.HourglassEmpty else Icons.Rounded.Info,
                    subtitle = Labels.joinRequest(item.status) + if (item.answer.isEmpty()) "" else "\n${item.answer}",
                    chevron = false,
                )
                if (index < data.joinItems.size - 1) RowDivider()
            }
        }
    }
    if (pending.isEmpty() && app.record?.hasPrimary != true) {
        DarkCard(Modifier.rise(2).pressable(0.98f) { nav.push(Route.Home(HomeRoute.JoinRequest)) }, padding = 16.dp) {
            IconRow("Салбарт элсэх хүсэлт илгээх", Icons.Rounded.PersonAdd, tint = Color.White, tile = Theme.brandRed)
        }
    }
    Text(
        if (pending.isEmpty())
            "Харьяалагдах салбараа сонгож элсэх хүсэлт илгээнэ. Салбарын менежер баталсны дараа арга хэмжээ, ирц, хураамжийн хэсгүүд нээгдэнэ."
        else
            "Таны хүсэлтийг салбарын менежер шийдвэрлэсний дараа бүх хэсэг нээгдэнэ. Доош татаж шинэчилнэ үү.",
        style = SdyType.footnote, color = Theme.secondaryText,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp).rise(3),
    )
}

@Composable
private fun BranchSection(data: HomeData) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var switching by rememberSaveable { mutableStateOf<String?>(null) }
    var switchError by rememberSaveable { mutableStateOf<String?>(null) }
    val slugs = data.branches.map { it.slug }.toSet()
    val orgs = data.profile.organisations.filter { it.slug in slugs }
    if (orgs.isEmpty()) return

    fun switchTo(org: Organisation) {
        switching = org.id; switchError = null
        scope.launch {
            try { app.switchBranch(org.id) } catch (e: Throwable) { switchError = APIError.wrap(e).message } finally { switching = null }
        }
    }

    SheetHeader("Миний салбарууд", Modifier.padding(top = 8.dp).rise(4))
    RowGroup(Modifier.rise(5)) {
        orgs.forEachIndexed { index, org ->
            val primary = app.record?.memberships?.any { it.tenantId == org.id && it.isPrimary } ?: false
            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(44.dp).background(Color.White, RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.Apartment, null, tint = Color.Black, modifier = Modifier.size(20.dp))
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(org.name, style = SdyType.body.copy(fontWeight = FontWeight.SemiBold), color = Color.White)
                    Text(if (primary) "Үндсэн харьяалал" else "Бусад харьяалал / ажиллах эрх", style = SdyType.subheadline, color = Theme.secondaryText)
                }
                when {
                    org.id == app.me?.tenantId -> StatusChip("Идэвхтэй", Icons.Rounded.CheckCircle, Tone.Success)
                    switching == org.id -> CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                    else -> {
                        val enabled = switching == null && !app.isOffline
                        Text(
                            "Орох", style = SdyType.subheadline.copy(fontWeight = FontWeight.SemiBold),
                            color = if (enabled) Color.White else Theme.tertiaryText,
                            modifier = Modifier.pressable(enabled = enabled) { switchTo(org) }
                                .semantics { contentDescription = "${org.name} салбар руу орох" }
                                .background(Theme.cardRaised, CircleShape)
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                }
            }
            if (index < orgs.size - 1) RowDivider()
        }
        switchError?.let { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 8.dp)) }
    }
}

// endregion

/** iOS HomeView.fetch: the person's things, then — for a branch member — dues, events, votes and tasks. */
private suspend fun fetchHome(app: AppModel): HomeData = coroutineScope {
    val api: APIClient = app.api
    val profile = async { api.profile() }
    val branches = async { runCatching { api.branches() }.getOrNull() }
    val items = async { runCatching { api.myItems() }.getOrNull() }
    val transfers = async { runCatching { api.transfers() }.getOrNull() }
    val notifications = async { runCatching { api.notifications() }.getOrNull() }
    app.reloadRecord()
    val approved = app.hasApprovedBranch

    val page = notifications.await()
    var data = HomeData(
        profile = profile.await(),
        branches = branches.await()?.branches ?: emptyList(),
        joinItems = (items.await()?.items ?: emptyList()).filter { it.code == "join_request" },
        transfers = transfers.await()?.requests ?: emptyList(),
        unread = page?.let { p -> p.unread ?: p.items.count { !it.isRead } } ?: 0,
    )
    app.unreadCount = data.unread
    if (!approved) return@coroutineScope data

    val dues = async { runCatching { api.myDues() }.getOrNull() }
    val events = async { runCatching { api.events() }.getOrNull() }
    val board = async { runCatching { api.leaderboard("all") }.getOrNull() }
    val list = events.await()?.events ?: emptyList()
    val now = Instant.now()
    val mine = list.filter { it.isOpen && it.myStatus.isNotEmpty() }
    val next = mine
        .filter { (it.startDate ?: Instant.MIN) >= now.minus(Duration.ofHours(3)) }
        .minByOrNull { it.startDate ?: Instant.MAX }
    // Votes and task offers live on events the member takes part in that
    // are happening now or soon.
    val active = mine.filter {
        val start = it.startDate ?: return@filter false
        start > now.minus(Duration.ofDays(1)) && start < now.plus(Duration.ofDays(14))
    }.take(3)
    val votes = mutableListOf<Pair<EventRecord, Motion>>()
    val offers = mutableListOf<Pair<EventRecord, EventTask>>()
    for (event in active) {
        runCatching { api.motions(event.id) }.getOrNull()?.let { motions ->
            motions.motions.filter { motions.needsMyVote(it) }.forEach { votes += event to it }
        }
        runCatching { api.tasks(event.id) }.getOrNull()?.let { tasks ->
            tasks.tasks.filter { it.mine(tasks.me)?.status == "offered" }.forEach { offers += event to it }
        }
    }
    data = data.copy(
        dues = dues.await(),
        points = board.await()?.me?.points?.toInt(),
        nextEvent = next,
        openVotes = votes,
        taskOffers = offers,
    )
    data
}


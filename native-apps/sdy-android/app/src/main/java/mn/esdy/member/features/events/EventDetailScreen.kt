package mn.esdy.member.features.events

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircle
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.HighlightOff
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PersonOff
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Star
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.app.LocalNav
import mn.esdy.member.core.APIError
import mn.esdy.member.core.Formatters
import mn.esdy.member.core.Haptics
import mn.esdy.member.core.event
import mn.esdy.member.core.participants
import mn.esdy.member.core.register
import mn.esdy.member.core.withdraw
import mn.esdy.member.design.ActionSheet
import mn.esdy.member.design.Chips
import mn.esdy.member.design.ErrorStateView
import mn.esdy.member.design.Labels
import mn.esdy.member.design.ListDivider
import mn.esdy.member.design.ListRow
import mn.esdy.member.design.ListSection
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.PrimaryButton
import mn.esdy.member.design.RowButton
import mn.esdy.member.design.SdyFullScreen
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SheetAction
import mn.esdy.member.design.SkeletonList
import mn.esdy.member.design.StatusChip
import mn.esdy.member.design.Theme
import mn.esdy.member.design.Tone
import mn.esdy.member.design.rememberLoader
import mn.esdy.member.features.manage.AttendanceManageScreen
import mn.esdy.member.features.manage.CheckinQRScreen
import mn.esdy.member.features.manage.EventEditorSheet
import mn.esdy.member.models.EventRecord
import mn.esdy.member.models.Participant
import mn.esdy.member.models.Permission

@Composable
fun EventDetailScreen(eventId: String) {
    val app = LocalApp.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val loader = rememberLoader(eventId) { app.api.event(eventId) }
    val discussion = remember(eventId) { DiscussionModel(eventId, app.api, context.applicationContext, scope) }
    val tasks = remember(eventId) { TasksModel(eventId, app.api, scope) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<Pair<String, NoticeKind>?>(null) }
    var confirmWithdraw by remember { mutableStateOf(false) }
    var participants by remember { mutableStateOf<List<Participant>?>(null) }
    var participantsError by remember { mutableStateOf<String?>(null) }
    var showParticipants by rememberSaveable { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var showingQR by remember { mutableStateOf(false) }

    LaunchedEffect(eventId) {
        discussion.load()
        tasks.load()
    }
    // The app came back from the eID app: a waiting signature is asked about at once.
    var lastTick by remember { mutableStateOf(app.resumeTick) }
    LaunchedEffect(app.resumeTick) {
        if (app.resumeTick != lastTick) { lastTick = app.resumeTick; discussion.resume() }
    }

    fun register() {
        busy = true; notice = null
        scope.launch {
            try {
                app.api.register(eventId)
                Haptics.success()
                notice = "Бүртгэл амжилттай." to NoticeKind.Success
                loader.load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                notice = APIError.wrap(e).message to NoticeKind.Error
                Haptics.error()
            } finally { busy = false }
        }
    }

    fun withdraw() {
        busy = true; notice = null
        scope.launch {
            try {
                app.api.withdraw(eventId)
                notice = "Бүртгэл цуцлагдлаа." to NoticeKind.Info
                loader.load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                notice = APIError.wrap(e).message to NoticeKind.Error
            } finally { busy = false }
        }
    }

    fun loadParticipants() {
        scope.launch {
            try {
                participants = app.api.participants(eventId).participants
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                val err = APIError.wrap(e)
                participantsError = if (err.status == 403) "Оролцогчдын жагсаалтыг зөвхөн зохион байгуулагч харна." else err.message
            }
        }
    }

    val event = loader.value
    InlineListScreen(
        title = event?.title ?: "Арга хэмжээ",
        onRefresh = if (event != null) ({ loader.load(); discussion.load(); tasks.load() }) else null,
    ) {
        val error = loader.error
        when {
            event != null -> content(
                event = event,
                canManage = app.can(Permission.manageEvents),
                offline = app.isOffline,
                busy = busy,
                notice = notice,
                discussion = discussion,
                tasks = tasks,
                showParticipants = showParticipants,
                participants = participants,
                participantsError = participantsError,
                onEdit = { editing = true },
                onQR = { showingQR = true },
                onRegister = { register() },
                onWithdraw = { confirmWithdraw = true },
                onToggleParticipants = {
                    showParticipants = !showParticipants
                    if (showParticipants && participants == null) loadParticipants()
                },
            )
            error != null -> item { ErrorStateView(error) { loader.reload() } }
            else -> item { SkeletonList(rows = 4) }
        }
    }

    if (confirmWithdraw) {
        ActionSheet(
            title = "Бүртгэлээ цуцлах уу?",
            message = "Дахин бүртгүүлэхэд суудал үлдсэн байх шаардлагатай.",
            actions = listOf(SheetAction("Бүртгэл цуцлах", destructive = true) { withdraw() }),
            onDismiss = { confirmWithdraw = false },
        )
    }
    if (discussion.signing != null) VoteSigningSheet(discussion)
    if (editing && event != null) {
        EventEditorSheet(event = event, onDismiss = { editing = false }) { editing = false; loader.reload() }
    }
    if (showingQR && event != null) {
        SdyFullScreen(onDismiss = { showingQR = false }) { CheckinQRScreen(event) { showingQR = false } }
    }
}

private fun LazyListScope.content(
    event: EventRecord,
    canManage: Boolean,
    offline: Boolean,
    busy: Boolean,
    notice: Pair<String, NoticeKind>?,
    discussion: DiscussionModel,
    tasks: TasksModel,
    showParticipants: Boolean,
    participants: List<Participant>?,
    participantsError: String?,
    onEdit: () -> Unit,
    onQR: () -> Unit,
    onRegister: () -> Unit,
    onWithdraw: () -> Unit,
    onToggleParticipants: () -> Unit,
) {
    item("summary") { Summary(event) }
    if (canManage) item("organiser") { OrganiserSection(event, offline, onEdit, onQR) }
    item("registration") { RegistrationSection(event, offline, busy, notice, onRegister, onWithdraw) }
    if (event.myStatus.isNotEmpty()) {
        item("discussion") { DiscussionSection(discussion) }
        item("tasks") { TasksSection(tasks, closed = !event.isOpen) }
    } else {
        item("tasks") { TasksSection(tasks, closed = !event.isOpen) }
        item("discussion") { DiscussionSection(discussion) }
    }
    item("participants") { ParticipantsSection(event, showParticipants, participants, participantsError, onToggleParticipants) }
}

@Composable
private fun Summary(event: EventRecord) {
    ListSection {
        Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                StatusChip(Chips.eventStatus(event.status))
                Chips.attendance(event.myStatus)?.let { StatusChip(it) }
                if (event.isFull && event.isOpen) StatusChip("Хүний тоо дүүрсэн", Icons.Rounded.PersonOff, Tone.Danger)
            }
            Text(event.title, style = SdyType.title2, color = Color.White)
            if (event.description.isNotEmpty()) Text(event.description, style = SdyType.body, color = Color.White)
        }
        ListDivider()
        val time = event.endsAt?.let { "${Formatters.dateTime(event.startsAt)} – ${Formatters.dateTime(it)}" } ?: Formatters.dateTime(event.startsAt)
        DetailRow("Хэзээ", Icons.Rounded.Schedule, time)
        if (event.location.isNotEmpty()) { ListDivider(); DetailRow("Хаана", Icons.Rounded.Place, event.location) }
        ListDivider()
        DetailRow("Оролцогч", Icons.Rounded.Group, event.capacityText)
        val points = event.pointsValue
        if (points != null && points > 0) { ListDivider(); DetailRow("Ирцийн оноо", Icons.Rounded.Star, Formatters.points(points)) }
    }
}

@Composable
private fun DetailRow(label: String, icon: ImageVector, value: String) {
    ListRow(Modifier.semantics(mergeDescendants = true) {}) {
        IconLabel(label, icon, iconColor = Theme.accent)
        Text(value, style = SdyType.body, color = Theme.secondaryText, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
    }
}

/**
 * Тэргүүн, Дэд тэргүүн, Нарийн бичиг: edit, confirm attendance (which
 * awards the points) and show the check-in code.
 */
@Composable
private fun OrganiserSection(event: EventRecord, offline: Boolean, onEdit: () -> Unit, onQR: () -> Unit) {
    val nav = LocalNav.current
    ListSection(header = "Зохион байгуулагч") {
        RowButton("Засах", icon = Icons.Rounded.Edit, enabled = !offline, onClick = onEdit)
        ListDivider()
        RowButton("Ирц ба оноо батлах", icon = Icons.Rounded.Verified, enabled = !offline) {
            nav.push("attendance:${event.id}") { AttendanceManageScreen(event) }
        }
        if (event.isOpen) {
            ListDivider()
            RowButton("Ирцийн QR код", icon = Icons.Rounded.QrCode2, enabled = !offline, onClick = onQR)
        }
    }
}

@Composable
private fun RegistrationSection(
    event: EventRecord,
    offline: Boolean,
    busy: Boolean,
    notice: Pair<String, NoticeKind>?,
    onRegister: () -> Unit,
    onWithdraw: () -> Unit,
) {
    ListSection(header = "Миний бүртгэл") {
        if (notice != null) {
            NoticeView(notice.first, notice.second, Modifier.padding(vertical = 11.dp))
            ListDivider()
        }
        val rowMod = Modifier.padding(vertical = 11.dp)
        when {
            event.myStatus == "registered" -> {
                IconLabel("Та бүртгүүлсэн байна. Арга хэмжээн дээр QR уншуулж ирцээ батлаарай.", Icons.Rounded.CheckCircle, rowMod, color = Theme.success)
                if (event.isOpen) {
                    ListDivider()
                    RowButton("Бүртгэл цуцлах", color = Theme.danger, enabled = !busy && !offline, onClick = onWithdraw)
                }
            }
            event.myStatus == "attended" -> IconLabel("Таны ирц баталгаажсан.", Icons.Rounded.Verified, rowMod, color = Theme.success)
            event.myStatus == "absent" -> IconLabel("Ирээгүй гэж тэмдэглэгдсэн.", Icons.Rounded.HighlightOff, rowMod, color = Theme.warning)
            event.isOpen && !event.isFull -> PrimaryButton(
                "Бүртгүүлэх", Modifier.padding(vertical = 8.dp), icon = Icons.Rounded.AddCircle, fillWidth = true,
                busy = busy, enabled = !busy && !offline, onClick = onRegister,
            )
            event.isFull -> IconLabel("Хүний тоо дүүрсэн тул бүртгэл хаагдсан.", Icons.Rounded.PersonOff, rowMod, color = Theme.secondaryText)
            else -> IconLabel("Бүртгэл хаагдсан.", Icons.Rounded.Lock, rowMod, color = Theme.secondaryText)
        }
    }
}

@Composable
private fun ParticipantsSection(
    event: EventRecord,
    open: Boolean,
    participants: List<Participant>?,
    error: String?,
    onToggle: () -> Unit,
) {
    ListSection {
        val rotation by animateFloatAsState(if (open) 0f else -90f, label = "disclosure")
        ListRow(onClick = onToggle) {
            IconLabel("Оролцогчид (${event.registeredCount})", Icons.Rounded.Groups, Modifier.weight(1f), iconColor = Theme.accent)
            Icon(Icons.Rounded.ExpandMore, null, tint = Theme.accent, modifier = Modifier.size(22.dp).graphicsLayer { rotationZ = rotation })
        }
        if (open) {
            ListDivider()
            when {
                participants != null -> {
                    if (participants.isEmpty()) {
                        Text("Одоогоор бүртгүүлсэн хүн алга.", style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
                    }
                    participants.forEachIndexed { i, p ->
                        if (i > 0) ListDivider()
                        ListRow {
                            Text(p.name.ifEmpty { "—" }, style = SdyType.body, color = Color.White, modifier = Modifier.weight(1f))
                            Text(Labels.attendance(p.status), style = SdyType.caption, color = Theme.secondaryText)
                        }
                    }
                }
                error != null -> Text(error, style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
                else -> Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(20.dp), color = Theme.secondaryText, strokeWidth = 2.dp)
                }
            }
        }
    }
}

package mn.esdy.member.features.manage

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircleOutline
import androidx.compose.material.icons.rounded.HighlightOff
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.PersonAdd
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.text.Collator
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.util.Locale
import kotlin.math.max
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.APIError
import mn.esdy.member.core.AppConfig
import mn.esdy.member.core.Formatters
import mn.esdy.member.core.Haptics
import mn.esdy.member.core.addParticipant
import mn.esdy.member.core.branchPeople
import mn.esdy.member.core.createEvent
import mn.esdy.member.core.issueCheckin
import mn.esdy.member.core.markAttendance
import mn.esdy.member.core.participants
import mn.esdy.member.core.updateEvent
import mn.esdy.member.design.ActionSheet
import mn.esdy.member.design.BarTextButton
import mn.esdy.member.design.ErrorStateView
import mn.esdy.member.design.FormSheet
import mn.esdy.member.design.FormTextField
import mn.esdy.member.design.Labels
import mn.esdy.member.design.ListDivider
import mn.esdy.member.design.ListRow
import mn.esdy.member.design.ListSection
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.PickerRow
import mn.esdy.member.design.RowButton
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SecondaryButton
import mn.esdy.member.design.SheetAction
import mn.esdy.member.design.Theme
import mn.esdy.member.design.ToggleRow
import mn.esdy.member.design.pressable
import mn.esdy.member.features.events.InlineListScreen
import mn.esdy.member.models.BranchPerson
import mn.esdy.member.models.EventDraft
import mn.esdy.member.models.EventRecord
import mn.esdy.member.models.Participant

// region Editor

/**
 * Creates or edits an event (Тэргүүн, Дэд тэргүүн, Нарийн бичиг — events.manage).
 * Points cannot change once attendance is recorded; the server says so.
 */
@Composable
fun EventEditorSheet(event: EventRecord?, onDismiss: () -> Unit, onSaved: (EventRecord) -> Unit) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(event?.let { EventDraft.from(it) } ?: EventDraft()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun save() {
        busy = true; error = null
        scope.launch {
            try {
                val saved = if (event != null) app.api.updateEvent(event.id, draft) else app.api.createEvent(draft)
                Haptics.success()
                onSaved(saved)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                error = APIError.wrap(e).message
                Haptics.error()
            } finally { busy = false }
        }
    }

    FormSheet(
        title = if (event == null) "Шинэ арга хэмжээ" else "Засах",
        onDismiss = onDismiss,
        confirmTitle = "Хадгалах",
        confirmEnabled = !busy && draft.isValid && !app.isOffline,
        busy = busy,
        onConfirm = { save() },
    ) {
        error?.let { item { ListSection { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 11.dp)) } } }
        item {
            ListSection {
                FormTextField(draft.title, { draft = draft.copy(title = it) }, "Нэр")
                ListDivider()
                FormTextField(draft.description, { draft = draft.copy(description = it) }, "Тайлбар", singleLine = false, minLines = 3, maxLines = 8)
                ListDivider()
                FormTextField(draft.location, { draft = draft.copy(location = it) }, "Байршил")
            }
        }
        item {
            ListSection(header = "Хугацаа") {
                DateTimeRow("Эхлэх", draft.startsAt) { draft = draft.copy(startsAt = it) }
                ListDivider()
                ToggleRow("Дуусах цагтай", draft.hasEnd, { draft = draft.copy(hasEnd = it) })
                if (draft.hasEnd) {
                    ListDivider()
                    DateTimeRow("Дуусах", draft.endsAt, min = draft.startsAt) { draft = draft.copy(endsAt = it) }
                }
            }
        }
        item {
            ListSection(footer = "Ирц баталгаажмагц гишүүнд ирцийн оноо орно. Ирц бүртгэгдсэний дараа оноог өөрчлөх боломжгүй.") {
                FormTextField(draft.capacity, { draft = draft.copy(capacity = it.filter(Char::isDigit)) }, "Хүний тоо (хоосон бол хязгааргүй)", keyboardType = KeyboardType.Number)
                ListDivider()
                NumberRow("Ирцийн оноо", draft.pointsValue) { draft = draft.copy(pointsValue = it) }
                ListDivider()
                NumberRow("Санал бүрийн оноо", draft.votePoints) { draft = draft.copy(votePoints = it) }
            }
        }
        if (event != null) {
            item {
                ListSection {
                    PickerRow(
                        "Төлөв", listOf("planned", "done", "cancelled"), draft.status,
                        title = { when (it) { "planned" -> "Төлөвлөсөн"; "done" -> "Болсон"; else -> "Цуцалсан" } },
                        onSelect = { draft = draft.copy(status = it) },
                    )
                }
            }
        }
    }
}

@Composable
private fun NumberRow(label: String, value: String, onChange: (String) -> Unit) {
    ListRow {
        Text(label, style = SdyType.body, color = Color.White, modifier = Modifier.weight(1f))
        FormTextField(
            value, { onChange(it.filter(Char::isDigit)) }, "0", keyboardType = KeyboardType.Number,
            modifier = Modifier.widthIn(max = 100.dp), textStyle = SdyType.body.copy(textAlign = TextAlign.End),
        )
    }
}

/** A date and a time in Ulaanbaatar, each opening its picker (iOS DatePicker). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateTimeRow(label: String, value: Instant, min: Instant? = null, onChange: (Instant) -> Unit) {
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    val local = value.atZone(Formatters.zone)
    ListRow {
        Text(label, style = SdyType.body, color = Color.White, modifier = Modifier.weight(1f))
        Chip(Formatters.day(value.toString())) { pickDate = true }
        Chip(Formatters.time(value)) { pickTime = true }
    }
    if (pickDate) {
        val minDay = min?.atZone(Formatters.zone)?.toLocalDate()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = local.toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                    if (minDay == null) return true
                    return !Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate().isBefore(minDay)
                }
            },
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        val day = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                        onChange(clamp(day.atTime(local.toLocalTime()).atZone(Formatters.zone).toInstant(), min))
                    }
                    pickDate = false
                }) { Text("OK", color = Theme.accent) }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text("Болих", color = Theme.accent) } },
            colors = DatePickerDefaults.colors(containerColor = Theme.cardRaised),
        ) { DatePicker(state, colors = DatePickerDefaults.colors(containerColor = Theme.cardRaised, selectedDayContainerColor = Theme.brandRed, todayDateBorderColor = Theme.accent, todayContentColor = Theme.accent)) }
    }
    if (pickTime) {
        val state = rememberTimePickerState(initialHour = local.hour, initialMinute = local.minute, is24Hour = true)
        Dialog(onDismissRequest = { pickTime = false }) {
            Column(
                Modifier.background(Theme.cardRaised, RoundedCornerShape(28.dp)).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                TimePicker(state, colors = TimePickerDefaults.colors(selectorColor = Theme.brandRed, timeSelectorSelectedContainerColor = Theme.brandRed, timeSelectorSelectedContentColor = Color.White))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { pickTime = false }) { Text("Болих", color = Theme.accent) }
                    TextButton(onClick = {
                        val t = LocalTime.of(state.hour, state.minute)
                        onChange(clamp(local.toLocalDate().atTime(t).atZone(Formatters.zone).toInstant(), min))
                        pickTime = false
                    }) { Text("OK", color = Theme.accent) }
                }
            }
        }
    }
}

private fun clamp(value: Instant, min: Instant?): Instant = if (min != null && value < min) min else value

@Composable
private fun Chip(text: String, onClick: () -> Unit) {
    Text(
        text, style = SdyType.body, color = Color.White,
        modifier = Modifier.pressable(0.95f, onClick = onClick).background(Theme.fill, RoundedCornerShape(8.dp)).padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

// endregion

// region Attendance

/**
 * Ирц батлах: the organiser marks who came — which awards the event's
 * points — or did not, and adds somebody who is not on the list.
 */
@Composable
fun AttendanceManageScreen(event: EventRecord) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var participants by remember { mutableStateOf<List<Participant>?>(null) }
    var people by remember { mutableStateOf<List<BranchPerson>>(emptyList()) }
    var error by remember { mutableStateOf<APIError?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var adding by remember { mutableStateOf(false) }

    suspend fun load() {
        try {
            coroutineScope {
                val list = async { app.api.participants(event.id) }
                val branch = async { app.api.branchPeople() }
                participants = list.await().participants
                val collator = Collator.getInstance(Locale("mn"))
                people = branch.await().members.sortedWith { a, b -> collator.compare(a.name, b.name) }
            }
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            error = APIError.wrap(e)
        }
    }

    fun mark(p: Participant, status: String) {
        if (status == p.status) return
        busy = p.userId; actionError = null
        scope.launch {
            try {
                // A correction of a recorded attendance needs a reason (the server checks).
                app.api.markAttendance(event.id, p.userId, status, if (p.status == "registered") "" else "Зохион байгуулагч апп-аар залруулсан")
                Haptics.success()
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                actionError = APIError.wrap(e).message; Haptics.error()
            } finally { busy = null }
        }
    }

    fun add(person: BranchPerson) {
        busy = person.userId; actionError = null
        scope.launch {
            try {
                app.api.addParticipant(event.id, person.userId)
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                actionError = APIError.wrap(e).message
            } finally { busy = null }
        }
    }

    LaunchedEffect(event.id) { load() }

    InlineListScreen(title = "Ирц батлах", silk = false, onRefresh = { load() }) {
        item {
            ListSection {
                Text(
                    "«Ирсэн» гэж баталгаажуулахад ${(event.pointsValue ?: 0.0).toInt()} оноо орно; буцаавал хасагдана.",
                    style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp),
                )
                ListDivider()
                RowButton("Оролцогч нэмэх", icon = Icons.Rounded.PersonAdd, enabled = people.isNotEmpty() && !app.isOffline) { adding = true }
            }
        }
        actionError?.let { item { ListSection { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 11.dp)) } } }
        val list = participants
        val err = error
        when {
            list != null -> item {
                ListSection(header = "Оролцогчид (${list.size})") {
                    if (list.isEmpty()) Text("Одоогоор бүртгүүлсэн хүн алга.", style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
                    list.forEachIndexed { i, p ->
                        if (i > 0) ListDivider()
                        ParticipantRow(p, busy, app.isOffline) { mark(p, it) }
                    }
                }
            }
            err != null -> item { ListSection { ErrorStateView(err) { scope.launch { load() } } } }
            else -> item {
                ListSection {
                    Box(Modifier.fillMaxWidth().padding(vertical = 11.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(Modifier.size(20.dp), color = Theme.secondaryText, strokeWidth = 2.dp)
                    }
                }
            }
        }
    }

    if (adding) {
        val listed = participants ?: emptyList()
        ActionSheet(
            title = "Оролцогч нэмэх",
            actions = people.filter { person -> listed.none { it.userId == person.userId } }.take(30)
                .map { person -> SheetAction(person.name.ifEmpty { person.email }) { add(person) } },
            onDismiss = { adding = false },
        )
    }
}

@Composable
private fun ParticipantRow(p: Participant, busy: String?, offline: Boolean, onMark: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ListRow {
        Column(Modifier.weight(1f)) {
            Text(p.name.ifEmpty { p.email }, style = SdyType.body, color = Color.White)
            Text(Labels.attendance(p.status), style = SdyType.caption, color = Theme.secondaryText)
        }
        if (busy == p.userId) CircularProgressIndicator(Modifier.size(18.dp), color = Theme.secondaryText, strokeWidth = 2.dp)
        Box {
            val enabled = busy == null && !offline
            Box(
                Modifier.size(Theme.minTap).pressable(0.9f, enabled = enabled) { open = true }
                    .semantics { contentDescription = "${p.name}: ирц өөрчлөх" },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Rounded.MoreHoriz, null, tint = if (enabled) Theme.accent else Theme.tertiaryText, modifier = Modifier.size(24.dp)) }
            DropdownMenu(open, onDismissRequest = { open = false }, containerColor = Theme.cardRaised) {
                listOf(
                    Triple("attended", "Ирсэн", Icons.Rounded.CheckCircleOutline),
                    Triple("absent", "Ирээгүй", Icons.Rounded.HighlightOff),
                    Triple("registered", "Бүртгүүлсэн", Icons.Rounded.RadioButtonUnchecked),
                ).forEach { (status, title, icon) ->
                    DropdownMenuItem(
                        text = { Text(title, color = Color.White) },
                        leadingIcon = { Icon(icon, null, tint = Theme.secondaryText) },
                        onClick = { open = false; onMark(status) },
                    )
                }
            }
        }
    }
}

// endregion

// region Check-in QR

/**
 * Ирцийн QR: the code members scan at the event. It lasts five minutes and
 * is renewed before it runs out while the screen is open.
 */
@Composable
fun CheckinQRScreen(event: EventRecord, onDismiss: () -> Unit) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var image by remember { mutableStateOf<Bitmap?>(null) }
    var expires by remember { mutableStateOf<Instant?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun issue() {
        try {
            val code = app.api.issueCheckin(event.id)
            val url = "${AppConfig.webOrigin}/member/check-in#event=${fragmentEncode(event.id)}&token=${fragmentEncode(code.token)}"
            image = qr(url)
            expires = Formatters.parseDate(code.expiresAt) ?: Instant.now().plusSeconds(300)
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            error = APIError.wrap(e).message
        }
    }

    LaunchedEffect(event.id) {
        while (isActive) {
            issue()
            val left = expires?.let { (it.toEpochMilli() - System.currentTimeMillis()) / 1000.0 } ?: 60.0
            delay((max(30.0, left - 20) * 1000).toLong())
        }
    }

    Column(Modifier.fillMaxSize().background(Theme.canvas)) {
        Box(Modifier.fillMaxWidth().statusBarsPadding().height(48.dp).padding(horizontal = 8.dp)) {
            Text("Ирцийн QR", style = SdyType.headline, color = Color.White, modifier = Modifier.align(Alignment.Center))
            Box(Modifier.align(Alignment.CenterEnd)) { BarTextButton("Хаах", bold = true, onClick = onDismiss) }
        }
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically),
        ) {
            Text(event.title, style = SdyType.title3.copy(fontWeight = FontWeight.Bold), color = Color.White, textAlign = TextAlign.Center)
            val img = image
            val err = error
            when {
                img != null -> {
                    Image(
                        img.asImageBitmap(), "Ирцийн QR код", filterQuality = FilterQuality.None,
                        modifier = Modifier.widthIn(max = 300.dp).fillMaxWidth()
                            .background(Color.White, RoundedCornerShape(16.dp)).padding(16.dp),
                    )
                    expires?.let { at ->
                        val left by produceState(secondsUntil(at), at) {
                            while (true) { value = secondsUntil(at); delay(1000) }
                        }
                        Text("${Formatters.clock(left)}-ийн дараа шинэчлэгдэнэ", style = SdyType.footnote, color = Theme.secondaryText)
                    }
                    Text("Гишүүд E-sdy апп-ын «Ирц» хэсгээр уншуулна.", style = SdyType.footnote, color = Theme.secondaryText, textAlign = TextAlign.Center)
                }
                err != null -> {
                    NoticeView(err, NoticeKind.Error)
                    SecondaryButton("Дахин") { scope.launch { issue() } }
                }
                else -> CircularProgressIndicator(color = Theme.secondaryText)
            }
        }
    }
}

private fun secondsUntil(at: Instant): Int = max(0, ((at.toEpochMilli() - System.currentTimeMillis()) / 1000).toInt())

/** Unreserved characters stay; everything else is percent-encoded (iOS: alphanumerics + "-._~"). */
private fun fragmentEncode(value: String): String = buildString {
    value.toByteArray(Charsets.UTF_8).forEach { b ->
        val c = b.toInt().toChar()
        if (b >= 0 && (c.isLetterOrDigit() || c in "-._~")) append(c) else append("%%%02X".format(b.toInt() and 0xFF))
    }
}

private fun qr(text: String): Bitmap? = try {
    val matrix = QRCodeWriter().encode(
        text, BarcodeFormat.QR_CODE, 0, 0,
        mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to 1),
    )
    val scale = 10
    val w = matrix.width * scale
    val h = matrix.height * scale
    val pixels = IntArray(w * h)
    for (y in 0 until h) for (x in 0 until w) {
        pixels[y * w + x] = if (matrix.get(x / scale, y / scale)) android.graphics.Color.BLACK else android.graphics.Color.WHITE
    }
    Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888)
} catch (e: Exception) {
    null
}

// endregion


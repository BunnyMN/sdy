package mn.esdy.member.features.dues

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.AccessTime
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.HighlightOff
import androidx.compose.material.icons.rounded.HourglassTop
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.ThumbUp
import androidx.compose.material.icons.rounded.Warning
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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.*
import mn.esdy.member.design.*
import mn.esdy.member.models.Charge
import mn.esdy.member.models.DuesMath
import mn.esdy.member.models.DuesSettings
import mn.esdy.member.models.MyDuesPage
import mn.esdy.member.models.MyDuesTotals
import mn.esdy.member.models.Payment

@Composable
fun DuesScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf<DuesSettings?>(null) }
    var page by remember { mutableStateOf<MyDuesPage?>(null) }
    var error by remember { mutableStateOf<APIError?>(null) }
    var loadingMore by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf<Charge?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try {
            val (s, p) = coroutineScope {
                val s = async { app.api.duesSettings() }
                val p = async { app.api.myDues() }
                s.await() to p.await()
            }
            settings = s
            page = p
            error = null
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            error = APIError.wrap(e)
        }
    }

    fun more() {
        val current = page ?: return
        loadingMore = true
        scope.launch {
            try {
                val next = app.api.myDues(offset = current.nextOffset ?: current.charges.size)
                page = next.copy(
                    charges = current.charges + next.charges,
                    payments = current.payments + next.payments,
                    totals = next.totals ?: current.totals,
                )
            } catch (_: Exception) {
                notice = null
                error = null
            } finally { loadingMore = false }
        }
    }

    LaunchedEffect(Unit) { if (page == null) load() }

    SdyListScreen(title = "Хураамж", onRefresh = { load() }) {
        val p = page
        val err = error
        when {
            p != null -> content(p, settings, notice, loadingMore, app.isOffline, onReport = { reporting = it; notice = null }, onMore = ::more)
            err != null -> item { ErrorStateView(err) { scope.launch { load() } } }
            else -> item { SkeletonList(4, Modifier.padding(0.dp)) }
        }
    }

    reporting?.let { charge ->
        ReportPaymentSheet(charge, onDismiss = { reporting = null }) {
            notice = "Төлбөрийн мэдэгдэл илгээгдлээ. Санхүү шалгаж баталгаажуулна."
            scope.launch { load() }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.content(
    page: MyDuesPage,
    settings: DuesSettings?,
    notice: String?,
    loadingMore: Boolean,
    offline: Boolean,
    onReport: (Charge) -> Unit,
    onMore: () -> Unit,
) {
    if (notice != null) item { ListSection { NoticeView(notice, NoticeKind.Success, Modifier.padding(vertical = 12.dp)) } }
    val totals = page.totals
    if (totals != null && totals.charged > 0) item { ListSection { Summary(totals) } }
    if (settings != null) {
        if (settings.enabled) {
            item {
                ListSection(
                    header = "Шилжүүлэх данс",
                    footer = "Банкны аппаар шилжүүлсний дараа доорх хураамж дээр «Төлбөр мэдэгдэх» товчийг дарна уу. Апп дотор төлбөр авахгүй.",
                ) {
                    if (settings.monthlyAmount > 0) {
                        LabeledRow("Сарын хураамж", Formatters.money(settings.monthlyAmount))
                        ListDivider()
                    }
                    CopyRow("Банк", settings.bankName)
                    ListDivider()
                    CopyRow("Дансны дугаар", settings.accountNumber)
                    ListDivider()
                    CopyRow("Хүлээн авагч", settings.accountHolder)
                    if (settings.instructions.isNotEmpty()) {
                        ListDivider()
                        Text(settings.instructions, style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
                    }
                }
            }
        } else {
            item {
                ListSection {
                    ListRow {
                        Icon(Icons.Rounded.Info, null, tint = Theme.secondaryText, modifier = Modifier.size(20.dp))
                        Text("Танай салбар хураамжийн тохиргоо хийгээгүй байна.", style = SdyType.body, color = Theme.secondaryText)
                    }
                }
            }
        }
    }
    item {
        ListSection(header = "Хураамжууд") {
            if (page.charges.isEmpty()) {
                Text("Танд ногдуулсан хураамж алга.", style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
            }
            page.charges.forEachIndexed { i, charge ->
                if (i > 0) ListDivider()
                ChargeRow(charge, page.payments, offline) { onReport(charge) }
            }
        }
    }
    if (page.payments.isNotEmpty()) {
        item {
            ListSection(header = "Төлөлтийн түүх") {
                page.payments.forEachIndexed { i, payment ->
                    if (i > 0) ListDivider()
                    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(Formatters.money(payment.amount), style = SdyType.headline, color = Color.White, modifier = Modifier.weight(1f))
                            StatusChip(paymentChip(payment.status))
                        }
                        Text(payment.reference, style = SdyType.subheadline, color = Theme.secondaryText)
                        if (payment.reviewNote.isNotEmpty()) Text(payment.reviewNote, style = SdyType.footnote, color = Color.White)
                        Text(Formatters.dateTime(payment.createdAt), style = SdyType.caption, color = Theme.secondaryText)
                    }
                }
            }
        }
    }
    if (page.hasMore) {
        item { ListSection { RowButton("Цааш үзэх", center = true, busy = loadingMore, onClick = onMore) } }
    }
}

@Composable
private fun Summary(totals: MyDuesTotals) {
    val left = max(0.0, totals.outstanding - totals.pending)
    val pendingPct = min(100 - totals.paidPercent, DuesMath.percent(totals.pending, totals.owed))
    Column(Modifier.padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("Миний хураамж", style = SdyType.headline, color = Color.White, modifier = Modifier.weight(1f))
            Text("${totals.paidPercent}% төлсөн", style = SdyType.title2, color = Theme.success)
        }
        DuesProgressBar(totals.paidPercent, pendingPct)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Stat("Ногдуулсан", totals.owed, Modifier.weight(1f))
            Stat("Төлсөн", totals.paid, Modifier.weight(1f), accent = true)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Stat("Шалгагдаж буй", totals.pending, Modifier.weight(1f))
            Stat("Үлдэгдэл", left, Modifier.weight(1f), danger = left > 0)
        }
        Text("Шалгагдаж буй төлбөр санхүү баталсны дараа «Төлсөн»-д орно.", style = SdyType.caption, color = Theme.secondaryText)
    }
}

@Composable
private fun Stat(label: String, value: Double, modifier: Modifier, accent: Boolean = false, danger: Boolean = false) {
    Column(modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = SdyType.caption, color = Theme.secondaryText)
        Text(
            Formatters.money(value), style = SdyType.subheadline.copy(fontWeight = FontWeight.Bold),
            color = if (accent) Theme.success else if (danger) Theme.danger else Color.White,
        )
    }
}

@Composable
private fun ChargeRow(charge: Charge, payments: List<Payment>, offline: Boolean, onReport: () -> Unit) {
    val overdue = charge.isOverdue()
    val parts = payments.filter { it.chargeId == charge.id }
    val paidPct = DuesMath.percent(charge.paid, if (charge.waived) min(charge.amount, charge.paid) else charge.amount)
    val pending = charge.pending ?: 0.0
    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(charge.period, style = SdyType.headline, color = Color.White, modifier = Modifier.weight(1f))
            Text(Formatters.money(charge.amount), style = SdyType.headline, color = Color.White)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            when {
                charge.waived -> StatusChip("Чөлөөлсөн", Icons.Rounded.ThumbUp, Tone.Neutral)
                charge.balance <= 0 -> StatusChip("Төлөгдсөн", Icons.Rounded.CheckCircle, Tone.Success)
                overdue -> StatusChip("Хугацаа хэтэрсэн", Icons.Rounded.Warning, Tone.Danger)
                else -> StatusChip("Төлөх", Icons.Rounded.AccessTime, Tone.Warning)
            }
            if (pending > 0) StatusChip("Шалгагдаж буй ${Formatters.money(pending)}", Icons.Rounded.HourglassTop, Tone.Info)
        }
        DuesProgressBar(paidPct, min(100 - paidPct, DuesMath.percent(pending, charge.amount)))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Төлсөн: ${Formatters.money(charge.paid)} · Үлдэгдэл: ${Formatters.money(charge.balance)}", style = SdyType.footnote, color = Theme.secondaryText)
            Text("Төлөх хугацаа: ${Formatters.day(charge.dueDate)}", style = SdyType.footnote, color = if (overdue) Theme.danger else Theme.secondaryText)
            if (charge.waived && charge.waiverReason.isNotEmpty()) {
                Text("Чөлөөлсөн шалтгаан: ${charge.waiverReason}", style = SdyType.footnote, color = Theme.secondaryText)
            }
        }
        parts.forEach { part ->
            Row {
                Text(Formatters.money(part.amount), style = SdyType.caption, color = Color.White, modifier = Modifier.weight(1f))
                Text(
                    Labels.payment(part.status), style = SdyType.caption,
                    color = when (part.status) { "approved" -> Theme.success; "pending" -> Theme.secondaryText; else -> Theme.danger },
                )
            }
        }
        if (charge.reportable > 0) {
            SecondaryButton("Төлбөр мэдэгдэх", icon = Icons.AutoMirrored.Rounded.Send, fillWidth = true, enabled = !offline, onClick = onReport)
        } else if (charge.balance > 0) {
            Text("Үлдэгдлийг бүхэлд нь мэдэгдсэн. Санхүүгийн баталгаажуулалтыг хүлээж байна.", style = SdyType.caption, color = Theme.secondaryText)
        }
    }
}

private fun paymentChip(status: String): Chip = when (status) {
    "approved" -> Chip(Labels.payment(status), Icons.Rounded.CheckCircle, Tone.Success)
    "pending" -> Chip(Labels.payment(status), Icons.Rounded.HourglassTop, Tone.Warning)
    else -> Chip(Labels.payment(status), Icons.Rounded.HighlightOff, Tone.Danger)
}

@Composable
fun ReportPaymentSheet(charge: Charge, onDismiss: () -> Unit, onSent: () -> Unit) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val left = charge.reportable
    var parts by remember { mutableStateOf(1) }
    var amountText by remember { mutableStateOf(left.toLong().toString()) }
    var reference by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    // One key per sheet: a retried submit is the same report, not a second one.
    val requestKey = remember { UUID.randomUUID().toString().lowercase() }

    val amount = amountText.filter { it.isDigit() }.toDoubleOrNull() ?: 0.0
    val valid = amount >= 1 && amount <= left && reference.isNotBlank()

    fun submit() {
        busy = true; error = null
        scope.launch {
            try {
                app.api.reportPayment(charge.id, requestKey, amount, reference.trim())
                Haptics.success()
                onSent()
                onDismiss()
            } catch (e: Throwable) {
                Haptics.error()
                error = APIError.wrap(e).message
            } finally { busy = false }
        }
    }

    FormSheet(title = "Төлбөр мэдэгдэх", onDismiss = onDismiss, confirmTitle = "Илгээх", confirmEnabled = valid, busy = busy, onConfirm = ::submit) {
        item {
            ListSection {
                LabeledRow("Хураамж", charge.period)
                ListDivider()
                LabeledRow("Мэдэгдэх боломжтой", Formatters.money(left))
            }
        }
        val choices = DuesMath.partChoices(left)
        if (choices.size > 1) {
            item {
                ListSection(header = "Хэдэн хэсэгт хувааж төлөх вэ?") {
                    SegmentedControl(
                        choices, parts, title = { if (it == 1) "Бүтэн" else "$it хуваах" },
                        onSelect = { n -> parts = n; amountText = DuesMath.partAmount(left, n).toLong().toString() },
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }
            }
        }
        item {
            ListSection(
                header = "Шилжүүлсэн мэдээлэл",
                footerContent = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (amount > left) Text("Дүн нь мэдэгдэх боломжтой үлдэгдлээс их байна.", style = SdyType.footnote, color = Theme.danger)
                        Text(
                            "Энэ хэсэг: ${Formatters.money(min(amount, left))} · Дараа нь үлдэх: ${Formatters.money(max(0.0, left - amount))}",
                            style = SdyType.footnote, color = Theme.secondaryText,
                        )
                        Text(
                            "Банкны гүйлгээнд бичсэн утгаа яг адилхан оруулна уу. Санхүү баталсны дараа төлөгдсөнд тооцогдоно.",
                            style = SdyType.footnote, color = Theme.secondaryText,
                        )
                    }
                },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    FormTextField(
                        amountText, { v -> amountText = v.filter { it.isDigit() } }, "Дүн",
                        modifier = Modifier.weight(1f), keyboardType = KeyboardType.Number, imeAction = ImeAction.Next,
                        textStyle = SdyType.title3,
                    )
                    Text("₮", style = SdyType.body, color = Theme.secondaryText)
                }
                ListDivider()
                FormTextField(
                    reference, { reference = it.take(128) }, "Гүйлгээний утга",
                    capitalization = KeyboardCapitalization.Characters, autoCorrect = false,
                    imeAction = ImeAction.Send, onSubmit = { if (valid && !busy) submit() },
                )
            }
        }
        error?.let { item { ListSection { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 12.dp)) } } }
    }
}

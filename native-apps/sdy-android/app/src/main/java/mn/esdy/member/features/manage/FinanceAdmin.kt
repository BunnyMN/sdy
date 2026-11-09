package mn.esdy.member.features.manage

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.unit.dp
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.*
import mn.esdy.member.design.*
import mn.esdy.member.models.FinanceCharge
import mn.esdy.member.models.FinanceOverview
import mn.esdy.member.models.FinancePayment

private enum class FinanceTab(val title: String) { Payments("Төлөлт"), Charges("Хураамж") }

private enum class DecisionKind(val title: String) { Approve("Батлах"), Reject("Татгалзах"), Reverse("Буцаах"), Waive("Чөлөөлөх") }

private data class Decision(val kind: DecisionKind, val id: String, val title: String)

/** The last twelve months, newest first ("2026-11"). */
private val periods: List<String> = run {
    val f = DateTimeFormatter.ofPattern("yyyy-MM")
    val now = YearMonth.now(Formatters.zone)
    (0 until 12).map { now.minusMonths(it.toLong()).format(f) }
}

/**
 * Санхүү: the treasurer sees every charge and payment, confirms or rejects
 * reported transfers, waives a charge and raises a month's dues. Every
 * decision needs a reason; the server keeps them.
 */
@Composable
fun FinanceAdminScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<FinanceOverview?>(null) }
    var error by remember { mutableStateOf<APIError?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var period by remember { mutableStateOf("") }
    var showing by remember { mutableStateOf(FinanceTab.Payments) }
    var deciding by remember { mutableStateOf<Decision?>(null) }
    var confirmCharges by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    suspend fun load() {
        try { data = app.api.financeOverview(period = period); error = null } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            error = APIError.wrap(e)
        }
    }

    fun more() {
        val current = data ?: return
        val next = current.nextOffset ?: return
        busy = true
        scope.launch {
            try {
                val page = app.api.financeOverview(period = period, offset = next)
                data = page.copy(charges = current.charges + page.charges, payments = current.payments + page.payments)
            } catch (e: Throwable) { actionError = APIError.wrap(e).message } finally { busy = false }
        }
    }

    suspend fun decide(decision: Decision, reason: String): Boolean {
        busy = true; actionError = null; notice = null
        return try {
            when (decision.kind) {
                DecisionKind.Approve -> app.api.reviewPayment(decision.id, "approve", reason)
                DecisionKind.Reject -> app.api.reviewPayment(decision.id, "reject", reason)
                DecisionKind.Reverse -> app.api.reviewPayment(decision.id, "reverse", reason)
                DecisionKind.Waive -> app.api.waiveCharge(decision.id, reason)
            }
            notice = "Хадгалагдлаа."
            Haptics.success()
            load()
            true
        } catch (e: Throwable) {
            actionError = APIError.wrap(e).message
            Haptics.error()
            false
        } finally { busy = false }
    }

    fun raiseCharges() {
        busy = true; actionError = null; notice = null
        scope.launch {
            try {
                app.api.createCharges(periods[0])
                notice = "${periods[0]} сарын хураамж ногдууллаа."
                load()
            } catch (e: Throwable) { actionError = APIError.wrap(e).message } finally { busy = false }
        }
    }

    LaunchedEffect(period) { load() }

    val actionsEnabled = !busy && !app.isOffline
    SdyListScreen(title = "Санхүү", silk = false, onRefresh = { load() }) {
        item {
            ListSection {
                PickerRow("Сар", listOf("") + periods, period, title = { it.ifEmpty { "Бүх сар" } }, onSelect = { period = it })
                data?.totals?.let { t ->
                    ListDivider(); LabeledRow("Ногдуулсан", Formatters.money(t.charged))
                    ListDivider(); LabeledRow("Орсон", Formatters.money(t.received))
                    ListDivider(); LabeledRow("Төлөгдөөгүй", Formatters.money(t.outstanding))
                    ListDivider(); LabeledRow("Чөлөөлсөн", Formatters.money(t.waived))
                }
                ListDivider()
                RowButton("${periods[0]} сарын хураамж ногдуулах", icon = Icons.Rounded.AddCircleOutline, enabled = actionsEnabled) { confirmCharges = true }
            }
        }
        notice?.let { item { ListSection { NoticeView(it, NoticeKind.Success, Modifier.padding(vertical = 12.dp)) } } }
        actionError?.let { item { ListSection { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 12.dp)) } } }
        item {
            SegmentedControl(FinanceTab.entries, showing, title = { it.title }, onSelect = { showing = it }, modifier = Modifier.padding(bottom = 24.dp))
        }
        val d = data
        val err = error
        when {
            d != null -> {
                item {
                    when (showing) {
                        FinanceTab.Payments -> Payments(d.payments, actionsEnabled) { deciding = it }
                        FinanceTab.Charges -> Charges(d.charges, actionsEnabled) { deciding = it }
                    }
                }
                if (d.hasMore) item { ListSection { RowButton("Цааш үзэх", enabled = !busy) { more() } } }
            }
            err != null -> item { ErrorStateView(err) { scope.launch { load() } } }
            else -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) } }
        }
    }

    deciding?.let { decision ->
        ReasonSheet(decision.title, decision.kind.title, destructive = decision.kind != DecisionKind.Approve, onDismiss = { deciding = null }) { reason -> decide(decision, reason) }
    }
    if (confirmCharges) {
        ActionSheet(
            title = "${periods[0]} сарын хураамжийг бүх гишүүнд ногдуулах уу?",
            message = "Аль хэдийн ногдуулсан гишүүнд давхардахгүй.",
            actions = listOf(SheetAction("Ногдуулах") { raiseCharges() }),
            onDismiss = { confirmCharges = false },
        )
    }
}

@Composable
private fun Payments(list: List<FinancePayment>, enabled: Boolean, onDecide: (Decision) -> Unit) {
    ListSection(header = "Мэдэгдсэн төлөлт") {
        if (list.isEmpty()) Text("Төлөлт алга.", style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
        list.forEachIndexed { i, p ->
            if (i > 0) ListDivider()
            val title = "${p.name} · ${Formatters.money(p.amount)}"
            Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row {
                    Text(p.name.ifEmpty { "—" }, style = SdyType.headline, color = Color.White, modifier = Modifier.weight(1f))
                    Text(Formatters.money(p.amount), style = SdyType.headline, color = Color.White)
                }
                Text("${Labels.payment(p.status)} · ${p.reference} · ${Formatters.dateTime(p.createdAt)}", style = SdyType.caption, color = Theme.secondaryText)
                if (p.reviewNote.isNotEmpty()) Text(p.reviewNote, style = SdyType.caption, color = Color.White)
                if (p.status == "pending") {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PrimaryButton("Батлах", enabled = enabled) { onDecide(Decision(DecisionKind.Approve, p.id, title)) }
                        SecondaryButton("Татгалзах", color = Theme.danger, enabled = enabled) { onDecide(Decision(DecisionKind.Reject, p.id, title)) }
                    }
                } else if (p.status == "approved") {
                    SecondaryButton("Буцаах", color = Theme.danger, enabled = enabled) { onDecide(Decision(DecisionKind.Reverse, p.id, title)) }
                }
            }
        }
    }
}

@Composable
private fun Charges(list: List<FinanceCharge>, enabled: Boolean, onDecide: (Decision) -> Unit) {
    ListSection(header = "Ногдуулсан хураамж") {
        if (list.isEmpty()) Text("Хураамж алга.", style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
        list.forEachIndexed { i, c ->
            if (i > 0) ListDivider()
            Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row {
                    Text(c.name.ifEmpty { "—" }, style = SdyType.headline, color = Color.White, modifier = Modifier.weight(1f))
                    Text(c.period, style = SdyType.subheadline, color = Theme.secondaryText)
                }
                Text(
                    "Ногдуулсан ${Formatters.money(c.amount)} · Төлсөн ${Formatters.money(c.paid)} · Үлдэгдэл ${Formatters.money(c.balance)}",
                    style = SdyType.caption, color = Theme.secondaryText,
                )
                if (c.waived) {
                    Text("Чөлөөлсөн: ${c.waiverReason}", style = SdyType.caption, color = Theme.warning)
                } else if (c.balance > 0) {
                    SecondaryButton("Чөлөөлөх", enabled = enabled) { onDecide(Decision(DecisionKind.Waive, c.id, "${c.name} · ${c.period}")) }
                }
            }
        }
    }
}

/** Asks for the reason a decision needs, then runs it. */
@Composable
fun ReasonSheet(title: String, action: String, destructive: Boolean = false, onDismiss: () -> Unit, onSubmit: suspend (String) -> Boolean) {
    val scope = rememberCoroutineScope()
    var reason by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    FormSheet(
        title = action, onDismiss = onDismiss, confirmTitle = action, confirmDestructive = destructive,
        confirmEnabled = !busy && reason.isNotBlank() && reason.length <= 500, busy = busy,
        onConfirm = {
            busy = true
            scope.launch {
                val ok = onSubmit(reason.trim())
                busy = false
                if (ok) onDismiss()
            }
        },
    ) {
        item { ListSection { Text(title, style = SdyType.headline, color = Color.White, modifier = Modifier.padding(vertical = 11.dp)) } }
        item { ListSection(header = "Шалтгаан") { FormTextField(reason, { reason = it }, "Заавал бичнэ", singleLine = false, minLines = 2, maxLines = 5) } }
    }
}

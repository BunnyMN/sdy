package mn.esdy.member.features.manage

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
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AddCircle
import androidx.compose.material.icons.rounded.Remove
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.text.Collator
import java.util.Locale
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.*
import mn.esdy.member.design.*
import mn.esdy.member.models.BranchPerson
import mn.esdy.member.models.Sanction
import mn.esdy.member.models.SanctionList

/**
 * Хяналтын хороо: warn any member of the branch with a reason, perhaps
 * deducting points. Never oneself; every decision is kept and the member told.
 */
@Composable
fun SanctionsAdminScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<SanctionList?>(null) }
    var people by remember { mutableStateOf<List<BranchPerson>>(emptyList()) }
    var error by remember { mutableStateOf<APIError?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var composing by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    suspend fun load() {
        try {
            val (d, b) = coroutineScope {
                val d = async { app.api.sanctions() }
                val b = async { app.api.branchPeople() }
                d.await() to b.await()
            }
            list = d
            val collator = Collator.getInstance(Locale("mn"))
            people = b.members.sortedWith { x, y -> collator.compare(x.name, y.name) }
            error = null
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            error = APIError.wrap(e)
        }
    }

    fun more() {
        val current = list ?: return
        val next = current.nextOffset ?: return
        busy = true
        scope.launch {
            try {
                val page = app.api.sanctions(offset = next)
                list = page.copy(sanctions = current.sanctions + page.sanctions)
            } catch (e: Throwable) { actionError = APIError.wrap(e).message } finally { busy = false }
        }
    }

    /** True when recorded, so the sheet can close. */
    suspend fun record(userID: String, points: Int, reason: String): Boolean {
        actionError = null; notice = null
        return try {
            app.api.sanction(userID, points, reason)
            notice = "Шийдвэр бүртгэгдлээ."
            Haptics.success()
            load()
            true
        } catch (e: Throwable) {
            actionError = APIError.wrap(e).message
            Haptics.error()
            false
        }
    }

    LaunchedEffect(Unit) { load() }

    SdyListScreen(title = "Хяналтын хороо", silk = false, inline = true, onRefresh = { load() }) {
        item {
            ListSection {
                Text(
                    "Салбарын аль ч гишүүнд шалтгаантай сануулга өгч, шаардлагатай бол оноо хасна. Шийдвэр түүхэнд үлдэж, тухайн хүнд мэдэгдэл очно. Өөртөө шийдвэр гаргахгүй.",
                    style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp),
                )
                ListDivider()
                RowButton("Шинэ шийдвэр", icon = Icons.Rounded.AddCircle, enabled = people.isNotEmpty() && !app.isOffline) { composing = true }
            }
        }
        notice?.let { item { ListSection { NoticeView(it, NoticeKind.Success, Modifier.padding(vertical = 12.dp)) } } }
        actionError?.let { item { ListSection { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 12.dp)) } } }
        val l = list
        val err = error
        when {
            l != null -> item {
                ListSection(header = "Шийдвэрийн түүх") {
                    if (l.sanctions.isEmpty()) Text("Шийдвэр алга.", style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
                    l.sanctions.forEachIndexed { i, s ->
                        if (i > 0) ListDivider()
                        SanctionRow(s, showMember = true)
                    }
                    if (l.hasMore) {
                        ListDivider()
                        RowButton("Цааш үзэх", enabled = !busy) { more() }
                    }
                }
            }
            err != null -> item { ErrorStateView(err) { scope.launch { load() } } }
            else -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) } }
        }
    }

    if (composing) {
        SanctionComposer(people.filter { it.userId != app.me?.id }, onDismiss = { composing = false }) { id, points, reason ->
            record(id, points, reason)
        }
    }
}

@Composable
fun SanctionRow(sanction: Sanction, showMember: Boolean = false) {
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (showMember) Text(sanction.userName.ifEmpty { "—" }, style = SdyType.headline, color = Color.White)
            Box(Modifier.weight(1f))
            Text(
                if (sanction.points > 0) "−${sanction.points.toInt()} оноо" else "Сануулга",
                style = SdyType.subheadline.copy(fontWeight = FontWeight.SemiBold),
                color = if (sanction.points > 0) Theme.danger else Theme.secondaryText,
            )
        }
        Text(sanction.reason, style = SdyType.subheadline, color = Color.White)
        Text(
            listOfNotNull(Formatters.dateTime(sanction.createdAt), sanction.actorName.takeIf { it.isNotEmpty() }?.let { "Шийдвэрлэсэн: $it" }).joinToString(" · "),
            style = SdyType.caption, color = Theme.secondaryText,
        )
    }
}

@Composable
private fun SanctionComposer(people: List<BranchPerson>, onDismiss: () -> Unit, onSubmit: suspend (String, Int, String) -> Boolean) {
    val scope = rememberCoroutineScope()
    var userID by remember { mutableStateOf("") }
    var points by remember { mutableStateOf(0) }
    var reason by remember { mutableStateOf("") }
    var confirming by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    val chosen = people.firstOrNull { it.userId == userID }
    val ready = chosen != null && reason.isNotBlank() && reason.length <= 500
    val name = chosen?.name ?: ""
    val confirmTitle = if (points > 0) "$name-д $points оноо хасаж, сануулга өгөх үү?" else "$name-д сануулга өгөх үү?"

    FormSheet(
        title = "Шинэ шийдвэр", onDismiss = onDismiss, confirmTitle = "Бүртгэх",
        confirmEnabled = ready && !busy, busy = busy, onConfirm = { confirming = true },
    ) {
        item {
            ListSection {
                PickerRow(
                    "Гишүүн", listOf("") + people.map { it.userId }, userID,
                    title = { id -> if (id.isEmpty()) "Сонгох" else people.first { it.userId == id }.let { p -> p.name.ifEmpty { p.email } } },
                    onSelect = { userID = it },
                )
                ListDivider()
                ListRow {
                    Text("Хасах оноо", style = SdyType.body, color = Color.White)
                    Text(if (points == 0) "Зөвхөн сануулга" else "$points", style = SdyType.body, color = Theme.secondaryText, textAlign = androidx.compose.ui.text.style.TextAlign.End, modifier = Modifier.weight(1f))
                    Stepper(points, 0..10000) { points = it }
                }
            }
        }
        item {
            ListSection(header = "Шалтгаан") {
                FormTextField(reason, { reason = it }, "Юуны төлөө", singleLine = false, minLines = 3, maxLines = 6)
            }
        }
    }

    if (confirming) {
        ActionSheet(
            title = confirmTitle, message = reason,
            actions = listOf(
                SheetAction("Бүртгэх", destructive = true) {
                    busy = true
                    scope.launch {
                        val ok = onSubmit(userID, points, reason.trim())
                        busy = false
                        if (ok) onDismiss()
                    }
                },
            ),
            onDismiss = { confirming = false },
        )
    }
}

/** iOS Stepper: − and + in one rounded pill. */
@Composable
private fun Stepper(value: Int, range: IntRange, onChange: (Int) -> Unit) {
    Row(Modifier.background(Theme.fill, RoundedCornerShape(8.dp)), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(width = 46.dp, height = 32.dp)
                .pressable(0.9f, enabled = value > range.first) { onChange(value - 1) }
                .semantics { contentDescription = "Хасах" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Rounded.Remove, null, tint = if (value > range.first) Color.White else Theme.tertiaryText) }
        Box(Modifier.width(1.dp).height(18.dp).background(Theme.separator))
        Box(
            Modifier.size(width = 46.dp, height = 32.dp)
                .pressable(0.9f, enabled = value < range.last) { onChange(value + 1) }
                .semantics { contentDescription = "Нэмэх" },
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Rounded.Add, null, tint = if (value < range.last) Color.White else Theme.tertiaryText) }
    }
}

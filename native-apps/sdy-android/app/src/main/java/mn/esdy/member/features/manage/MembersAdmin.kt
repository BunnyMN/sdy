package mn.esdy.member.features.manage

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Search
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.*
import mn.esdy.member.design.*
import mn.esdy.member.models.ManagedMember
import mn.esdy.member.models.ManagedMembers
import mn.esdy.member.models.PositionPolicy

private val positions = listOf("chair", "vice_chair", "secretary", "finance", "auditor", "board", "member")

/**
 * Гишүүд ба албан тушаал: the branch chair assigns positions (an
 * administrator names the chair), within the control committee's seats.
 * The server checks every rule; this screen offers only what the policy allows.
 */
@Composable
fun MembersAdminScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var members by remember { mutableStateOf<ManagedMembers?>(null) }
    var policy by remember { mutableStateOf<PositionPolicy?>(null) }
    var error by remember { mutableStateOf<APIError?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var search by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try {
            val (list, rules) = coroutineScope {
                val l = async { app.api.managedMembers(query = search.trim()) }
                val r = async { app.api.positionPolicy() }
                l.await() to r.await()
            }
            members = list; policy = rules; error = null
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            error = APIError.wrap(e)
        }
    }

    fun more() {
        val current = members ?: return
        val next = current.nextOffset ?: return
        busy = "more"
        scope.launch {
            try {
                val page = app.api.managedMembers(query = search, offset = next)
                members = page.copy(members = current.members + page.members)
            } catch (e: Throwable) { actionError = APIError.wrap(e).message } finally { busy = null }
        }
    }

    fun assign(member: ManagedMember, position: String) {
        if (position == member.positionValue) return
        busy = member.userId; actionError = null; notice = null
        scope.launch {
            try {
                app.api.setPosition(member.userId, position)
                notice = "${member.name}: ${Labels.position(position) ?: position}"
                Haptics.success()
                load()
            } catch (e: Throwable) {
                actionError = membersMessage(APIError.wrap(e))
            } finally { busy = null }
        }
    }

    LaunchedEffect(Unit) { load() }

    SdyListScreen(title = "Гишүүд ба албан тушаал", silk = false, onRefresh = { load() }) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(bottom = 16.dp).background(Theme.fill, RoundedCornerShape(10.dp)).padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.Rounded.Search, null, tint = Theme.secondaryText, modifier = Modifier.size(20.dp))
                FormTextField(
                    search, { search = it }, "Нэр, имэйлээр хайх", modifier = Modifier.weight(1f),
                    imeAction = ImeAction.Search, onSubmit = { scope.launch { load() } },
                )
            }
        }
        policy?.let { p ->
            item {
                ListSection {
                    Text(
                        "Тэргүүн, Дэд тэргүүн, Нарийн бичиг арга хэмжээ үүсгэж, ирц ба оноог батална. Санхүүч хураамж, төлбөрийг хариуцна. Хяналтын хороо оноо хасаж, сануулга өгнө.",
                        style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp),
                    )
                    ListDivider()
                    LabeledRow("Хяналтын хороо", "${p.auditors.toInt()}/${p.auditorSeats.toInt()} суудал")
                    if (!p.canAssign) {
                        ListDivider()
                        Text("Албан тушаалыг салбарын Тэргүүн онооно.", style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
                    }
                }
            }
        }
        notice?.let { item { ListSection { NoticeView(it, NoticeKind.Success, Modifier.padding(vertical = 12.dp)) } } }
        actionError?.let { item { ListSection { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 12.dp)) } } }
        val list = members
        val err = error
        when {
            list != null -> item {
                ListSection {
                    if (list.members.isEmpty()) Text("Гишүүн олдсонгүй.", style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
                    list.members.forEachIndexed { i, member ->
                        if (i > 0) ListDivider()
                        MemberRow(member, policy, app.me?.id, busy, app.isOffline) { assign(member, it) }
                    }
                    if (list.hasMore) {
                        ListDivider()
                        RowButton("Цааш үзэх", enabled = busy == null) { more() }
                    }
                }
            }
            err != null -> item { ErrorStateView(err) { scope.launch { load() } } }
            else -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Theme.accent) } }
        }
    }
}

@Composable
private fun MemberRow(member: ManagedMember, policy: PositionPolicy?, meId: String?, busy: String?, offline: Boolean, onAssign: (String) -> Unit) {
    val canChair = policy?.canAssignChair == true
    val editable = (policy?.canAssign ?: false) && member.userId != meId && (canChair || member.positionValue != "chair")
    Box {
        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(member.name.ifEmpty { member.email }, style = SdyType.headline, color = Color.White)
            Text(Labels.membershipStatus(member.status), style = SdyType.caption, color = Theme.secondaryText)
            if (editable) {
                // The chair is offered only to whoever may name one.
                val options = positions.filter { it != "chair" || canChair }
                PickerRow(
                    "Албан тушаал", options, member.positionValue, title = { Labels.position(it) ?: it },
                    onSelect = onAssign, enabled = busy == null && !offline,
                )
            } else {
                Row(Modifier.padding(top = 4.dp)) {
                    Text("Албан тушаал", style = SdyType.subheadline, color = Color.White, modifier = Modifier.weight(1f))
                    Text(Labels.position(member.positionValue) ?: "—", style = SdyType.subheadline, color = Theme.secondaryText)
                }
            }
        }
        if (busy == member.userId) CircularProgressIndicator(Modifier.align(Alignment.TopEnd).padding(top = 8.dp).size(18.dp), color = Theme.accent, strokeWidth = 2.dp)
    }
}

/** The database's refusals, said in Mongolian. */
internal fun membersMessage(error: APIError): String = when (error.serverMessage) {
    "position_chair_required" -> "Албан тушаалыг зөвхөн салбарын Тэргүүн оноох боломжтой."
    "position_chair_admin_only" -> "Тэргүүнийг зөвхөн админ томилж, чөлөөлнө."
    "position_chair_taken" -> "Энэ салбарт Тэргүүн аль хэдийн томилогдсон байна."
    "position_needs_active_member" -> "Албан тушаалыг зөвхөн идэвхтэй гишүүнд оноох боломжтой."
    "auditor_seats_full" -> "Хяналтын хорооны суудал дүүрсэн байна."
    "membership_self_decision_forbidden" -> "Өөрийнхөө талаар шийдвэр гаргах боломжгүй."
    else -> error.message
}

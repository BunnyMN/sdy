package mn.esdy.member.features.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.APIError
import mn.esdy.member.core.Formatters
import mn.esdy.member.core.Haptics
import mn.esdy.member.core.memberRecord
import mn.esdy.member.core.saveMemberProfile
import mn.esdy.member.design.ErrorStateView
import mn.esdy.member.design.FormTextField
import mn.esdy.member.design.Labels
import mn.esdy.member.design.ListDivider
import mn.esdy.member.design.ListRow
import mn.esdy.member.design.ListSection
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.RowButton
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SkeletonList
import mn.esdy.member.design.Theme
import mn.esdy.member.design.ToggleRow
import mn.esdy.member.models.MemberProfile
import mn.esdy.member.models.MemberRecord

@Composable
fun MemberRecordScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var record by remember { mutableStateOf<MemberRecord?>(null) }
    var error by remember { mutableStateOf<APIError?>(null) }
    var phone by remember { mutableStateOf("") }
    var residence by remember { mutableStateOf("") }
    var notifications by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<Pair<String, NoticeKind>?>(null) }

    suspend fun load() {
        try {
            val r = app.api.memberRecord()
            record = r
            phone = r.profile.phone
            residence = r.profile.residence
            notifications = r.profile.notificationsEnabled
            error = null
        } catch (e: Throwable) {
            error = APIError.wrap(e)
        }
    }

    fun save() {
        saving = true; notice = null
        scope.launch {
            try {
                val saved = app.api.saveMemberProfile(MemberProfile(phone.trim(), residence.trim(), notifications))
                phone = saved.phone; residence = saved.residence; notifications = saved.notificationsEnabled
                Haptics.success()
                notice = "Хадгалагдлаа." to NoticeKind.Success
            } catch (e: Throwable) {
                notice = APIError.wrap(e).message to NoticeKind.Error
            } finally {
                saving = false
            }
        }
    }

    LaunchedEffect(Unit) { if (record == null) load() }

    InlineListScreen("Миний гишүүнчлэл") {
        val r = record
        val e = error
        when {
            r != null -> {
                item {
                    ListSection(header = "Харьяалал ба ажиллах эрх") {
                        var first = true
                        if (!r.hasPrimary) {
                            Text(
                                "Үндсэн харьяалал баталгаажаагүй байна. Элсэх хүсэлт өгөх эсвэл салбарын хариуцсан ажилтанд хандана уу.",
                                style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp),
                            )
                            first = false
                        }
                        r.memberships.forEach { m ->
                            if (!first) ListDivider()
                            first = false
                            Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(m.name, style = SdyType.headline, color = Color.White)
                                Text(
                                    "${if (m.isPrimary) "Үндсэн харьяалал" else "Бусад харьяалал / ажиллах эрх"} · ${Labels.membershipStatus(m.status)}",
                                    style = SdyType.subheadline, color = Color.White,
                                )
                                Labels.position(m.position)?.let {
                                    Text("Албан тушаал: $it", style = SdyType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = Color.White)
                                }
                                m.memberSince?.let {
                                    Text("Гишүүнчлэл эхэлсэн: ${Formatters.day(it)}", style = SdyType.caption, color = Theme.secondaryText)
                                }
                            }
                        }
                    }
                }
                item {
                    ListSection(
                        header = "Холбоо барих мэдээлэл",
                        footer = "Энэ мэдээллийг та өөрөө засна. Утасны дугаарын баталгаажуулалт хийгдээгүй.",
                    ) {
                        ListRow(verticalPadding = 0.dp) {
                            Text("Утас", style = SdyType.body, color = Color.White, modifier = Modifier.width(80.dp))
                            FormTextField(
                                phone, { phone = it.take(32) }, "99112233", Modifier.weight(1f),
                                keyboardType = KeyboardType.Phone, textStyle = SdyType.body.copy(textAlign = TextAlign.End),
                            )
                        }
                        ListDivider()
                        Column(Modifier.padding(top = 8.dp)) {
                            Text("Оршин суугаа аймаг, сум", style = SdyType.caption, color = Theme.secondaryText)
                            FormTextField(residence, { residence = it.take(200) }, "Жишээ: Дархан-Уул, Дархан")
                        }
                        ListDivider()
                        ToggleRow("Апп дотор шинэ мэдэгдэл хүлээн авах", notifications, { notifications = it })
                        notice?.let { (text, kind) ->
                            ListDivider()
                            NoticeView(text, kind, Modifier.padding(vertical = 11.dp))
                        }
                        ListDivider()
                        RowButton("Хадгалах", center = true, busy = saving, enabled = !saving && !app.isOffline) { save() }
                    }
                }
                item {
                    ListSection(header = "Гишүүнчлэлийн түүх") {
                        if (r.history.isEmpty()) SecondaryLine("Гишүүнчлэлийн өөрчлөлт бүртгэгдээгүй байна.")
                        r.history.forEachIndexed { i, h ->
                            if (i > 0) ListDivider()
                            Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("${h.branch} · ${Labels.membershipStatus(h.status)}", style = SdyType.subheadline.copy(fontWeight = FontWeight.Medium), color = Color.White)
                                Text(Formatters.dateTime(h.createdAt), style = SdyType.caption, color = Theme.secondaryText)
                                if (h.reason.isNotEmpty()) Text(h.reason, style = SdyType.footnote, color = Color.White)
                            }
                        }
                    }
                }
            }
            e != null -> item { ErrorStateView(e) { scope.launch { load() } } }
            else -> item { SkeletonList(4) }
        }
    }
}

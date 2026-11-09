package mn.esdy.member.features.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Apartment
import androidx.compose.material.icons.rounded.CheckCircleOutline
import androidx.compose.material.icons.rounded.HighlightOff
import androidx.compose.material.icons.rounded.HourglassEmpty
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.app.LocalNav
import mn.esdy.member.core.APIError
import mn.esdy.member.core.Formatters
import mn.esdy.member.core.Haptics
import mn.esdy.member.core.askToJoin
import mn.esdy.member.core.branches
import mn.esdy.member.core.cancelTransfer
import mn.esdy.member.core.requestTransfer
import mn.esdy.member.core.transfers
import mn.esdy.member.design.ActionSheet
import mn.esdy.member.design.EmptyStateView
import mn.esdy.member.design.ErrorStateView
import mn.esdy.member.design.FormTextField
import mn.esdy.member.design.LabeledRow
import mn.esdy.member.design.Labels
import mn.esdy.member.design.ListDivider
import mn.esdy.member.design.ListRow
import mn.esdy.member.design.ListSection
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.PickerRow
import mn.esdy.member.design.RowButton
import mn.esdy.member.design.SdyListScreen
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SheetAction
import mn.esdy.member.design.SkeletonList
import mn.esdy.member.design.StatusChip
import mn.esdy.member.design.Theme
import mn.esdy.member.design.Tone
import mn.esdy.member.models.Branch
import mn.esdy.member.models.MembershipTransfer

private data class Notice(val text: String, val kind: NoticeKind)

/** Moving one's membership to another branch (components/MembershipTransfers.tsx). */
@Composable
fun TransfersScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var transfers by remember { mutableStateOf<List<MembershipTransfer>>(emptyList()) }
    var branches by remember { mutableStateOf<List<Branch>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<APIError?>(null) }
    var destination by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<Notice?>(null) }
    var cancelTarget by remember { mutableStateOf<MembershipTransfer?>(null) }

    val source = app.record?.approvedBranch
    val pending = transfers.any { it.status == "PENDING" }
    val destinations = branches.filter { it.slug != source?.slug }

    suspend fun load() {
        try {
            coroutineScope {
                val t = async { app.api.transfers() }
                val b = async { runCatching { app.api.branches() }.getOrNull() }
                transfers = t.await().requests
                branches = b.await()?.branches ?: emptyList()
            }
            loaded = true
            loadError = null
        } catch (e: Throwable) {
            loadError = APIError.wrap(e)
        }
    }

    fun submit() {
        val from = source ?: return
        busy = true; notice = null
        scope.launch {
            try {
                app.api.requestTransfer(from.tenantId, destination, message.trim())
                message = ""; destination = ""
                notice = Notice("Шилжих хүсэлт илгээгдлээ.", NoticeKind.Success)
                Haptics.success()
                load()
            } catch (e: Throwable) {
                notice = Notice(APIError.wrap(e).message, NoticeKind.Error)
            } finally { busy = false }
        }
    }

    fun cancel(t: MembershipTransfer) {
        busy = true; notice = null
        scope.launch {
            try {
                app.api.cancelTransfer(t.id)
                notice = Notice("Хүсэлт цуцлагдлаа.", NoticeKind.Success)
                load()
            } catch (e: Throwable) {
                notice = Notice(APIError.wrap(e).message, NoticeKind.Error)
            } finally { busy = false }
        }
    }

    LaunchedEffect(Unit) { if (!loaded) load() }

    SdyListScreen(title = "Харьяалал шилжүүлэх", silk = false, onRefresh = { load() }) {
        val err = loadError
        when {
            !loaded && err != null -> item { ErrorStateView(err) { scope.launch { load() } } }
            !loaded -> item { SkeletonList(3) }
            else -> {
                item {
                    ListSection {
                        Text(
                            "Очих салбарын админ батлах хүртэл одоогийн харьяалал хэвээр байна. Батлагдвал дахин нэвтэрнэ. Өмнөх ирц, оноо, төлөлтийн түүх хуучин салбарын бүртгэлд хадгалагдана.",
                            style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp),
                        )
                    }
                }
                notice?.let { n -> item { ListSection { NoticeView(n.text, n.kind, Modifier.padding(vertical = 11.dp)) } } }
                if (transfers.isNotEmpty()) item {
                    ListSection(header = "Миний хүсэлтүүд") {
                        transfers.forEachIndexed { i, t ->
                            if (i > 0) ListDivider()
                            Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("${t.fromName} → ${t.toName}", style = SdyType.headline, color = Color.White)
                                StatusChip(
                                    Labels.transfer(t.status),
                                    when (t.status) {
                                        "PENDING" -> Icons.Rounded.HourglassEmpty
                                        "ACCEPTED" -> Icons.Rounded.CheckCircleOutline
                                        else -> Icons.Rounded.HighlightOff
                                    },
                                    when (t.status) { "PENDING" -> Tone.Warning; "ACCEPTED" -> Tone.Success; else -> Tone.Neutral },
                                )
                                if (t.message.isNotEmpty()) Text(t.message, style = SdyType.subheadline, color = Theme.secondaryText)
                                Text(Formatters.dateTime(t.createdAt), style = SdyType.caption, color = Theme.secondaryText)
                                if (t.status == "PENDING") {
                                    ListRow(onClick = { cancelTarget = t }, enabled = !busy && !app.isOffline, verticalPadding = 4.dp) {
                                        Text("Хүсэлтээ цуцлах", style = SdyType.body, color = Theme.danger)
                                    }
                                }
                            }
                        }
                    }
                }
                if (source != null && !pending && destinations.isNotEmpty()) item {
                    ListSection(header = "Шинэ хүсэлт") {
                        LabeledRow("Одоогийн харьяалал", source.name)
                        ListDivider()
                        PickerRow(
                            "Шилжиж очих салбар",
                            listOf("") + destinations.map { it.slug },
                            destination,
                            title = { slug -> if (slug.isEmpty()) "Сонгох" else destinations.firstOrNull { it.slug == slug }?.name ?: slug },
                            onSelect = { destination = it },
                        )
                        ListDivider()
                        FormTextField(message, { message = it.take(500) }, "Шилжих шалтгаан", singleLine = false, minLines = 3, maxLines = 6)
                        ListDivider()
                        RowButton(
                            "Шилжих хүсэлт илгээх", center = true, busy = busy,
                            enabled = destination.isNotEmpty() && message.isNotBlank() && !app.isOffline,
                        ) { submit() }
                    }
                } else if (source == null) item {
                    ListSection {
                        Text(
                            "Үндсэн харьяалал баталгаажсаны дараа шилжих хүсэлт гаргах боломжтой.",
                            style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp),
                        )
                    }
                }
            }
        }
    }

    cancelTarget?.let { target ->
        ActionSheet(
            title = "Шилжих хүсэлтээ цуцлах уу?",
            actions = listOf(SheetAction("Хүсэлтээ цуцлах", destructive = true) { cancel(target) }),
            onDismiss = { cancelTarget = null },
        )
    }
}

/** Asking a branch to admit you (app/member/page.tsx). */
@Composable
fun JoinRequestScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var branches by remember { mutableStateOf<List<Branch>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<APIError?>(null) }
    var slug by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // Parents first, each followed by its own branches.
    val ordered: List<Pair<Branch, Boolean>> = run {
        val parents = branches.filter { b -> b.parentSlug == null || branches.none { it.slug == b.parentSlug } }
        buildList {
            for (parent in parents) {
                add(parent to false)
                branches.filter { it.parentSlug == parent.slug }.forEach { add(it to true) }
            }
        }
    }

    suspend fun load() {
        try {
            branches = app.api.branches().branches
            loaded = true; loadError = null
        } catch (e: Throwable) { loadError = APIError.wrap(e) }
    }

    fun submit() {
        busy = true; error = null
        scope.launch {
            try {
                val result = app.api.askToJoin(slug, message.trim())
                Haptics.success()
                if (result.joined) app.signedIn() else nav.pop()
            } catch (e: Throwable) {
                error = APIError.wrap(e).message
            } finally { busy = false }
        }
    }

    LaunchedEffect(Unit) { if (!loaded) load() }

    SdyListScreen(title = "Салбарт элсэх", silk = false) {
        val err = loadError
        when {
            !loaded && err != null -> item { ErrorStateView(err) { scope.launch { load() } } }
            !loaded -> item { SkeletonList(3) }
            branches.isEmpty() -> item {
                EmptyStateView(
                    "Салбар олдсонгүй", Icons.Rounded.Apartment,
                    "Салбарын жагсаалтыг одоогоор авах боломжгүй байна. Дахин шинэчилнэ үү.",
                    actionTitle = "Шинэчлэх",
                ) { scope.launch { load() } }
            }
            else -> {
                item {
                    ListSection(footer = "Харьяалагдах салбараа сонгож элсэх хүсэлт илгээнэ. Менежер эсвэл админ баталсны дараа гишүүн болно.") {
                        PickerRow(
                            "Салбар",
                            listOf("") + ordered.map { it.first.slug },
                            slug,
                            title = { s ->
                                if (s.isEmpty()) "Салбараа сонгоно уу"
                                else ordered.firstOrNull { it.first.slug == s }?.let { (b, indent) -> (if (indent) "   " else "") + b.name } ?: s
                            },
                            onSelect = { slug = it },
                        )
                        ListDivider()
                        FormTextField(message, { message = it.take(500) }, "Нэмэлт тайлбар (заавал биш)", singleLine = false, minLines = 3, maxLines = 6)
                    }
                }
                error?.let { msg -> item { ListSection { NoticeView(msg, NoticeKind.Error, Modifier.padding(vertical = 11.dp)) } } }
                item {
                    ListSection {
                        RowButton("Элсэх хүсэлт илгээх", center = true, busy = busy, enabled = slug.isNotEmpty() && !app.isOffline) { submit() }
                    }
                }
            }
        }
    }
}

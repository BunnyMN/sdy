package mn.esdy.member.features.events

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.AccountBalance
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Cancel
import androidx.compose.material.icons.rounded.CheckCircleOutline
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Draw
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.HighlightOff
import androidx.compose.material.icons.rounded.HourglassTop
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.PanTool
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.Formatters
import mn.esdy.member.design.ActionSheet
import mn.esdy.member.design.BarTextButton
import mn.esdy.member.design.FormSheet
import mn.esdy.member.design.FormTextField
import mn.esdy.member.design.Labels
import mn.esdy.member.design.ListDivider
import mn.esdy.member.design.ListSection
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.PrimaryButton
import mn.esdy.member.design.RowButton
import mn.esdy.member.design.SdySheet
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SecondaryButton
import mn.esdy.member.design.SheetAction
import mn.esdy.member.design.StatusChip
import mn.esdy.member.design.Theme
import mn.esdy.member.design.Tone
import mn.esdy.member.design.pressable
import mn.esdy.member.models.Motion
import mn.esdy.member.models.MotionList

private val REPORT_REASONS = listOf("Доромжилсон, үзэн ядсан", "Худал, төөрөгдүүлсэн", "Спам, сурталчилгаа", "Хувийн мэдээлэл задруулсан", "Бусад")

@Composable
internal fun DiscussionSection(model: DiscussionModel) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var confirm by remember { mutableStateOf<Pair<Motion, String>?>(null) }
    var proposing by remember { mutableStateOf(false) }
    var reporting by remember { mutableStateOf<Motion?>(null) }
    var blocking by remember { mutableStateOf<Motion?>(null) }

    ListSection(
        headerContent = { IconHeader("Хэлэлцүүлэг", Icons.Rounded.AccountBalance) },
        footer = "Ирц нь батлагдсан гишүүд саналаа eID тоон гарын үсгээр баталгаажуулна; өгсөн саналын олонхоор шийдэгдэнэ.",
    ) {
        val data = model.data
        val error = model.loadError
        if (error != null && data == null) {
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(error.message, style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.weight(1f))
                SecondaryButton("Дахин") { model.reload() }
            }
        } else if (data != null) {
            Eligibility(data)
            model.actionError?.let { ListDivider(); NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 11.dp)) }
            if (data.motions.isEmpty()) {
                ListDivider()
                Text("Одоогоор хэлэлцэх асуудал алга.", style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
            }
            data.motions.forEach { motion ->
                ListDivider()
                MotionRow(
                    motion, data, signingActive = model.signing != null, offline = app.isOffline,
                    onVote = { choice -> confirm = motion to choice },
                    onReport = { reporting = motion },
                    onBlock = { blocking = motion },
                )
            }
            if (data.eventStatus != "cancelled") {
                ListDivider()
                RowButton("Асуудал дэвшүүлэх", icon = Icons.Rounded.ChatBubbleOutline, enabled = !app.isOffline) { proposing = true }
            }
        } else {
            Row(Modifier.padding(vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(18.dp), color = Theme.secondaryText, strokeWidth = 2.dp)
                Text("Ачаалж байна…", style = SdyType.body, color = Theme.secondaryText)
            }
        }
    }

    confirm?.let { (motion, choice) ->
        ActionSheet(
            title = "«${Labels.choice(choice)}» гэж санал өгөх үү?",
            message = "eID Mongolia апп нээгдэж, PIN2-оор баталгаажуулна. Зурсан саналыг өөрчлөх боломжгүй.",
            actions = listOf(SheetAction("eID-ээр зурж илгээх") { model.vote(motion, choice) }),
            onDismiss = { confirm = null },
        )
    }
    reporting?.let { motion ->
        ActionSheet(
            title = "Яагаад мэдээлэх вэ?",
            message = "Зохион байгуулагчид мэдэгдэл очно. Олон гишүүн мэдээлсэн асуудал хянагдах хүртэл нуугдана.",
            actions = REPORT_REASONS.map { reason -> SheetAction(reason) { scope.launch { model.report(motion, reason) } } },
            onDismiss = { reporting = null },
        )
    }
    blocking?.let { motion ->
        ActionSheet(
            title = "${motion.proposerName.ifEmpty { "Энэ гишүүн" }}-ийг блоклох уу?",
            message = "Энэ гишүүний дэвшүүлсэн, санал хураалтад ороогүй асуудлууд танд харагдахгүй болно. Профайл → Блоклосон гишүүд хэсгээс буцаана.",
            actions = listOf(SheetAction("Блоклох", destructive = true) { scope.launch { model.block(motion) } }),
            onDismiss = { blocking = null },
        )
    }
    if (proposing) ProposeSheet(model) { proposing = false }
}

@Composable
private fun Eligibility(data: MotionList) {
    Column(Modifier.fillMaxWidth().padding(vertical = 11.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        data.eligible?.let { Text("Санал өгөх эрхтэй: $it", style = SdyType.caption, color = Theme.secondaryText) }
        val points = data.votePoints
        when {
            !data.signingReady -> IconLabel("eID гарын үсэг тохируулагдаагүй тул санал өгөх боломжгүй.", Icons.Rounded.WarningAmber,
                color = Theme.warning, style = SdyType.caption, iconSize = 14.dp)
            !data.canVote -> IconLabel("Санал өгөхийн тулд энэ арга хэмжээнд ирцээ баталгаажуулна уу.", Icons.Rounded.Info,
                color = Theme.secondaryText, style = SdyType.caption, iconSize = 14.dp)
            points != null && points > 0 -> IconLabel("Зурсан санал бүр +${points.toInt()} оноо", Icons.Rounded.Star,
                color = Theme.secondaryText, style = SdyType.caption, iconSize = 14.dp)
        }
    }
}

@Composable
private fun MotionRow(
    motion: Motion,
    data: MotionList,
    signingActive: Boolean,
    offline: Boolean,
    onVote: (String) -> Unit,
    onReport: () -> Unit,
    onBlock: () -> Unit,
) {
    // Somebody else's words: the reader can report them or block their author.
    val othersWords = motion.proposerId.isNotEmpty() && motion.proposerId != data.me
    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(motion.title, style = SdyType.headline, color = Color.White)
                Text("Дэвшүүлсэн: ${motion.proposerName.ifEmpty { "—" }}", style = SdyType.caption, color = Theme.secondaryText)
            }
            if (othersWords) {
                var open by remember { mutableStateOf(false) }
                Box {
                    Box(
                        Modifier.size(Theme.minTap).pressable(0.9f, enabled = !offline) { open = true }
                            .semantics { contentDescription = "Асуудлын үйлдэл: мэдээлэх, блоклох" },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Rounded.MoreHoriz, null, tint = if (offline) Theme.tertiaryText else Theme.accent) }
                    DropdownMenu(open, onDismissRequest = { open = false }, containerColor = Theme.cardRaised) {
                        DropdownMenuItem(
                            text = { Text(if (motion.reportedByMe) "Мэдээлсэн" else "Мэдээлэх", color = if (motion.reportedByMe) Theme.tertiaryText else Color.White) },
                            leadingIcon = { Icon(Icons.Rounded.Flag, null, tint = Theme.secondaryText) },
                            enabled = !motion.reportedByMe,
                            onClick = { open = false; onReport() },
                        )
                        DropdownMenuItem(
                            text = { Text("Гишүүнийг блоклох", color = Theme.danger) },
                            leadingIcon = { Icon(Icons.Rounded.Block, null, tint = Theme.danger) },
                            onClick = { open = false; onBlock() },
                        )
                    }
                }
            }
        }
        MotionStatusChip(motion)
        if (data.canManage && motion.reportCount > 0) {
            IconLabel("${motion.reportCount.toInt()} гишүүн мэдээлсэн", Icons.Rounded.Flag, color = Theme.warning,
                style = SdyType.caption.copy(fontWeight = FontWeight.SemiBold), iconSize = 14.dp)
        }
        if (motion.body.isNotEmpty()) Text(motion.body, style = SdyType.subheadline, color = Color.White)
        if (motion.status == "voting" || motion.status == "decided") Tally(motion)
        MyVote(motion)
        if (data.needsMyVote(motion)) {
            val enabled = !signingActive && !offline
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("yes", "no", "abstain").forEach { choice ->
                    if (choice == "yes") PrimaryButton(Labels.choice(choice), Modifier.weight(1f), enabled = enabled, fillWidth = true) { onVote(choice) }
                    else SecondaryButton(Labels.choice(choice), Modifier.weight(1f), enabled = enabled, fillWidth = true) { onVote(choice) }
                }
            }
        }
    }
}

@Composable
private fun MotionStatusChip(motion: Motion) {
    val s = motion.displayStatus
    val tone = when (s) { "voting" -> Tone.Info; "approved" -> Tone.Success; "rejected" -> Tone.Danger; "withdrawn" -> Tone.Warning; else -> Tone.Neutral }
    val icon = when (s) { "voting" -> Icons.Rounded.PanTool; "approved" -> Icons.Rounded.CheckCircleOutline; "rejected" -> Icons.Rounded.HighlightOff; else -> Icons.Rounded.Description }
    StatusChip(Labels.motionStatus(s), icon, tone)
}

@Composable
private fun Tally(motion: Motion) {
    val total = maxOf(1, motion.counted).toFloat()
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth().height(6.dp).background(Theme.fill, CircleShape).clearAndSetSemantics { }) {
            val parts = listOf(motion.yes to Theme.success, motion.no to Theme.danger, motion.abstain to Color.Gray)
            var used = 0f
            parts.forEach { (v, c) ->
                val w = (v.toFloat() / total)
                if (w > 0f) { Box(Modifier.weight(w).height(6.dp).background(c)); used += w }
            }
            if (used < 1f) Spacer(Modifier.weight(1f - used))
        }
        Text(
            "Зөвшөөрсөн ${motion.yes.toInt()} · Татгалзсан ${motion.no.toInt()} · Түдгэлзсэн ${motion.abstain.toInt()}",
            style = SdyType.caption, color = Theme.secondaryText,
        )
    }
}

@Composable
private fun MyVote(motion: Motion) {
    val vote = motion.myVote ?: return
    when (vote.status) {
        "signed" -> IconLabel("Таны санал: ${Labels.chose(vote.choice)} · eID-ээр зурсан", Icons.Rounded.Verified,
            color = Theme.success, style = SdyType.footnote.copy(fontWeight = FontWeight.Medium), iconSize = 16.dp)
        "signing" -> IconLabel("Таны санал (${Labels.chose(vote.choice)}) зурагдаж дуусаагүй байна.", Icons.Rounded.HourglassTop,
            color = Theme.warning, style = SdyType.footnote, iconSize = 16.dp)
        else -> IconLabel("Таны санал зурагдаагүй — дахин санал өгнө үү.", Icons.Rounded.ErrorOutline,
            color = Theme.danger, style = SdyType.footnote, iconSize = 16.dp)
    }
}

/** The eID signature in progress: the code to match, the countdown, the outcome. */
@Composable
internal fun VoteSigningSheet(model: DiscussionModel) {
    val context = LocalContext.current
    val s = model.signing ?: return
    val active = s.phase == DiscussionModel.SigningPhase.Waiting || s.phase == DiscussionModel.SigningPhase.Starting
    SdySheet(
        onDismiss = { model.signing = null; model.signingSheetDismissed() },
        dismissible = s.phase != DiscussionModel.SigningPhase.Waiting,
    ) {
        Box(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 8.dp)) {
            Box(Modifier.align(Alignment.CenterStart)) {
                BarTextButton(if (active) "Цуцлах" else "Хаах") { model.cancelSigning(); model.signingSheetDismissed() }
            }
            Text("eID-ээр баталгаажуулах", style = SdyType.headline, color = Color.White, maxLines = 1, modifier = Modifier.align(Alignment.Center).padding(horizontal = 88.dp))
        }
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp).navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            val (icon, tint) = when (s.phase) {
                DiscussionModel.SigningPhase.Done -> Icons.Rounded.Verified to Theme.success
                DiscussionModel.SigningPhase.Failed -> Icons.Rounded.Cancel to Theme.danger
                else -> Icons.Rounded.Draw to Theme.accent
            }
            Icon(icon, null, tint = tint, modifier = Modifier.size(52.dp))
            Text(s.motion.title, style = SdyType.headline, color = Color.White, textAlign = TextAlign.Center)
            Text("Таны сонголт: ${Labels.choice(s.choice)}", style = SdyType.subheadline, color = Theme.secondaryText)
            when (s.phase) {
                DiscussionModel.SigningPhase.Starting -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    CircularProgressIndicator(Modifier.size(24.dp), color = Theme.secondaryText, strokeWidth = 2.dp)
                    Text("eID хүсэлт илгээж байна…", style = SdyType.subheadline, color = Theme.secondaryText)
                }
                DiscussionModel.SigningPhase.Waiting -> {
                    if (s.code.isNotEmpty()) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Баталгаажуулах код", style = SdyType.caption, color = Theme.secondaryText)
                            Text(
                                s.code, fontSize = 48.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace,
                                letterSpacing = 6.sp, color = Color.White,
                                modifier = Modifier.semantics { contentDescription = "Баталгаажуулах код ${s.code.toList().joinToString(" ")}" },
                            )
                        }
                    }
                    Text(
                        if (s.appLink != null) "eID Mongolia апп нээгдэнэ. Код таарч байгааг шалгаад PIN2-оо оруулбал энд буцаж ирнэ."
                        else "Утсан дээрх eID Mongolia апп руу хүсэлт илгээлээ. Аппаа нээж, код таарч байгааг шалгаад PIN2-оо оруулна уу.",
                        style = SdyType.footnote, color = Theme.secondaryText, textAlign = TextAlign.Center,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(18.dp), color = Theme.secondaryText, strokeWidth = 2.dp)
                        Text("Гарын үсгийг хүлээж байна · ${Formatters.clock(model.secondsLeft)}", style = SdyType.subheadline, color = Color.White)
                    }
                    s.appLink?.let { link ->
                        SecondaryButton("eID апп нээх", icon = Icons.AutoMirrored.Rounded.OpenInNew, fillWidth = true) {
                            DiscussionModel.openLink(context, link)
                        }
                    }
                }
                DiscussionModel.SigningPhase.Done -> {
                    Text("Санал тань тоологдлоо.", style = SdyType.title3.copy(fontWeight = FontWeight.Bold), color = Theme.success)
                    val points = s.points
                    if (points != null && points > 0) Text("+${points.toInt()} оноо", style = SdyType.headline, color = Color.White)
                }
                DiscussionModel.SigningPhase.Failed -> {
                    Text(s.message ?: "Гарын үсэг зурагдсангүй. Дахин оролдоно уу.", style = SdyType.body, color = Theme.danger, textAlign = TextAlign.Center)
                    Text("Санал тань тоологдоогүй.", style = SdyType.footnote, color = Theme.secondaryText)
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun ProposeSheet(model: DiscussionModel, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    FormSheet(
        title = "Асуудал дэвшүүлэх",
        onDismiss = onDismiss,
        confirmTitle = "Дэвшүүлэх",
        confirmEnabled = !model.busy && title.isNotBlank(),
        busy = model.busy,
        onConfirm = {
            scope.launch { if (model.propose(title.trim(), text.trim())) onDismiss() }
        },
    ) {
        item {
            ListSection(footer = "Зохион байгуулагч санал хураалт нээсний дараа гишүүд санал өгнө.") {
                FormTextField(title, { title = it.take(200) }, "Асуудлын нэр")
                ListDivider()
                FormTextField(text, { text = it.take(4000) }, "Тайлбар, санал болгож буй шийдвэр", singleLine = false, minLines = 4, maxLines = 10)
            }
        }
        model.actionError?.let { item { ListSection { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 11.dp)) } } }
    }
}

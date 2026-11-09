package mn.esdy.member.features.events

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Checklist
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.PanTool
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.APIClient
import mn.esdy.member.core.APIError
import mn.esdy.member.core.Haptics
import mn.esdy.member.core.respond
import mn.esdy.member.core.tasks
import mn.esdy.member.core.volunteer
import mn.esdy.member.design.Labels
import mn.esdy.member.design.ListDivider
import mn.esdy.member.design.ListSection
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.PrimaryButton
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SecondaryButton
import mn.esdy.member.design.StatusChip
import mn.esdy.member.design.Theme
import mn.esdy.member.design.Tone
import mn.esdy.member.models.EventTask
import mn.esdy.member.models.TasksResponse

@Stable
class TasksModel(val eventID: String, private val api: APIClient, private val scope: CoroutineScope) {
    var data by mutableStateOf<TasksResponse?>(null)
    var error by mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)

    suspend fun load() {
        try {
            data = api.tasks(eventID); error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            if (data == null) error = APIError.wrap(e).message
        }
    }

    private fun act(run: suspend () -> Unit) {
        scope.launch {
            busy = true; error = null
            try {
                run()
                Haptics.success()
                load()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                error = APIError.wrap(e).message
                Haptics.error()
            } finally {
                busy = false
            }
        }
    }

    fun volunteer(task: EventTask) = act { api.volunteer(eventID, task.id) }
    fun respond(task: EventTask, accept: Boolean) = act { api.respond(eventID, task.id, accept) }
}

@Composable
internal fun TasksSection(model: TasksModel, closed: Boolean) {
    val app = LocalApp.current
    ListSection(
        headerContent = { IconHeader("Ажил үүрэг", Icons.Rounded.Checklist) },
        footer = "Гүйцэтгэл батлагдахад тухайн ажлын оноо танд орно.",
    ) {
        val data = model.data
        var first = true
        model.error?.let { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 11.dp)); first = false }
        if (data != null) {
            if (data.tasks.isEmpty()) {
                if (!first) ListDivider()
                Text("Ажил үүрэг хуваарилаагүй байна.", style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
            }
            data.tasks.forEach { task ->
                if (!first) ListDivider()
                first = false
                TaskRow(model, task, data.me, closed, app.isOffline)
            }
        } else if (model.error == null) {
            Row(Modifier.padding(vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(18.dp), color = Theme.secondaryText, strokeWidth = 2.dp)
                Text("Ачаалж байна…", style = SdyType.body, color = Theme.secondaryText)
            }
        }
    }
}

@Composable
private fun TaskRow(model: TasksModel, task: EventTask, me: String, closed: Boolean, offline: Boolean) {
    val mine = task.mine(me)
    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(task.title, style = SdyType.headline, color = Color.White)
        if (task.description.isNotEmpty()) Text(task.description, style = SdyType.subheadline, color = Theme.secondaryText)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            StatusChip("+${task.points.toInt()} оноо", Icons.Rounded.Star, Tone.Success)
            StatusChip("${task.taken}/${task.slots} хүн", Icons.Rounded.Group, if (task.isFree) Tone.Info else Tone.Neutral)
            if (mine != null) {
                StatusChip(
                    Labels.taskStatus(mine.status),
                    tone = when (mine.status) { "offered" -> Tone.Warning; "done" -> Tone.Success; else -> Tone.Accent },
                )
            }
        }
        when {
            mine?.status == "offered" -> {
                Text("Танд энэ ажлыг санал болгосон байна.", style = SdyType.footnote, color = Color.White)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PrimaryButton("Хүлээн авах", Modifier.weight(1f), icon = Icons.Rounded.Check, fillWidth = true,
                        enabled = !model.busy && task.isFree && !offline) { model.respond(task, true) }
                    SecondaryButton("Татгалзах", Modifier.weight(1f), icon = Icons.Rounded.Close, fillWidth = true,
                        enabled = !model.busy && !offline) { model.respond(task, false) }
                }
            }
            mine?.status == "accepted" ->
                SecondaryButton("Чөлөөлөгдөх", enabled = !model.busy && !offline) { model.respond(task, false) }
            !closed && task.isFree && (mine == null || mine.status == "declined") ->
                SecondaryButton("Би хийнэ", icon = Icons.Rounded.PanTool, enabled = !model.busy && !offline) { model.volunteer(task) }
        }
    }
}

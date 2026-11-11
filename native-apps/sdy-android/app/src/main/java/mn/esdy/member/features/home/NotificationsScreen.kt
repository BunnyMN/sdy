package mn.esdy.member.features.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import kotlinx.coroutines.launch
import mn.esdy.member.app.AppModel
import mn.esdy.member.app.LocalApp
import mn.esdy.member.app.LocalNav
import mn.esdy.member.app.Route
import mn.esdy.member.core.NotificationTarget
import mn.esdy.member.core.APIError
import mn.esdy.member.core.Formatters
import mn.esdy.member.core.markAllRead
import mn.esdy.member.core.markRead
import mn.esdy.member.core.notifications
import mn.esdy.member.design.BarTextButton
import mn.esdy.member.design.EmptyStateView
import mn.esdy.member.design.ErrorStateView
import mn.esdy.member.design.ListDivider
import mn.esdy.member.design.ListSection
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.RowButton
import mn.esdy.member.design.SdyListScreen
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SkeletonList
import mn.esdy.member.design.Theme
import mn.esdy.member.design.pressable
import mn.esdy.member.models.MemberNotification

@Composable
fun NotificationsScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<MemberNotification>>(emptyList()) }
    var unread by remember { mutableIntStateOf(0) }
    var hasMore by remember { mutableStateOf(false) }
    var nextOffset by remember { mutableIntStateOf(0) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<APIError?>(null) }
    var busy by remember { mutableStateOf(false) }
    var actionError by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        try {
            val page = app.api.notifications()
            items = page.items
            unread = page.unread ?: page.items.count { !it.isRead }
            hasMore = page.hasMore
            nextOffset = page.nextOffset ?: page.items.size
            loaded = true
            error = null
            app.unreadCount = unread
        } catch (e: Throwable) {
            error = APIError.wrap(e)
        }
    }

    fun more() {
        busy = true
        scope.launch {
            try {
                val page = app.api.notifications(nextOffset)
                items = items + page.items
                hasMore = page.hasMore
                nextOffset = page.nextOffset ?: items.size
            } catch (_: Throwable) {
            } finally { busy = false }
        }
    }

    fun open(item: MemberNotification) {
        actionError = null
        scope.launch {
            if (!item.isRead && !app.isOffline) {
                try { app.api.markRead(item.id) } catch (_: Throwable) {}
                items = items.map { if (it.id == item.id) it.copy(readAt = Instant.now().toString()) else it }
                unread = maxOf(0, unread - 1)
                app.unreadCount = unread
            }
            try {
                // From the list, a screen opens on top of it (in Нүүр or Профайл,
                // wherever the list is); tabs and events switch as a push would.
                when (val target = app.resolveNotification(item.path)) {
                    is NotificationTarget.Screen -> nav.push(Route.Home(target.route))
                    is NotificationTarget.Event -> app.openEvent(target.id)
                    is NotificationTarget.TabTarget -> app.tab = target.tab
                    NotificationTarget.Home -> { app.tab = AppModel.Tab.Home; app.setHomePath() }
                    NotificationTarget.None -> {}
                }
            } catch (e: Throwable) { actionError = APIError.wrap(e).message }
        }
    }

    fun readAll() {
        busy = true
        scope.launch {
            try { app.api.markAllRead(); load() } catch (e: Throwable) { actionError = APIError.wrap(e).message } finally { busy = false }
        }
    }

    LaunchedEffect(Unit) { if (!loaded) load() }

    SdyListScreen(
        title = "Мэдэгдэл",
        silk = false,
        inline = true,
        onRefresh = { load() },
        actions = {
            if (unread > 0) BarTextButton("Бүгдийг уншсан", enabled = !busy && !app.isOffline) { readAll() }
        },
    ) {
        val err = error
        when {
            !loaded && err != null -> item { ErrorStateView(err) { scope.launch { load() } } }
            !loaded -> item { SkeletonList() }
            items.isEmpty() -> item {
                EmptyStateView("Шинэ мэдэгдэл алга", Icons.Rounded.NotificationsOff, "Арга хэмжээ, хураамж, санал хураалтын мэдээ энд ирнэ.")
            }
            else -> {
                actionError?.let { msg -> item { NoticeView(msg, NoticeKind.Error, Modifier.padding(vertical = 8.dp)) } }
                items(items, key = { it.id }) { n ->
                    NotificationRow(n) { open(n) }
                    ListDivider()
                }
                if (hasMore) item {
                    ListSection(Modifier.padding(top = 12.dp)) { RowButton("Цааш үзэх", center = true, enabled = !busy) { more() } }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(item: MemberNotification, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().pressable(0.985f, onClick = onClick).padding(vertical = 12.dp)
            .clearAndSetSemantics { contentDescription = (if (item.isRead) "" else "Уншаагүй. ") + item.title + ". " + item.body },
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.padding(top = 6.dp).size(10.dp).background(if (item.isRead) Color.Transparent else Theme.accent, CircleShape))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    item.title,
                    style = if (item.isRead) SdyType.body else SdyType.body.copy(fontWeight = FontWeight.SemiBold),
                    color = Color.White, modifier = Modifier.weight(1f),
                )
                if (!item.isRead) Text("Шинэ", style = SdyType.caption2.copy(fontWeight = FontWeight.Bold), color = Theme.accent, modifier = Modifier.padding(start = 8.dp, top = 4.dp))
            }
            if (item.body.isNotEmpty()) Text(item.body, style = SdyType.subheadline, color = Theme.secondaryText)
            Text(Formatters.relative(item.createdAt), style = SdyType.caption, color = Theme.secondaryText)
        }
    }
}

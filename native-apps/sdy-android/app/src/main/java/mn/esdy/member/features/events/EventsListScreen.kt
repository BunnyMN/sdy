package mn.esdy.member.features.events

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.PersonOff
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Duration
import java.time.Instant
import mn.esdy.member.app.LocalApp
import mn.esdy.member.app.LocalNav
import mn.esdy.member.app.Route
import mn.esdy.member.core.Formatters
import mn.esdy.member.core.Haptics
import mn.esdy.member.core.events
import mn.esdy.member.design.Chips
import mn.esdy.member.design.DarkCard
import mn.esdy.member.design.ErrorStateView
import mn.esdy.member.design.GlassCircleButton
import mn.esdy.member.design.HeroScaffold
import mn.esdy.member.design.HeroOfflineBanner
import mn.esdy.member.design.HeroTitle
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SkeletonCards
import mn.esdy.member.design.StatusChip
import mn.esdy.member.design.Theme
import mn.esdy.member.design.Tone
import mn.esdy.member.design.pressable
import mn.esdy.member.design.rememberLoader
import mn.esdy.member.design.rise
import mn.esdy.member.features.manage.EventEditorSheet
import mn.esdy.member.models.EventRecord
import mn.esdy.member.models.Permission

internal enum class EventFilter(val title: String) { Upcoming("Удахгүй"), Past("Өнгөрсөн") }

@Composable
fun EventsListScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val loader = rememberLoader { app.api.events().events }
    var filter by rememberSaveable { mutableStateOf(EventFilter.Upcoming) }
    var creating by rememberSaveable { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        HeroOfflineBanner()
        HeroScaffold(
            heroHeight = 230.dp,
            onRefresh = { loader.load() },
            compact = { Text("Арга хэмжээ", style = SdyType.headline, color = Color.White) },
            pinned = if (app.can(Permission.manageEvents)) ({
                Row(Modifier.fillMaxWidth()) {
                    Spacer(Modifier.weight(1f))
                    GlassCircleButton(Icons.Rounded.Add, "Арга хэмжээ нэмэх") { creating = true }
                }
            }) else null,
            header = { HeroTitle("Арга хэмжээ", app.me?.tenantName) },
        ) {
            val events = loader.value
            val error = loader.error
            when {
                events != null -> {
                    val shown = filtered(events, filter)
                    FilterBar(filter, Modifier.rise(0)) { filter = it }
                    if (shown.isEmpty()) {
                        DarkCard(Modifier.rise(1)) {
                            Column(
                                Modifier.fillMaxWidth().padding(vertical = 18.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Icon(Icons.Rounded.CalendarMonth, null, tint = Theme.secondaryText, modifier = Modifier.size(36.dp))
                                Text(
                                    if (filter == EventFilter.Upcoming) "Удахгүй болох арга хэмжээ алга" else "Өнгөрсөн арга хэмжээ алга",
                                    style = SdyType.headline, color = Color.White, textAlign = TextAlign.Center,
                                )
                                Text(
                                    if (filter == EventFilter.Upcoming) "Салбар шинэ арга хэмжээ зарлахад энд гарна. Доош татаж шинэчилнэ үү."
                                    else "Таны салбарт болсон арга хэмжээ энд харагдана.",
                                    style = SdyType.subheadline, color = Theme.secondaryText, textAlign = TextAlign.Center,
                                )
                            }
                        }
                    } else {
                        shown.forEachIndexed { index, event ->
                            EventRow(event, Modifier.rise(index + 1).pressable(0.98f) { nav.push(Route.Event(event.id)) })
                        }
                    }
                }
                error != null -> ErrorStateView(error) { loader.reload() }
                else -> SkeletonCards(count = 4)
            }
        }
    }

    if (creating) {
        EventEditorSheet(event = null, onDismiss = { creating = false }) { saved ->
            creating = false
            loader.reload()
            nav.push(Route.Event(saved.id))
        }
    }
}

private fun filtered(events: List<EventRecord>, filter: EventFilter): List<EventRecord> {
    val cutoff = Instant.now().minus(Duration.ofHours(6))
    return when (filter) {
        EventFilter.Upcoming -> events.filter { (it.startDate ?: Instant.MIN) >= cutoff && it.status != "done" }
            .sortedBy { it.startDate ?: Instant.MAX }
        EventFilter.Past -> events.filter { (it.startDate ?: Instant.MIN) < cutoff || it.status == "done" }
            .sortedByDescending { it.startDate ?: Instant.MIN }
    }
}

/** Upcoming / past, as a capsule switch whose knob slides between the two. */
@Composable
internal fun FilterBar(selection: EventFilter, modifier: Modifier = Modifier, onSelect: (EventFilter) -> Unit) {
    BoxWithConstraints(
        modifier.fillMaxWidth()
            .background(Theme.card, CircleShape)
            .border(1.dp, Color.White.copy(alpha = 0.06f), CircleShape)
            .padding(4.dp),
    ) {
        val segment = (maxWidth - 4.dp) / 2
        val knobX by animateDpAsState(if (selection == EventFilter.Upcoming) 0.dp else segment + 4.dp, spring(dampingRatio = 0.8f, stiffness = 400f), label = "knob")
        Box(Modifier.offset(x = knobX).width(segment).height(40.dp).background(Color.White, CircleShape))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            EventFilter.entries.forEach { item ->
                val on = selection == item
                val color by animateColorAsState(if (on) Color.Black else Color.White, label = "filter")
                Box(
                    Modifier.width(segment).height(40.dp)
                        .pressable(0.97f, role = Role.Tab) { Haptics.tap(); onSelect(item) }
                        .semantics { selected = on },
                    contentAlignment = Alignment.Center,
                ) { Text(item.title, style = SdyType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = color) }
            }
        }
    }
}

@Composable
internal fun EventRow(event: EventRecord, modifier: Modifier = Modifier) {
    val date = event.startDate?.atZone(Formatters.zone)
    Row(
        modifier.fillMaxWidth()
            .background(Theme.card, RoundedCornerShape(24.dp))
            .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(24.dp))
            .padding(16.dp)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(
            Modifier.width(52.dp).height(58.dp).background(Color.White, RoundedCornerShape(15.dp)),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
        ) {
            Text(date?.dayOfMonth?.toString() ?: "—", fontSize = 22.sp, fontWeight = FontWeight.Bold, fontFamily = mn.esdy.member.design.Inter, color = Color.Black, lineHeight = 24.sp)
            Text(date?.let { "${it.monthValue} сар" } ?: "", style = SdyType.caption2.copy(fontWeight = FontWeight.SemiBold), color = Color.Black.copy(alpha = 0.55f), maxLines = 1)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            val cancelled = event.status == "cancelled"
            Text(
                event.title, style = SdyType.headline.copy(textDecoration = if (cancelled) TextDecoration.LineThrough else null),
                color = if (cancelled) Theme.secondaryText else Color.White,
            )
            IconLabel(Formatters.relative(event.startsAt), Icons.Rounded.Schedule, color = Theme.secondaryText, style = SdyType.subheadline, iconSize = 16.dp)
            if (event.location.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Place, null, tint = Theme.secondaryText, modifier = Modifier.size(16.dp))
                    Text(event.location, style = SdyType.subheadline, color = Theme.secondaryText, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                IconLabel(event.capacityText, Icons.Rounded.Group, color = Theme.secondaryText, style = SdyType.caption, iconSize = 14.dp, modifier = Modifier.weight(1f))
                if (event.status != "planned") StatusChip(Chips.eventStatus(event.status))
                val chip = Chips.attendance(event.myStatus)
                if (chip != null) StatusChip(chip)
                else if (event.isFull && event.isOpen) StatusChip("Дүүрсэн", Icons.Rounded.PersonOff, Tone.Danger)
            }
        }
        Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Theme.tertiaryText, modifier = Modifier.padding(top = 4.dp).size(20.dp))
    }
}

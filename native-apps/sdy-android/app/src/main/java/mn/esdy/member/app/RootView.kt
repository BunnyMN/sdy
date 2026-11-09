package mn.esdy.member.app

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.sin
import kotlinx.coroutines.launch
import mn.esdy.member.R
import mn.esdy.member.design.ErrorStateView
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SilkBackground
import mn.esdy.member.design.Theme
import mn.esdy.member.design.pressable
import mn.esdy.member.design.rememberAnimationTime
import mn.esdy.member.design.rememberReduceMotion
import mn.esdy.member.features.checkin.CheckInConfirmSheet
import mn.esdy.member.features.checkin.CheckInTabScreen
import mn.esdy.member.features.dues.DuesScreen
import mn.esdy.member.features.events.EventsListScreen
import mn.esdy.member.features.home.HomeScreen
import mn.esdy.member.features.login.LoginScreen
import mn.esdy.member.features.profile.ProfileScreen

@Composable
fun RootView() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    val phaseKey = when (app.phase) {
        AppModel.Phase.Launching -> 0
        AppModel.Phase.SignedOut -> 1
        AppModel.Phase.SignedIn -> 2
        is AppModel.Phase.Failed -> 3
    }
    Crossfade(phaseKey, Modifier.fillMaxSize().background(Theme.canvas), animationSpec = tween(400), label = "phase") { shown ->
        when (shown) {
            0 -> LaunchView()
            1 -> LoginScreen()
            2 -> MainTabView()
            else -> {
                val error = (app.phase as? AppModel.Phase.Failed)?.error
                Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    if (error != null) ErrorStateView(error) { scope.launch { app.phase = AppModel.Phase.Launching; app.bootstrap() } }
                    Text(
                        "Гарах", style = SdyType.body, color = Theme.danger,
                        modifier = Modifier.padding(bottom = 32.dp).pressable { scope.launch { app.signOut() } }.padding(16.dp),
                    )
                }
            }
        }
    }
}

/**
 * Shown while the session is checked. It begins exactly where the system
 * launch screen ends — the silver wordmark, centred, on black — then lets
 * the silk fade in, sweeps light across the letters and runs a slim loader,
 * so the hand-over to Home is black to black with nothing jumping.
 */
@Composable
fun LaunchView() {
    val reduceMotion = rememberReduceMotion()
    val time by rememberAnimationTime(paused = reduceMotion)
    var silk by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { silk = true }
    val silkAlpha by animateFloatAsState(if (silk) 1f else 0f, tween(900), label = "silk")
    Box(Modifier.fillMaxSize().background(Theme.canvas).clearAndSetSemantics { contentDescription = "SDY. Ачаалж байна" }) {
        SilkBackground(Modifier.fillMaxSize().graphicsLayer { alpha = silkAlpha })
        Box(Modifier.align(Alignment.Center)) {
            val t = if (reduceMotion) 0f else time
            ShimmerWordmark(widthDp = 213, sweep = minOf((t % 2.6f) / 1.2f, 1.2f))
            LoaderBar(t, Modifier.align(Alignment.BottomCenter).offset(y = 48.dp))
        }
    }
}

/** The wordmark with a band of light crossing it; `sweep` runs 0 → 1 across. */
@Composable
fun ShimmerWordmark(widthDp: Int, sweep: Float) {
    Image(
        painterResource(R.drawable.wordmark), null,
        modifier = Modifier.width(widthDp.dp)
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()
                val w = size.width
                val band = w * 0.35f
                val x = -w * 0.85f + w * 1.7f * sweep
                // Light only where the letters are (src-atop keeps the mark's shape).
                drawRect(
                    Brush.linearGradient(
                        0f to Color.Transparent, 0.5f to Color.White.copy(alpha = 0.85f), 1f to Color.Transparent,
                        start = Offset(x, 0f), end = Offset(x + band, size.height * 0.33f),
                    ),
                    blendMode = BlendMode.SrcAtop,
                )
            },
    )
}

/** A slim track with a light that glides back and forth. */
@Composable
fun LoaderBar(phase: Float, modifier: Modifier = Modifier) {
    val x = (sin(phase * 2.4f) + 1) / 2
    Box(modifier.width(120.dp).height(3.dp).background(Color.White.copy(alpha = 0.12f), CircleShape)) {
        Box(
            Modifier.offset(x = ((120 - 44) * x).dp).width(44.dp).height(3.dp)
                .background(Brush.horizontalGradient(listOf(Theme.brandRed.copy(alpha = 0f), Theme.brandRed, Color.White)), CircleShape),
        )
    }
}

private data class TabItem(val tab: AppModel.Tab, val title: String, val icon: ImageVector)

@Composable
fun MainTabView() {
    val app = LocalApp.current
    val tabs = buildList {
        add(TabItem(AppModel.Tab.Home, "Нүүр", Icons.Rounded.Home))
        if (app.hasApprovedBranch) {
            add(TabItem(AppModel.Tab.Events, "Арга хэмжээ", Icons.Rounded.CalendarMonth))
            add(TabItem(AppModel.Tab.Checkin, "Ирц", Icons.Rounded.QrCodeScanner))
            add(TabItem(AppModel.Tab.Dues, "Хураамж", Icons.Rounded.Payments))
        }
        add(TabItem(AppModel.Tab.Profile, "Профайл", Icons.Rounded.AccountCircle))
    }
    // A tab the member no longer has (left their branch) falls back to Home.
    if (tabs.none { it.tab == app.tab }) app.tab = AppModel.Tab.Home

    // Back on another tab's first screen returns to Нүүр before leaving the app.
    androidx.activity.compose.BackHandler(enabled = app.tab != AppModel.Tab.Home) { app.tab = AppModel.Tab.Home }

    key(app.epoch) {
        val holder = rememberSaveableStateHolder()
        Column(Modifier.fillMaxSize().background(Theme.canvas)) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                // Every visited tab stays composed so its stack and scroll survive switching.
                val visited = remember { mutableSetOf<AppModel.Tab>() }
                visited += app.tab
                tabs.filter { it.tab in visited }.forEach { item ->
                    val shown = item.tab == app.tab
                    key(item.tab) {
                        Box(Modifier.fillMaxSize().hiddenIf(!shown)) {
                            androidx.compose.runtime.CompositionLocalProvider(mn.esdy.member.design.LocalCovered provides !shown) {
                                holder.SaveableStateProvider(item.tab.name) {
                                    TabStack(app.paths.getValue(item.tab)) {
                                        when (item.tab) {
                                            AppModel.Tab.Home -> HomeScreen()
                                            AppModel.Tab.Events -> EventsListScreen()
                                            AppModel.Tab.Checkin -> CheckInTabScreen()
                                            AppModel.Tab.Dues -> DuesScreen()
                                            AppModel.Tab.Profile -> ProfileScreen()
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            TabBar(tabs, app.tab, app.unreadCount) { app.select(it) }
        }
    }

    val pending = app.pendingCheckin
    if (pending != null && app.hasApprovedBranch) {
        CheckInConfirmSheet(code = pending, onDismiss = { app.pendingCheckin = null })
    }
}

/** The iOS-style tab bar: icon over label, SDY red when selected, a badge on Нүүр. */
@Composable
private fun TabBar(tabs: List<TabItem>, selected: AppModel.Tab, unread: Int, onSelect: (AppModel.Tab) -> Unit) {
    Column(Modifier.fillMaxWidth().background(Color(0xF20D0D0D))) {
        Box(Modifier.fillMaxWidth().height(0.5.dp).background(Theme.separator))
        Row(Modifier.fillMaxWidth().navigationBarsPadding().height(56.dp)) {
            tabs.forEach { item ->
                val on = item.tab == selected
                val tint = if (on) Theme.accent else Color(0xFF8E8E93)
                Column(
                    Modifier.weight(1f).fillMaxWidth().pressable(0.92f) { onSelect(item.tab) }
                        .semantics(mergeDescendants = true) { role = Role.Tab; this.selected = on }
                        .padding(top = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    BadgedBox(badge = {
                        if (item.tab == AppModel.Tab.Home && unread > 0) Badge(containerColor = Theme.danger) { Text("$unread", color = Color.White) }
                    }) { Icon(item.icon, null, tint = tint, modifier = Modifier.size(26.dp)) }
                    Text(item.title, fontSize = 10.sp, fontWeight = FontWeight.Medium, color = tint, maxLines = 1)
                    Spacer(Modifier.height(2.dp))
                }
            }
        }
    }
}

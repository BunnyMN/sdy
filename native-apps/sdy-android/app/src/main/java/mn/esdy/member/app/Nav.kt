package mn.esdy.member.app

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.clearAndSetSemantics
import mn.esdy.member.design.LocalCovered
import mn.esdy.member.design.Theme

/** Screens pushed from Нүүр / Профайл (iOS HomeRoute). */
enum class HomeRoute {
    Notifications, Transfers, Record, Participation, Leaderboard, History, About, DeleteAccount,
    JoinRequest, Appearance, Blocked, ManageMembers, Sanctions, Finance;

    companion object {
        /** iOS raw values, for the `SDYHomeRoute` / `SDYProfileRoute` launch extras. */
        fun from(raw: String?): HomeRoute? = entries.firstOrNull { it.name.equals(raw, ignoreCase = true) }
    }
}

/** What a tab's stack can hold. */
sealed interface Route {
    val key: String

    data class Home(val route: HomeRoute) : Route { override val key get() = "home:${route.name}" }
    data class Event(val id: String) : Route { override val key get() = "event:$id" }
    /** Any other screen, built in place (iOS NavigationLink { destination }). */
    class Screen(override val key: String, val content: @Composable () -> Unit) : Route
}

/** One pushed screen and its slide-in / slide-out. */
class NavEntry(val route: Route, animated: Boolean = true) {
    val visible = MutableTransitionState(!animated).apply { targetState = true }
    val id: Long = nextId++

    private companion object { var nextId = 0L }
}

/** A tab's navigation (iOS NavigationStack(path:)). */
class Nav(val stack: SnapshotStateList<NavEntry>) {
    val depth: Int get() = stack.count { it.visible.targetState }

    fun push(route: Route) { stack.add(NavEntry(route)) }
    fun push(key: String, content: @Composable () -> Unit) = push(Route.Screen(key, content))

    /** Slides the top screen out; it leaves the stack when the slide ends. */
    fun pop() { stack.lastOrNull { it.visible.targetState }?.let { it.visible.targetState = false } }

    fun popToRoot() { stack.forEach { it.visible.targetState = false } }

    fun set(routes: List<Route>) {
        stack.clear()
        stack.addAll(routes.map { NavEntry(it, animated = false) })
    }
}

val LocalNav = compositionLocalOf<Nav> { error("No Nav") }

/** True inside a screen that was pushed (it shows a back button). */
val LocalIsPushed = compositionLocalOf { false }

/**
 * A tab: its root screen with pushed screens drawn over it. Screens below
 * the top stay composed (their state and scroll position survive, as on
 * iOS) but are not drawn and their animations pause.
 */
@Composable
fun TabStack(stack: SnapshotStateList<NavEntry>, root: @Composable () -> Unit) {
    val nav = remember(stack) { Nav(stack) }
    CompositionLocalProvider(LocalNav provides nav) {
        // Only the tab on screen answers Back (hidden tabs stay composed).
        BackHandler(enabled = nav.depth > 0 && !LocalCovered.current) { nav.pop() }
        val top = stack.indexOfLast { it.visible.targetState }
        val topSettled = top >= 0 && stack[top].visible.isIdle && stack[top].visible.currentState
        Box(Modifier.fillMaxSize()) {
            CompositionLocalProvider(LocalCovered provides topSettled) {
                Box(Modifier.fillMaxSize().hiddenIf(topSettled)) { root() }
            }
            stack.forEachIndexed { index, entry ->
                key(entry.id) {
                    val covered = index < top && topSettled
                    // Leaves the stack once its slide-out has finished.
                    LaunchedEffect(entry) {
                        snapshotFlow { entry.visible.isIdle && !entry.visible.currentState && !entry.visible.targetState }
                            .collect { gone -> if (gone) stack.remove(entry) }
                    }
                    AnimatedVisibility(
                        visibleState = entry.visible,
                        enter = slideInHorizontally(tween(320)) { it } + fadeIn(tween(200)),
                        exit = slideOutHorizontally(tween(280)) { it } + fadeOut(tween(280)),
                    ) {
                        CompositionLocalProvider(LocalIsPushed provides true, LocalCovered provides covered) {
                            Box(Modifier.fillMaxSize().hiddenIf(covered).background(Theme.canvas)) {
                                RouteContent(entry.route)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Not drawn, not touchable, not read by TalkBack — a screen under another. */
fun Modifier.hiddenIf(hidden: Boolean) = if (!hidden) this else this
    .drawWithContent { }
    .clearAndSetSemantics { }
    .pointerInput(Unit) {
        awaitPointerEventScope {
            while (true) awaitPointerEvent(PointerEventPass.Initial).changes.forEach { it.consume() }
        }
    }

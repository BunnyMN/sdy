package mn.esdy.member.design

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlinx.coroutines.launch
import mn.esdy.member.design.Aurora.drawAurora
import mn.esdy.member.design.Starfield.drawStarfield

/**
 * True for a screen that another screen is pushed over: its moving
 * backgrounds hold still while nobody can see them.
 */
val LocalCovered = compositionLocalOf { false }

/**
 * The dark, slowly moving background behind every screen's header, in the
 * theme the member chose (Профайл → Өнгө төрх): silk ribbons in red, silver
 * or gold, a starfield, or glass light. All drawn in code. Holds still when
 * animations are off.
 */
@Composable
fun SilkBackground(modifier: Modifier = Modifier, redTint: Float = 0.35f, forcedTheme: AppTheme? = null) {
    val chosen by ThemeStore.chosen
    val theme = forcedTheme ?: chosen
    val reduceMotion = rememberReduceMotion()
    val time = rememberAnimationTime(paused = reduceMotion || LocalCovered.current)
    Crossfade(theme, modifier.clearAndSetSemantics { }, animationSpec = tween(500), label = "silk") { shown ->
        Canvas(Modifier.fillMaxSize()) {
            val t = if (reduceMotion) 0f else time.value
            drawRect(Theme.canvas)
            when (shown) {
                AppTheme.Space -> drawStarfield(t)
                AppTheme.Glass -> drawAurora(t)
                else -> {
                    val r = shown.ribbons(redTint)
                    ribbon(t, 0f, 0.30f, 0.22f, r.first)
                    ribbon(t * 0.8f, 2.1f, 0.48f, 0.18f, r.second)
                    ribbon(t * 0.6f, 4.2f, 0.66f, 0.14f, r.third)
                }
            }
            drawRect(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.55f), 0.5f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.35f)))
        }
    }
}

/**
 * One ribbon: a wide band whose upper edge is a slow sine wave, shaded
 * across its width so it reads as folded fabric catching light.
 */
private fun DrawScope.ribbon(t: Float, phase: Float, y: Float, depth: Float, colors: List<Color>) {
    val w = size.width
    val h = size.height
    val base = h * y
    val path = Path().apply {
        moveTo(0f, base)
        val steps = 48
        for (i in 0..steps) {
            val u = i.toFloat() / steps
            val wave = sin(u * PI.toFloat() * 1.6f + t * 0.35f + phase) * h * depth * 0.5f +
                sin(u * PI.toFloat() * 3.2f - t * 0.22f + phase) * h * depth * 0.18f
            lineTo(w * u, base + wave)
        }
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    val shift = sin(t * 0.25f + phase) * 0.15f
    drawPath(path, Brush.linearGradient(colors, start = Offset(w * shift, base - h * 0.2f), end = Offset(w * (1f + shift), base + h * 0.3f)))
}

/**
 * A screen with a silk header that the content sheet slides over: the
 * header drifts at half speed and fades when scrolled, and the content sits
 * on a black sheet with large rounded top corners.
 *
 * The header box starts at the very top of the screen, under the status bar
 * (iOS: .ignoresSafeArea(edges: .top)); `pinned` is laid out below the status
 * bar and fades as the page scrolls; `compact` fades in as a bar once the
 * header has scrolled away.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HeroScaffold(
    heroHeight: Dp = 320.dp,
    overlap: Dp = 32.dp,
    onRefresh: (suspend () -> Unit)? = null,
    compact: (@Composable () -> Unit)? = null,
    pinned: (@Composable () -> Unit)? = null,
    scrollState: ScrollState = rememberScrollState(),
    header: @Composable BoxScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val density = LocalDensity.current
    val heroPx = with(density) { heroHeight.toPx() }
    val overlapPx = with(density) { overlap.roundToPx() }
    val body = @Composable {
        Column(Modifier.fillMaxSize().background(Theme.canvas).verticalScroll(scrollState)) {
            Box(
                Modifier.fillMaxWidth().height(heroHeight).graphicsLayer {
                    // Drifts at half speed under the sheet.
                    translationY = scrollState.value * 0.5f
                },
            ) {
                SilkBackground(Modifier.fillMaxWidth().height(heroHeight + overlap))
                Box(
                    Modifier.fillMaxWidth().height(heroHeight).graphicsLayer {
                        val y = -scrollState.value.toFloat()
                        alpha = if (y < 0) max(0f, 1 + y / (heroPx * 0.6f)) else 1f
                        val scale = if (y < 0) max(0.8f, 1 + y / (heroPx * 1.6f)) else 1f
                        scaleX = scale; scaleY = scale
                        transformOrigin = TransformOrigin(0.5f, 0f)
                    },
                    content = header,
                )
            }
            Column(
                Modifier
                    .layout { measurable, constraints ->
                        val p = measurable.measure(constraints)
                        layout(p.width, max(0, p.height - overlapPx)) { p.place(0, -overlapPx) }
                    }
                    .fillMaxWidth()
                    .background(Theme.canvas, RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp))
                    .padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                content = content,
            )
        }
    }
    Box(Modifier.fillMaxSize().background(Theme.canvas)) {
        if (onRefresh != null) {
            val scope = rememberCoroutineScope()
            var refreshing by remember { mutableStateOf(false) }
            PullToRefreshBox(
                isRefreshing = refreshing,
                onRefresh = { scope.launch { refreshing = true; try { onRefresh() } finally { refreshing = false } } },
                modifier = Modifier.fillMaxSize(),
            ) { body() }
        } else {
            body()
        }
        if (pinned != null) {
            val fade = (1f - scrollState.value / with(density) { 140.dp.toPx() }).coerceIn(0f, 1f)
            if (fade > 0.02f) {
                Box(
                    Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 20.dp).padding(top = 6.dp)
                        .graphicsLayer { alpha = fade },
                ) { pinned() }
            }
        }
        if (compact != null) {
            val start = heroPx - with(density) { 190.dp.toPx() }
            val progress = ((scrollState.value - start) / with(density) { 70.dp.toPx() }).coerceIn(0f, 1f)
            if (progress > 0f) {
                Box(
                    Modifier.fillMaxWidth()
                        .graphicsLayer { alpha = progress; translationY = (1 - progress) * -8 * density.density }
                        .background(Color(0xE6101010))
                        .statusBarsPadding()
                        .height(52.dp)
                        .padding(horizontal = 20.dp),
                    contentAlignment = Alignment.CenterStart,
                ) { compact() }
            }
        }
    }
}

/** The header of a list screen (Events, Dues): a large title on the silk. */
@Composable
fun BoxScope.HeroTitle(title: String, subtitle: String? = null) {
    Column(
        Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 52.dp)
            .semantics(mergeDescendants = true) { heading() },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(title, fontSize = 40.sp, fontWeight = FontWeight.Bold, color = Color.White, lineHeight = 44.sp)
        if (subtitle != null) Text(subtitle, style = SdyType.subheadline, color = Color.White.copy(alpha = 0.7f))
    }
}

/**
 * The silk glowing behind a list screen's large title, fading into black
 * (iOS: .silkListBackground()). Put it first in a full-screen Box.
 */
@Composable
fun SilkListBackground(height: Dp = 300.dp, scrollOffsetPx: Float = 0f) {
    Box(
        Modifier.fillMaxWidth().height(height)
            .graphicsLayer {
                translationY = -scrollOffsetPx * 0.5f
                compositingStrategy = CompositingStrategy.Offscreen
            }
            .layout { m, c -> val p = m.measure(c); layout(p.width, p.height) { p.place(0, 0) } },
    ) {
        SilkBackground(Modifier.fillMaxSize())
        // Fade to black towards the bottom (iOS masks with black → clear).
        Canvas(Modifier.fillMaxSize()) {
            drawRect(Brush.verticalGradient(0f to Color.Transparent, 0.66f to Color.Transparent, 1f to Theme.canvas))
        }
    }
}

/** The status bar's height, for headers drawn under it. */
@Composable
fun statusBarHeight(): Dp = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()


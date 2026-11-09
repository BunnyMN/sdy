package mn.esdy.member.design

import android.content.Context
import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * The header background a member chooses in Профайл → Өнгө төрх. Kept on the
 * device (SharedPreferences), not on the server: it is how this phone looks.
 */
enum class AppTheme(val raw: String) {
    Silk("silk"), Glass("glass"), Space("space"), Silver("silver"), Gold("gold");

    val title: String get() = when (this) {
        Silk -> "Улаан торго"
        Glass -> "Шилэн туяа"
        Space -> "Сансар"
        Silver -> "Мөнгөлөг"
        Gold -> "Алтан"
    }

    val subtitle: String get() = when (this) {
        Silk -> "SDY-ийн улаан, графит торго"
        Glass -> "Өнгөлөг туяа, царцмаг шил"
        Space -> "Анивчих одод, гариг"
        Silver -> "Цэвэр мөнгөлөг графит"
        Gold -> "Алтлаг гэрэлтэй торго"
    }

    /** The theme's accent: the picker's Save button and the preview's icons. */
    val accent: Color get() = when (this) {
        Silk -> Theme.brandRed
        Glass -> Color(0.55f, 0.33f, 0.98f)
        Space -> Color(0.42f, 0.45f, 0.95f)
        Silver -> Color(0.50f, 0.50f, 0.50f)
        Gold -> Color(0.55f, 0.36f, 0.06f)
    }

    /** The three ribbons' colours, darkest edge → highlight → edge. */
    fun ribbons(redTint: Float): Triple<List<Color>, List<Color>, List<Color>> = when (this) {
        Silk, Space, Glass -> Triple(
            listOf(white(0.10f), white(0.34f), white(0.12f)),
            listOf(white(0.06f), Theme.brandRed.copy(alpha = redTint), white(0.20f)),
            listOf(white(0.14f), white(0.42f), white(0.08f)),
        )
        Silver -> Triple(
            listOf(white(0.10f), white(0.40f), white(0.12f)),
            listOf(white(0.08f), white(0.55f), white(0.18f)),
            listOf(white(0.14f), white(0.48f), white(0.08f)),
        )
        Gold -> {
            val gold = Color(0.85f, 0.66f, 0.32f)
            Triple(
                listOf(white(0.08f), gold.copy(alpha = 0.35f), white(0.10f)),
                listOf(white(0.06f), gold.copy(alpha = 0.65f), Color(0.25f, 0.18f, 0.08f)),
                listOf(white(0.12f), Color(0.55f, 0.42f, 0.22f), white(0.08f)),
            )
        }
    }

    companion object {
        fun from(raw: String?): AppTheme = entries.firstOrNull { it.raw == raw } ?: Silk
    }
}

/** A grey of the given brightness (SwiftUI's Color(white:)). */
fun white(v: Float, alpha: Float = 1f) = Color(v, v, v, alpha)

/** The chosen theme, observable, persisted under the iOS key "sdy.theme". */
object ThemeStore {
    const val storageKey = "sdy.theme"
    private var prefs: android.content.SharedPreferences? = null
    private val state = mutableStateOf(AppTheme.Silk)

    val chosen: State<AppTheme> get() = state

    fun init(context: Context) {
        prefs = context.getSharedPreferences("sdy.prefs", Context.MODE_PRIVATE)
        state.value = AppTheme.from(prefs?.getString(storageKey, null))
    }

    fun choose(theme: AppTheme) {
        state.value = theme
        prefs?.edit()?.putString(storageKey, theme.raw)?.apply()
    }
}

/** Whether the system asks for no animation (iOS: Reduce Motion). */
@Composable
fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    return remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/**
 * Seconds since an arbitrary start, advancing at ~30 fps while not paused
 * (iOS: TimelineView(.animation(minimumInterval: 1/30))).
 */
@Composable
fun rememberAnimationTime(paused: Boolean): State<Float> {
    val time = remember { mutableFloatStateOf(0f) }
    LaunchedEffect(paused) {
        if (paused) return@LaunchedEffect
        var last = 0L
        var origin = -1L
        val base = time.floatValue
        while (true) {
            withFrameNanos { now ->
                if (origin < 0) origin = now
                if (now - last >= 33_000_000L) {
                    last = now
                    time.floatValue = base + (now - origin) / 1_000_000_000f
                }
            }
        }
    }
    return time
}

/**
 * Stars that twinkle slowly over a dark sky, and the rim of a planet rising
 * at the bottom, lit from above.
 */
object Starfield {
    /** Fixed positions, so the sky does not reshuffle between frames. */
    private val stars: List<FloatArray> = run {
        var seed = 1997UL
        fun next(): Float {
            seed = seed * 6364136223846793005UL + 1442695040888963407UL
            return ((seed shr 33).toDouble() / (1L shl 31).toDouble()).toFloat()
        }
        List(170) { floatArrayOf(next(), next() * 0.85f, 0.5f + next() * 1.3f, next() * 6.28f) }
    }

    fun DrawScope.drawStarfield(t: Float) {
        val w = size.width
        val h = size.height
        val d = density
        drawRect(Brush.verticalGradient(listOf(Color(0.01f, 0.01f, 0.04f), Color(0.03f, 0.03f, 0.08f))))
        for (s in stars) {
            val twinkle = 0.45f + 0.55f * (0.5f + 0.5f * sin(t * 1.3f + s[3]))
            drawCircle(Color.White.copy(alpha = twinkle.coerceIn(0f, 1f)), radius = s[2] * d, center = Offset(s[0] * w, s[1] * h))
        }
        // The planet: a huge disc whose top edge rises into the frame.
        val radius = w * 1.25f
        val centre = Offset(w / 2 + sin(t * 0.05f) * 6 * d, h + radius * 0.72f)
        drawCircle(
            Brush.radialGradient(listOf(white(0.55f), white(0.30f), white(0.10f)), center = Offset(centre.x, centre.y - radius * 0.9f), radius = radius * 1.1f),
            radius = radius, center = centre,
        )
        drawCircle(Color.White.copy(alpha = 0.25f), radius = radius, center = centre, style = Stroke(1.5f * d))
        // A faint red atmosphere along the rim.
        drawCircle(Theme.brandRed.copy(alpha = 0.35f), radius = radius, center = centre, style = Stroke(8f * d))
    }
}

/**
 * Large soft orbs of colour drifting and blending on a deep night blue —
 * the backdrop that makes the app's frosted-glass buttons read as glass.
 * (iOS blurs solid discs; here each orb is a radial fade, which reads the same.)
 */
object Aurora {
    private class Orb(val color: Color, val x: Float, val y: Float, val r: Float, val speed: Float, val phase: Float)

    private val orbs = listOf(
        Orb(Color(1.00f, 0.30f, 0.62f), 0.20f, 0.30f, 0.55f, 0.11f, 0.0f),
        Orb(Color(0.48f, 0.36f, 1.00f), 0.80f, 0.25f, 0.60f, 0.09f, 1.7f),
        Orb(Color(0.13f, 0.83f, 0.93f), 0.65f, 0.75f, 0.50f, 0.13f, 3.1f),
        Orb(Color(1.00f, 0.54f, 0.24f), 0.25f, 0.85f, 0.45f, 0.10f, 4.4f),
    )

    fun DrawScope.drawAurora(t: Float) {
        val w = size.width
        val h = size.height
        drawRect(Color(0.05f, 0.04f, 0.12f))
        for (o in orbs) {
            val cx = (o.x + 0.12f * sin(t * o.speed + o.phase)) * w
            val cy = (o.y + 0.10f * cos(t * o.speed * 1.3f + o.phase)) * h
            val r = o.r * max(w, h) * 0.5f * (1 + 0.08f * sin(t * 0.4f + o.phase)) + min(w, h) * 0.16f
            drawCircle(
                Brush.radialGradient(
                    0f to o.color.copy(alpha = 0.85f), 0.55f to o.color.copy(alpha = 0.55f), 1f to o.color.copy(alpha = 0f),
                    center = Offset(cx, cy), radius = r,
                ),
                radius = r, center = Offset(cx, cy),
            )
        }
        // A pale sheen across the top, like light on a pane.
        drawRect(Brush.linearGradient(listOf(Color.White.copy(alpha = 0.10f), Color.Transparent), start = Offset.Zero, end = Offset(w * 0.6f, h * 0.6f)))
    }
}

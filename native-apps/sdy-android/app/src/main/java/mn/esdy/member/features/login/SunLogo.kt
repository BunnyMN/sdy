package mn.esdy.member.features.login

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BlurMaskFilter
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin
import mn.esdy.member.R
import mn.esdy.member.design.Night

/**
 * The SDY Mongolia logo as a small sun at the orbits' centre (iOS SunLogo): a
 * sphere lit from the upper left (a highlight, a shadowed limb, a warm rim), a
 * corona that breathes, and faint rays turning slowly behind it. `t` drives
 * the motion; a fixed `t` holds it still. The view is 2.5 × the diameter.
 */
@Composable
fun SunLogo(diameter: Dp, t: Float, modifier: Modifier = Modifier) {
    val d = diameter
    val pulse = 1 + 0.06f * sin(t * 2 * PI.toFloat() / 5)
    Box(modifier.size(d * 2.5f).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        // Corona: a soft red-orange halo, breathing.
        Canvas(Modifier.size(d * 2.5f).graphicsLayer { scaleX = pulse; scaleY = pulse }) {
            val r = size.minDimension / 2
            drawCircle(
                Brush.radialGradient(
                    0f to Color(0xFFFF5A3C).copy(alpha = 0.55f), 0.336f to Color(0xFFFF5A3C).copy(alpha = 0.55f),
                    0.668f to Night.glow.copy(alpha = 0.28f), 1f to Color.Transparent,
                    center = center, radius = r,
                ),
                radius = r,
            )
        }
        // Rays: twelve soft spokes, turning once in two minutes.
        Canvas(
            Modifier.size(d * 2.1f).blur(d * 0.06f)
                .graphicsLayer { alpha = 0.55f; rotationZ = t * 3; compositingStrategy = CompositingStrategy.Offscreen },
        ) {
            val r = size.minDimension / 2
            val spokes = List(25) { i -> if (i % 2 == 0) Color(0xFFFF7A5C).copy(alpha = 0.5f) else Color.Transparent }
            drawCircle(Brush.sweepGradient(spokes, center), radius = r)
            drawCircle(
                Brush.radialGradient(0f to Color.White, 0.4286f to Color.White, 0.714f to Color.White.copy(alpha = 0.4f), 1f to Color.Transparent, center = center, radius = r),
                radius = r, blendMode = BlendMode.DstIn,
            )
        }
        // The glow the sphere casts (iOS: two coloured shadows).
        Canvas(Modifier.size(d * 2.5f)) {
            val r = d.toPx() / 2
            fun glow(color: Color, spread: Float) {
                val outer = r + spread * 1.4f
                drawCircle(Brush.radialGradient(0f to color, r / outer to color, 1f to Color.Transparent, center = center, radius = outer), radius = outer)
            }
            glow(Night.glow.copy(alpha = 0.5f), d.toPx() * 0.38f)
            glow(Color(0xFFFF4A3A).copy(alpha = 0.75f), d.toPx() * 0.16f * pulse)
        }
        Globe(d, t)
    }
}

/** How far the globe has turned (0…1 a turn); it slows as each face comes round. */
private const val PERIOD = 16f

internal fun sunPhase(t: Float): Float {
    val x = t / PERIOD
    val slowing = 0.62f
    val p = x - slowing / (4 * PI.toFloat()) * sin(4 * PI.toFloat() * x)
    return p - floor(p)
}

/**
 * The red ball with both faces printed on it, half a turn apart, turned
 * about its vertical axis: a face slides towards one edge, narrows with the
 * curve and goes round the back while the other comes up from the far edge.
 * Drawn as 64 thin columns of the flat skin, each squeezed to where that
 * slice of longitude lands on an orthographic globe (x = sin λ). The light,
 * drawn over it, stays put.
 */
@Composable
private fun Globe(diameter: Dp, t: Float) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val dPx = with(density) { diameter.roundToPx() }.coerceAtLeast(8)
    val skin = remember(dPx) { buildSkin(context, dPx, density.density).asImageBitmap() }
    val phase = sunPhase(t)
    Canvas(Modifier.size(diameter).clip(CircleShape)) {
        val d = size.width
        val r = d / 2
        val turn = dPx * 2 // one turn of skin, in its pixels
        val columns = 64
        for (k in 0 until columns) {
            val x0 = -1.0 + 2.0 * k / columns
            val x1 = -1.0 + 2.0 * (k + 1) / columns
            val l0 = asin(x0)
            val l1 = asin(x1)
            var u0 = l0 / (2 * PI) + 0.25 + phase
            u0 -= floor(u0)
            val du = (l1 - l0) / (2 * PI)
            val srcX = (u0 * turn).roundToInt()
            val srcW = max(1, (du * turn).roundToInt())
            val dstX = (r + x0 * r).toFloat()
            val dstW = ((x1 - x0) * r).toFloat()
            // A hair of overlap so no seam shows between columns.
            drawImage(
                skin, srcOffset = IntOffset(srcX, 0), srcSize = IntSize(srcW, dPx),
                dstOffset = IntOffset(floor(dstX).toInt(), 0), dstSize = IntSize((dstW + 1.5f).roundToInt(), d.roundToInt()),
            )
        }
        // Light from the upper left…
        drawCircle(Brush.radialGradient(0f to Color.White.copy(alpha = 0.42f), 0.5f to Color.White.copy(alpha = 0.08f), 1f to Color.Transparent,
            center = Offset(d * 0.32f, d * 0.26f), radius = d * 0.5f))
        // …and the limb turning away from it.
        drawCircle(Brush.radialGradient(0f to Color.Transparent, 0.5f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.6f),
            center = Offset(d * 0.4f, d * 0.36f), radius = d * 0.72f))
        // A warm rim where the corona meets the edge.
        val rim = 1.2f * density.density
        drawCircle(
            Brush.linearGradient(listOf(Color(0xFFFFB199).copy(alpha = 0.85f), Color(0xFFFF5A3C).copy(alpha = 0.25f), Color(0xFFFF5A3C).copy(alpha = 0.6f)), Offset.Zero, Offset(d, d)),
            radius = r - rim / 2, style = Stroke(rim),
        )
    }
}

/**
 * The globe's skin, flat: 360° across (2d), 180° down (d) — SDY Mongolia on
 * the first half, SDY Darkhan-Uul on the second, on the logo's red — drawn
 * twice side by side so a column that runs past the end of a turn still
 * finds skin.
 */
private fun buildSkin(context: android.content.Context, d: Int, density: Float): Bitmap {
    val turn = Bitmap.createBitmap(d * 2, d, Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(turn)
    c.drawColor(0xFFC51E28.toInt())
    val filter = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

    // SDY Mongolia: the logo, its square edge faded into the red.
    val logo = BitmapFactory.decodeResource(context.resources, R.drawable.logo)
    val logoSide = (d * 0.74f).roundToInt()
    val face = Bitmap.createBitmap(d, d, Bitmap.Config.ARGB_8888)
    android.graphics.Canvas(face).apply {
        val o = (d - logoSide) / 2
        drawBitmap(logo, Rect(0, 0, logo.width, logo.height), Rect(o, o, o + logoSide, o + logoSide), filter)
        // Faded to nothing at 0.42 d from the centre; the gradient's clamp
        // clears the logo's corners beyond it too.
        drawRect(0f, 0f, d.toFloat(), d.toFloat(), Paint().apply {
            xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN)
            shader = RadialGradient(d / 2f, d / 2f, d * 0.42f, intArrayOf(-1, -1, 0x00FFFFFF), floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
        })
    }
    c.drawBitmap(face, 0f, 0f, filter)

    // SDY Darkhan-Uul: the wordmark with a small drop shadow.
    val mark = BitmapFactory.decodeResource(context.resources, R.drawable.wordmark)
    val mw = d * 0.6f
    val mh = mw * mark.height / mark.width
    val dst = RectF(d + (d - mw) / 2, (d - mh) / 2, d + (d + mw) / 2, (d + mh) / 2)
    val scaled = Bitmap.createScaledBitmap(mark, mw.roundToInt().coerceAtLeast(1), mh.roundToInt().coerceAtLeast(1), true)
    val blur = (1.5f * density).coerceAtLeast(0.5f)
    val offset = IntArray(2)
    val shadow = scaled.extractAlpha(Paint().apply { maskFilter = BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL) }, offset)
    c.drawBitmap(shadow, dst.left + offset[0], dst.top + offset[1] + density, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x73000000 })
    c.drawBitmap(scaled, dst.left, dst.top, filter)

    val skin = Bitmap.createBitmap(d * 4, d, Bitmap.Config.ARGB_8888)
    android.graphics.Canvas(skin).apply {
        drawBitmap(turn, 0f, 0f, null)
        drawBitmap(turn, (d * 2).toFloat(), 0f, null)
    }
    return skin
}


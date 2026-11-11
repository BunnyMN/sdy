package mn.esdy.member.features.login

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.QuestionMark
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.fillMaxSize
import mn.esdy.member.design.rememberAnimationTime
import mn.esdy.member.design.rememberReduceMotion
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import mn.esdy.member.R
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.AppConfig
import mn.esdy.member.design.Night
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.PrimaryNightButton
import mn.esdy.member.design.Theme
import mn.esdy.member.design.pressable

/**
 * The sign-in screen: a night sky in SDY's red and silver, the logo, the
 * wordmark, one «e-ID | Нэвтрэх» button (iOS LoginView).
 *
 * eID Mongolia is the way in. The button opens EIDLoginSheet, which starts a
 * session at once and hands it to the eID app on this phone. The password
 * sheet stays behind a small link in the fine print: accounts a branch gave a
 * password to, and store reviewers' demo account, which has no eID.
 */
@Composable
fun LoginScreen() {
    val app = LocalApp.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // Kept on the AppModel, so a sign-in under way survives the activity being
    // recreated (iOS: the screen's @StateObject lives as long as the screen).
    val model = remember { app.eidLogin as? EIDLoginModel ?: EIDLoginModel(app.api, context.applicationContext, app.scope).also { app.eidLogin = it } }
    val activity = androidx.activity.compose.LocalActivity.current
    var showEID by rememberSaveable { mutableStateOf(false) }
    var showPassword by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(model) {
        model.onSignedIn = { app.signedIn() }
        // A cold launch from eID's link can bump resumeTick before this screen exists.
        model.resume(app.takeEIDReturnSession())
        if (AppConfig.launchArgument("SDYLoginSheet") == "register") {
            model.showRegistration()
            showEID = true
        }
    }
    LaunchedEffect(app.resumeTick) { model.resume(app.takeEIDReturnSession()) }
    // eID's link reopened the app on a session this phone started: show where it stands.
    LaunchedEffect(model.phase) { if (model.phase is EIDLoginModel.Phase.Waiting && !showEID) showEID = true }
    DisposableEffect(model) {
        onDispose {
            if (activity?.isChangingConfigurations != true) {
                if (model.phase != EIDLoginModel.Phase.Success) model.cancel()
                app.eidLogin = null
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Night.sky)) {
        Scene()
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()
                .padding(horizontal = 24.dp).padding(bottom = 8.dp)
                .widthIn(max = 520.dp).align(Alignment.TopCenter),
        ) {
            Header()
            Spacer(Modifier.weight(1f))
            // The button and its fine print sit over the picture: the floor fades out behind them.
            Column(
                Modifier.fillMaxWidth().heightIn(min = 300.dp)
                    .drawBehind {
                        val fade = 60.dp.toPx()
                        val wide = 24.dp.toPx()
                        drawRect(
                            Brush.verticalGradient(0f to Night.sky.copy(alpha = 0f), fade / (size.height + fade) to Night.sky, startY = -fade, endY = size.height + 40.dp.toPx()),
                            topLeft = Offset(-wide, -fade), size = Size(size.width + wide * 2, size.height + fade + 40.dp.toPx()),
                        )
                    },
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.Bottom),
            ) {
                app.signOutReason?.let {
                    NoticeView(it, NoticeKind.Info, Modifier.fillMaxWidth().background(Theme.cardRaised.copy(alpha = 0.8f), RoundedCornerShape(16.dp)).padding(14.dp))
                }
                PrimaryNightButton(
                    Modifier.padding(bottom = 96.dp).semantics { contentDescription = "e-ID Нэвтрэх. eID Mongolia аппаар баталгаажуулна" },
                    enabled = !model.isBusy,
                    onClick = { showEID = true; model.startHere() },
                ) {
                    Image(
                        painterResource(R.drawable.eid_wordmark), "e-ID",
                        colorFilter = ColorFilter.tint(Color.White), modifier = Modifier.height(17.dp),
                    )
                    Box(Modifier.width(1.dp).height(20.dp).background(Color.White.copy(alpha = 0.32f)))
                    Text("Нэвтрэх")
                }
                FinePrint(
                    onLink = { url ->
                        if (url == PASSWORD_LINK) showPassword = true
                        else context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    },
                )
            }
        }
    }

    if (showEID) {
        EIDLoginSheet(model, onClose = {
            showEID = false
            // Swiped away mid-way: nothing keeps waiting on eID behind the screen.
            if (model.phase != EIDLoginModel.Phase.Success) model.cancel()
        })
    }
    if (showPassword) {
        PasswordLoginSheet(onDismiss = { showPassword = false }) {
            showPassword = false
            scope.launch { app.signedIn() }
        }
    }
}

private const val PASSWORD_LINK = "sdy-login:password"

@Composable
private fun Header() {
    val context = LocalContext.current
    Row(Modifier.fillMaxWidth().heightIn(min = 36.dp).padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("СДМЗХ · ГИШҮҮНИЙ АПП", fontSize = 12.5.sp, letterSpacing = 0.75.sp, color = Night.muted)
        Spacer(Modifier.weight(1f))
        Box(
            Modifier.size(Theme.minTap)
                .pressable(0.9f) { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(AppConfig.supportURL))) }
                .semantics { contentDescription = "Тусламж" },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.size(34.dp).background(Color.White.copy(alpha = 0.05f), CircleShape).border(1.dp, Night.line.copy(alpha = 0.22f), CircleShape),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Rounded.QuestionMark, null, tint = Night.silver, modifier = Modifier.size(15.dp)) }
        }
    }
}

@Suppress("DEPRECATION")
@Composable
private fun FinePrint(onLink: (String) -> Unit) {
    val text = buildAnnotatedString {
        fun link(label: String, url: String) {
            pushStringAnnotation("url", url)
            withStyle(SpanStyle(color = Night.silver)) { append(label) }
            pop()
        }
        link("Нууцлал", AppConfig.privacyURL)
        append(" · ")
        link("Тусламж", AppConfig.supportURL)
        append(" · ")
        link("Нууц үгээр нэвтрэх", PASSWORD_LINK)
    }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("eID Mongolia-аар баталгаажсан иргэн нэвтэрнэ.", fontSize = 12.sp, color = Night.muted, textAlign = TextAlign.Center)
        ClickableText(
            text, style = TextStyle(fontSize = 12.sp, color = Night.muted, textAlign = TextAlign.Center),
            modifier = Modifier,
        ) { offset -> text.getStringAnnotations("url", offset, offset).firstOrNull()?.let { onLink(it.item) } }
    }
}

/**
 * The artwork and what sits in it — the sun and the motto — all placed in
 * the artwork's 390×560 space scaled to the screen's width, so the logo stays
 * at the orbits' centre on every phone. The orbits are drawn in two halves:
 * the far half under the sun, the near half over it. They turn slowly, like a
 * small solar system; still when animations are off.
 */
@Composable
private fun Scene() {
    val reduceMotion = rememberReduceMotion()
    val time by rememberAnimationTime(paused = reduceMotion)
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val w = maxWidth
        val s = w.value / 390f
        Box(Modifier.fillMaxWidth().height(w * 560f / 390f)) {
            val t = if (reduceMotion) STILL_TIME else time
            Canvas(Modifier.fillMaxSize().clearAndSetSemantics { }) { drawSky(t, front = false) }
            val d = (88 * s).dp
            SunLogo(d, t, Modifier.offset(x = (CENTER.x * s).dp - d * 1.25f, y = (CENTER.y * s).dp - d * 1.25f))
            Canvas(Modifier.fillMaxSize().clearAndSetSemantics { }) { drawSky(t, front = true) }

            val skyShadow = with(LocalDensity.current) { 6.dp.toPx() }
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = Night.silver)) { append("Монголын залуучуудын\n") }
                    withStyle(SpanStyle(color = Night.rose)) { append("тэргүүлэгч дэвшилтэт дуу хоолой.") }
                },
                style = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, lineHeight = 27.sp, textAlign = TextAlign.Center,
                    shadow = Shadow(Night.sky, blurRadius = skyShadow)),
                modifier = Modifier.width(w - 48.dp)
                    .layout { m, c ->
                        val p = m.measure(c)
                        layout(p.width, p.height) { p.place(24.dp.roundToPx(), (384 * s).dp.roundToPx() - p.height / 2) }
                    },
            )
        }
    }
}

/** The orbits' centre in the artwork, where the sun stands. */
private val CENTER = Offset(195f, 250f)

/** Where the bodies stand when animations are off: spread around their rings. */
private const val STILL_TIME = 3f

/** The three rings: radii, line opacity, one turn in seconds, starting angle. */
private class Orbit(val rx: Float, val ry: Float, val opacity: Float, val period: Float, val start: Float)

private val ORBITS = listOf(
    Orbit(105f, 39.9f, 0.55f, 16f, 0.4f),
    Orbit(150f, 57.0f, 0.38f, 27f, 2.6f),
    Orbit(200f, 76.0f, 0.24f, 41f, 4.4f),
)

/**
 * A 390×560 artwork, scaled to the screen's width: twinkling stars, a red
 * glow that breathes, three tilted orbits with a silver body going round
 * each (brighter and larger in front, dim behind, a fading trail), and a
 * floor grid to the horizon. `t` is seconds; the picture repeats smoothly.
 */
private fun DrawScope.drawSky(t: Float, front: Boolean) {
    val w = 390f
    val h = 560f
    val s = size.width / w
    val red = Color(0xFFE0464F)
    scale(s, s, pivot = Offset.Zero) {
        if (front) { drawOrbits(t, near = true); return@scale }

        STARS.forEachIndexed { i, st ->
            // Each star its own pace and phase, between 45 % and 100 % of its light.
            val pace = 0.6f + (i % 7) * 0.17f
            val twinkle = 0.725f + 0.275f * sin(t * pace + st[0] * 0.37f + st[1] * 0.11f)
            drawCircle(Color.White.copy(alpha = (st[3] * twinkle).coerceIn(0f, 1f)), radius = st[2], center = Offset(st[0], st[1]))
        }

        val breath = 1 + 0.12f * sin(t * 2 * PI.toFloat() / 7)
        // In the artwork's unit square (iOS scales x by w, y by h): an ellipse, 0.55 w across and 0.55 h down.
        scale(1f, h / w, pivot = Offset(w * 0.5f, h * 0.45f)) {
            drawRect(
                Brush.radialGradient(
                    0f to Color(0xFFC3242E).copy(alpha = (0.55f * breath).coerceAtMost(1f)), 0.45f to Color(0xFF7A1219).copy(alpha = 0.2f * breath), 1f to Night.sky.copy(alpha = 0f),
                    center = Offset(w * 0.5f, h * 0.45f), radius = 0.55f * w,
                ),
                topLeft = Offset(0f, h * 0.45f - h * 0.45f * w / h), size = Size(w, w),
            )
        }

        val floor = Path()
        for (i in 0..20) {
            floor.moveTo(145f + 5f * i, 430f)
            floor.lineTo(-355f + 55f * i, 560f)
        }
        for (y in listOf(430f, 437f, 446.8f, 460.5f, 479.7f, 506.6f, 544.3f)) {
            floor.moveTo(0f, y); floor.lineTo(w, y)
        }
        drawPath(floor, Brush.verticalGradient(listOf(red.copy(alpha = 0f), red.copy(alpha = 0.4f)), startY = 430f, endY = 560f), style = Stroke(1f))
        drawLine(Color(0xFFF08A90).copy(alpha = 0.5f), Offset(0f, 430f), Offset(w, 430f), strokeWidth = 1f)

        drawOrbits(t, near = false)
    }
}

/**
 * One half of every ring and what is on it: the near half (lower on
 * screen, in front of the sun) or the far half (behind it).
 */
private fun DrawScope.drawOrbits(t: Float, near: Boolean) {
    val red = Color(0xFFE0464F)
    val rose = Color(0xFFF08A90)
    val node = Night.silver
    // The plane of the orbits rocks a little, so the system seems to turn in space.
    translate(CENTER.x, CENTER.y) {
        rotate(-14f + 2.5f * sin(t * 2 * PI.toFloat() / 24), pivot = Offset.Zero) {
            for (orbit in ORBITS) {
                fun point(a: Float) = Offset(orbit.rx * cos(a), orbit.ry * sin(a))
                // 0…π is the near half (sin ≥ 0), π…2π the far one.
                val arc = Path()
                val from = if (near) 0f else PI.toFloat()
                for (i in 0..64) {
                    val p = point(from + PI.toFloat() * i / 64)
                    if (i == 0) arc.moveTo(p.x, p.y) else arc.lineTo(p.x, p.y)
                }
                drawPath(arc, red.copy(alpha = orbit.opacity), style = Stroke(1f))

                val angle = orbit.start + t * 2 * PI.toFloat() / orbit.period
                fun onThisSide(a: Float) = (sin(a) >= 0) == near
                // sin > 0 is the near side of the ring (lower on screen): closer, larger, brighter.
                fun depth(a: Float) = 0.5f + 0.5f * sin(a)

                for (k in 14 downTo 1) {
                    val a = angle - k * 0.045f
                    if (!onThisSide(a)) continue
                    val fade = 1 - k / 15f
                    val r = 1.6f * fade * (0.7f + 0.5f * depth(a))
                    drawCircle(rose.copy(alpha = (0.5f * fade * (0.35f + 0.65f * depth(a))).coerceIn(0f, 1f)), radius = r, center = point(a))
                }
                if (!onThisSide(angle)) continue
                val p = point(angle)
                val dd = depth(angle)
                val core = 2.4f + 1.4f * dd
                val ring = 6 + 4 * dd
                drawCircle(Brush.radialGradient(listOf(Night.glow.copy(alpha = (0.45f * dd + 0.1f).coerceIn(0f, 1f)), Color.Transparent), center = p, radius = ring * 1.6f), radius = ring * 1.6f, center = p)
                drawCircle(node.copy(alpha = (0.45f + 0.55f * dd).coerceIn(0f, 1f)), radius = core, center = p)
                drawCircle(node.copy(alpha = (0.15f + 0.25f * dd).coerceIn(0f, 1f)), radius = ring, center = p, style = Stroke(1f))
            }
        }
    }
}

/** x, y, radius, opacity — in the artwork's 390×560 space. */
private val STARS: List<FloatArray> = listOf(
    floatArrayOf(92.8f, 228.6f, 1.0f, 0.75f), floatArrayOf(184.9f, 244.0f, 0.6f, 0.75f), floatArrayOf(183.0f, 231.3f, 0.8f, 0.80f), floatArrayOf(183.4f, 351.3f, 1.2f, 0.44f), floatArrayOf(335.8f, 97.4f, 0.8f, 0.72f), floatArrayOf(204.0f, 311.3f, 0.6f, 0.30f),
    floatArrayOf(373.4f, 18.0f, 0.6f, 0.69f), floatArrayOf(105.1f, 249.8f, 1.2f, 0.63f), floatArrayOf(359.2f, 165.9f, 1.2f, 0.78f), floatArrayOf(52.3f, 153.5f, 0.6f, 0.28f), floatArrayOf(84.6f, 405.5f, 1.2f, 0.67f), floatArrayOf(333.5f, 176.9f, 1.2f, 0.54f),
    floatArrayOf(208.3f, 171.2f, 0.8f, 0.74f), floatArrayOf(266.0f, 390.2f, 1.0f, 0.79f), floatArrayOf(261.8f, 68.5f, 1.0f, 0.78f), floatArrayOf(352.8f, 239.0f, 0.8f, 0.58f), floatArrayOf(385.3f, 112.2f, 0.6f, 0.24f), floatArrayOf(333.0f, 415.7f, 0.6f, 0.41f),
    floatArrayOf(26.0f, 376.8f, 0.6f, 0.38f), floatArrayOf(299.8f, 366.6f, 0.6f, 0.56f), floatArrayOf(297.0f, 158.7f, 1.0f, 0.53f), floatArrayOf(359.5f, 117.2f, 0.8f, 0.80f), floatArrayOf(120.8f, 32.3f, 0.6f, 0.77f), floatArrayOf(378.9f, 122.5f, 1.0f, 0.29f),
    floatArrayOf(16.5f, 364.5f, 1.0f, 0.42f), floatArrayOf(53.9f, 361.9f, 1.2f, 0.48f), floatArrayOf(202.8f, 270.4f, 0.6f, 0.57f), floatArrayOf(366.8f, 213.0f, 1.2f, 0.58f), floatArrayOf(279.1f, 393.3f, 1.2f, 0.79f), floatArrayOf(203.2f, 230.3f, 0.6f, 0.67f),
    floatArrayOf(385.1f, 132.2f, 1.2f, 0.57f), floatArrayOf(246.6f, 25.2f, 1.0f, 0.48f), floatArrayOf(264.9f, 148.1f, 1.0f, 0.64f), floatArrayOf(8.7f, 25.4f, 0.6f, 0.78f), floatArrayOf(97.9f, 191.7f, 1.0f, 0.31f), floatArrayOf(72.2f, 318.4f, 1.0f, 0.38f),
    floatArrayOf(147.1f, 324.4f, 0.6f, 0.78f), floatArrayOf(266.7f, 55.2f, 0.8f, 0.59f), floatArrayOf(105.1f, 137.7f, 1.2f, 0.59f), floatArrayOf(37.8f, 252.3f, 1.0f, 0.60f), floatArrayOf(87.5f, 340.1f, 0.8f, 0.25f), floatArrayOf(289.4f, 91.6f, 1.2f, 0.36f),
    floatArrayOf(306.9f, 14.2f, 0.8f, 0.39f), floatArrayOf(326.1f, 241.4f, 1.0f, 0.40f), floatArrayOf(322.9f, 35.9f, 1.0f, 0.55f), floatArrayOf(164.3f, 217.7f, 1.0f, 0.48f), floatArrayOf(247.3f, 122.0f, 1.2f, 0.22f), floatArrayOf(161.2f, 83.8f, 1.2f, 0.77f),
    floatArrayOf(343.2f, 414.5f, 1.2f, 0.54f), floatArrayOf(384.4f, 301.2f, 0.6f, 0.65f), floatArrayOf(326.3f, 278.5f, 1.0f, 0.53f), floatArrayOf(347.0f, 361.8f, 1.0f, 0.27f), floatArrayOf(95.4f, 14.8f, 0.8f, 0.74f), floatArrayOf(350.9f, 242.3f, 0.6f, 0.49f),
    floatArrayOf(47.1f, 211.3f, 0.8f, 0.60f), floatArrayOf(204.7f, 173.8f, 0.6f, 0.40f), floatArrayOf(98.5f, 361.9f, 1.2f, 0.69f), floatArrayOf(23.9f, 92.7f, 0.6f, 0.52f), floatArrayOf(318.6f, 71.9f, 1.0f, 0.75f), floatArrayOf(314.4f, 345.9f, 0.6f, 0.49f),
)


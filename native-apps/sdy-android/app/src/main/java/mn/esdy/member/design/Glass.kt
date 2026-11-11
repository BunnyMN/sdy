package mn.esdy.member.design

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import mn.esdy.member.core.Haptics

/** iOS .ultraThinMaterial over the silk: a frosted white veil. */
val GlassFill = Color.White.copy(alpha = 0.13f)

/**
 * Presses in with a spring and a light tap — the feel of every tappable
 * surface in the dark design (iOS PressableStyle).
 */
fun Modifier.pressable(
    scale: Float = 0.96f,
    enabled: Boolean = true,
    role: Role = Role.Button,
    onClick: () -> Unit,
): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val s by animateFloatAsState(if (pressed) scale else 1f, spring(dampingRatio = 0.62f, stiffness = 500f), label = "press")
    LaunchedEffect(pressed) { if (pressed) Haptics.tap() }
    this
        .graphicsLayer { scaleX = s; scaleY = s; alpha = if (pressed) 0.96f else 1f }
        .clickable(interactionSource = source, indication = null, enabled = enabled, role = role, onClick = onClick)
}

/** A square glass button with its label underneath, for a header's row of quick actions. */
@Composable
fun GlassTile(title: String, icon: ImageVector, modifier: Modifier = Modifier, badge: Int = 0, onClick: () -> Unit) {
    Column(
        modifier.pressable(0.9f, onClick = onClick).semantics(mergeDescendants = true) {
            contentDescription = if (badge > 0) "$title, $badge" else title
        },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box {
            Box(
                Modifier.size(66.dp)
                    .shadow(10.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black, spotColor = Color.Black.copy(alpha = 0.35f))
                    .background(GlassFill, RoundedCornerShape(22.dp))
                    .border(1.dp, Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.35f), Color.White.copy(alpha = 0.06f))), RoundedCornerShape(22.dp)),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, null, tint = Color.White, modifier = Modifier.size(26.dp)) }
            if (badge > 0) {
                Text(
                    "$badge", style = SdyType.caption2.copy(fontWeight = FontWeight.Bold), color = Color.White,
                    modifier = Modifier.align(Alignment.TopEnd).offset(6.dp, (-6).dp)
                        .background(Theme.brandRed, CircleShape).padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        ShrinkText(title, SdyType.subheadline.copy(fontWeight = FontWeight.Medium), Color.White, minScale = 0.8f)
    }
}

/** A round glass button for a header's corners (notifications, sign out). */
@Composable
fun GlassCircleButton(icon: ImageVector, label: String, modifier: Modifier = Modifier, dot: Boolean = false, onClick: () -> Unit) {
    Box(
        modifier.size(50.dp).pressable(0.88f, onClick = onClick)
            .background(GlassFill, CircleShape)
            .border(1.dp, Color.White.copy(alpha = 0.14f), CircleShape)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(20.dp))
        if (dot) Box(Modifier.align(Alignment.TopEnd).offset((-6).dp, 6.dp).size(11.dp).background(Theme.brandRed, CircleShape))
    }
}

/** A glass capsule on the silk ("Тэргүүлэгчид" under the points). */
@Composable
fun GlassCapsule(title: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Text(
        title,
        style = SdyType.subheadline.copy(fontWeight = FontWeight.SemiBold),
        color = Color.White,
        modifier = modifier.pressable(onClick = onClick)
            .background(GlassFill, CircleShape)
            .border(1.dp, Color.White.copy(alpha = 0.14f), CircleShape)
            .padding(horizontal = 22.dp, vertical = 10.dp),
    )
}

/** The section heading inside the dark sheet, with optional round actions. */
@Composable
fun SheetHeader(title: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = SdyType.title2, color = Color.White, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.weight(1f))
        trailing()
    }
}

/** A rounded card on the black sheet. */
@Composable
fun DarkCard(modifier: Modifier = Modifier, padding: Dp = 18.dp, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth()
            .background(Theme.card, RoundedCornerShape(24.dp))
            .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(24.dp))
            .padding(padding),
        content = content,
    )
}

/**
 * A row with a white rounded-square icon, the way account and settings rows
 * look in the dark design.
 */
@Composable
fun IconRow(
    title: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    tint: Color = Color.Black,
    tile: Color = Color.White,
    trailing: String? = null,
    chevron: Boolean = true,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier.fillMaxWidth()
            .then(if (onClick != null) Modifier.pressable(0.98f, onClick = onClick) else Modifier)
            .heightIn(min = Theme.minTap)
            .padding(vertical = 10.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(44.dp).background(tile, RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, style = SdyType.body.copy(fontWeight = FontWeight.SemiBold), color = Color.White)
            if (subtitle != null) Text(subtitle, style = SdyType.subheadline, color = Theme.secondaryText)
        }
        if (trailing != null) Text(trailing, style = SdyType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = Theme.secondaryText)
        if (chevron) Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = Theme.tertiaryText, modifier = Modifier.size(20.dp))
    }
}

/** Several IconRows in one card; put a RowDivider between them. */
@Composable
fun RowGroup(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth()
            .background(Theme.card, RoundedCornerShape(24.dp))
            .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(24.dp))
            .padding(horizontal = 16.dp, vertical = 4.dp),
        content = content,
    )
}

/** The inset hairline between rows of a RowGroup. */
@Composable
fun RowDivider() {
    Box(Modifier.fillMaxWidth().padding(start = 58.dp).height(1.dp).background(Color.White.copy(alpha = 0.08f)))
}

/**
 * Rises into place a moment after the screen appears, each item a little
 * after the one before it (iOS .rise(index)).
 */
fun Modifier.rise(index: Int): Modifier = composed {
    val reduceMotion = rememberReduceMotion()
    var shown by rememberSaveable { mutableStateOf(reduceMotion) }
    LaunchedEffect(Unit) {
        if (!shown) { delay(50L + index * 60L); shown = true }
    }
    val progress by animateFloatAsState(if (shown) 1f else 0f, spring(dampingRatio = 0.82f, stiffness = 130f), label = "rise")
    graphicsLayer { alpha = progress; translationY = (1 - progress) * 18 * density }
}

/** Placeholder cards while a sheet's first answer is on its way. */
@Composable
fun SkeletonCards(count: Int = 3, modifier: Modifier = Modifier) {
    Column(modifier.graphicsLayer { alpha = 0.8f }.clearAndSetSemantics { contentDescription = "Ачаалж байна" }, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        repeat(count) {
            Row(
                Modifier.fillMaxWidth().height(92.dp).background(Theme.card, RoundedCornerShape(24.dp)).padding(horizontal = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Box(Modifier.size(44.dp).background(Theme.cardRaised, RoundedCornerShape(13.dp)))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.width(160.dp).height(12.dp).background(Theme.cardRaised, CircleShape))
                    Box(Modifier.width(100.dp).height(10.dp).background(Theme.cardRaised, CircleShape))
                }
            }
        }
    }
}

/** The sign-in's main button: 56dp, 16dp corners, a red glow (iOS primaryNight). */
@Composable
fun PrimaryNightButton(
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    /** iOS dims only the buttons that ask for it (the custom button style does not). */
    dimWhenDisabled: Boolean = false,
    onClick: () -> Unit,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier.fillMaxWidth().heightIn(min = 56.dp)
            .graphicsLayer { alpha = if (enabled || !dimWhenDisabled) 1f else 0.45f }
            .pressable(enabled = enabled, onClick = onClick)
            .shadow(15.dp, RoundedCornerShape(16.dp), ambientColor = Night.glow, spotColor = Night.glow.copy(alpha = 0.45f))
            .background(Night.accent, RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.material3.LocalContentColor provides Color.White,
            androidx.compose.material3.LocalTextStyle provides SdyType.callout.copy(fontWeight = FontWeight.Bold, fontSize = 16.sp),
        ) { content() }
    }
}

/** The outlined one: 50dp (iOS secondaryNight). */
@Composable
fun SecondaryNightButton(modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit, content: @Composable RowScope.() -> Unit) {
    Row(
        modifier.fillMaxWidth().heightIn(min = 50.dp)
            .pressable(enabled = enabled, onClick = onClick)
            .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(16.dp))
            .border(1.dp, Night.line.copy(alpha = 0.22f), RoundedCornerShape(16.dp)),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.material3.LocalContentColor provides Night.silver,
            androidx.compose.material3.LocalTextStyle provides SdyType.subheadline.copy(fontWeight = FontWeight.SemiBold),
        ) { content() }
    }
}


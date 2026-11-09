package mn.esdy.member.features.profile

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.CreditCard
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.QrCode
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlin.math.absoluteValue
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalNav
import mn.esdy.member.core.Haptics
import mn.esdy.member.design.AppTheme
import mn.esdy.member.design.GlassFill
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SilkBackground
import mn.esdy.member.design.Theme
import mn.esdy.member.design.ThemeStore
import mn.esdy.member.design.TopBar
import mn.esdy.member.design.pressable
import mn.esdy.member.design.white

/**
 * Профайл → Өнгө төрх: swipe through the themes, each shown as a small
 * phone screen; the whole page takes on the one in front, and Хадгалах keeps it.
 */
@Composable
fun ThemePickerScreen() {
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val chosen by ThemeStore.chosen
    val themes = AppTheme.entries
    val pager = rememberPagerState(initialPage = themes.indexOf(chosen)) { themes.size }
    val shown = themes[pager.currentPage]

    LaunchedEffect(pager) { snapshotFlow { pager.currentPage }.drop(1).collect { Haptics.tap() } }

    Box(Modifier.fillMaxSize().background(Theme.canvas)) {
        Crossfade(shown, animationSpec = tween(450), label = "bg") { theme ->
            SilkBackground(Modifier.fillMaxSize().graphicsLayer { scaleX = 1.2f; scaleY = 1.2f }.blur(30.dp), forcedTheme = theme)
        }
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)))

        Column(Modifier.fillMaxSize()) {
            TopBar(title = "Өнгө төрх")
            HorizontalPager(
                state = pager,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 64.dp),
                pageSpacing = 14.dp,
                verticalAlignment = Alignment.CenterVertically,
            ) { page ->
                val theme = themes[page]
                val offset = ((pager.currentPage - page) + pager.currentPageOffsetFraction).absoluteValue.coerceIn(0f, 1f)
                ThemePreviewPhone(
                    theme,
                    Modifier
                        .graphicsLayer {
                            val s = 1f - 0.14f * offset
                            scaleX = s; scaleY = s
                            alpha = 1f - 0.45f * offset
                        }
                        .pressable(0.98f) { scope.launch { pager.animateScrollToPage(page) } }
                        .semantics { contentDescription = "${theme.title}. ${theme.subtitle}"; role = Role.Button },
                )
            }

            AnimatedContent(shown, transitionSpec = { fadeIn(tween(300)) togetherWith fadeOut(tween(300)) }, label = "title", modifier = Modifier.fillMaxWidth()) { theme ->
                Column(Modifier.fillMaxWidth().padding(bottom = 22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(theme.title, style = SdyType.title3.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Color.White)
                    Text(theme.subtitle, style = SdyType.subheadline, color = Color.White.copy(alpha = 0.7f))
                }
            }

            Box(
                Modifier.padding(horizontal = 20.dp).padding(bottom = 16.dp).navigationBarsPadding()
                    .fillMaxWidth().heightIn(min = 56.dp)
                    .pressable {
                        ThemeStore.choose(shown)
                        Haptics.success()
                        nav.pop()
                    }
                    .background(shown.accent, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(if (shown == chosen) "Сонгогдсон" else "Хадгалах", style = SdyType.headline, color = Color.White)
            }
        }
    }
}

/**
 * A theme drawn as a small phone screen: the header on its background with
 * placeholder text, glass actions, and the black sheet with two rows.
 */
@Composable
private fun ThemePreviewPhone(theme: AppTheme, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(30.dp)
    Column(
        modifier.padding(vertical = 20.dp).fillMaxWidth().wrapContentHeight()
            .shadow(20.dp, shape, ambientColor = Color.Black, spotColor = Color.Black.copy(alpha = 0.5f))
            .clip(shape)
            .background(Theme.canvas)
            .border(1.dp, Color.White.copy(alpha = 0.15f), shape),
    ) {
        Box(Modifier.fillMaxWidth().height(300.dp)) {
            SilkBackground(Modifier.fillMaxSize(), forcedTheme = theme)
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Spacer(Modifier.weight(1f))
                Box(Modifier.width(120.dp).height(14.dp).background(Color.White.copy(alpha = 0.28f), CircleShape))
                Box(Modifier.width(170.dp).height(22.dp).background(Color.White.copy(alpha = 0.28f), CircleShape))
                Box(Modifier.padding(top = 10.dp).width(80.dp).height(22.dp).background(Color.White.copy(alpha = 0.22f), CircleShape))
                Spacer(Modifier.weight(1f))
                Row(Modifier.padding(bottom = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    listOf(Icons.Rounded.MoreHoriz, Icons.Rounded.CalendarMonth, Icons.Rounded.QrCode, Icons.Rounded.Payments).forEachIndexed { i, icon ->
                        Box(
                            Modifier.size(44.dp).background(if (i == 3) Color.White else GlassFill, RoundedCornerShape(14.dp)),
                            contentAlignment = Alignment.Center,
                        ) { Icon(icon, null, tint = if (i == 3) theme.accent else Color.White, modifier = Modifier.size(18.dp)) }
                    }
                }
            }
        }
        Column(
            Modifier.offset(y = (-18).dp).fillMaxWidth()
                .background(Theme.canvas, RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            repeat(2) {
                Row(
                    Modifier.fillMaxWidth().background(Theme.card, RoundedCornerShape(16.dp)).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.size(36.dp).background(theme.accent, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.CreditCard, null, tint = Color.White, modifier = Modifier.size(14.dp))
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Box(Modifier.fillMaxWidth().height(9.dp).background(white(0.24f), CircleShape))
                        Box(Modifier.width(90.dp).height(9.dp).background(white(0.20f), CircleShape))
                    }
                }
            }
        }
    }
}

package mn.esdy.member.features.events

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mn.esdy.member.design.OfflineBanner
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SilkListBackground
import mn.esdy.member.design.Theme
import mn.esdy.member.design.TopBar

/**
 * A grouped list under an inline title (iOS List + .navigationBarTitleDisplayMode(.inline)),
 * optionally with the silk glowing behind it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun InlineListScreen(
    title: String,
    silk: Boolean = true,
    onRefresh: (suspend () -> Unit)? = null,
    onBack: (() -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    val state = rememberLazyListState()
    Box(Modifier.fillMaxSize().background(Theme.canvas)) {
        if (silk) {
            val scrolled = if (state.firstVisibleItemIndex > 0) 2000f else state.firstVisibleItemScrollOffset.toFloat()
            SilkListBackground(300.dp, scrolled)
        }
        Column(Modifier.fillMaxSize()) {
            TopBar(title = title, showTitle = true, onBack = onBack)
            OfflineBanner()
            val list = @Composable {
                LazyColumn(
                    Modifier.fillMaxSize(), state = state,
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp + mn.esdy.member.design.LocalBottomInset.current),
                    content = content,
                )
            }
            if (onRefresh != null) {
                val scope = rememberCoroutineScope()
                var refreshing by remember { mutableStateOf(false) }
                PullToRefreshBox(refreshing, onRefresh = { scope.launch { refreshing = true; try { onRefresh() } finally { refreshing = false } } }) { list() }
            } else list()
        }
    }
}

/** An icon with text (iOS Label). */
@Composable
internal fun IconLabel(
    text: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    color: Color = Color.White,
    iconColor: Color = color,
    style: TextStyle = SdyType.body,
    iconSize: Dp = 18.dp,
) {
    Row(modifier.semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, null, tint = iconColor, modifier = Modifier.padding(top = 1.dp).size(iconSize))
        Text(text, style = style, color = color)
    }
}

/** A section header with an icon (iOS Label in a Section header). */
@Composable
internal fun IconHeader(text: String, icon: ImageVector) {
    IconLabel(text, icon, color = Theme.systemSecondary, style = SdyType.headline, iconSize = 19.dp)
}

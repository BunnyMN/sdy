package mn.esdy.member.features.profile

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mn.esdy.member.design.OfflineBanner
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.Theme
import mn.esdy.member.design.TopBar

/**
 * A pushed list or form with a small title in the bar (iOS List/Form with
 * .navigationBarTitleDisplayMode(.inline) and .offlineBanner()).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun InlineListScreen(
    title: String,
    onRefresh: (suspend () -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize().background(Theme.canvas)) {
        TopBar(title = title, showTitle = true)
        OfflineBanner()
        val list = @Composable {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp + mn.esdy.member.design.LocalBottomInset.current),
                verticalArrangement = Arrangement.spacedBy(0.dp),
                content = content,
            )
        }
        if (onRefresh != null) {
            val scope = rememberCoroutineScope()
            var refreshing by remember { mutableStateOf(false) }
            PullToRefreshBox(refreshing, onRefresh = { scope.launch { refreshing = true; try { onRefresh() } finally { refreshing = false } } }) { list() }
        } else {
            Box(Modifier.fillMaxSize()) { list() }
        }
    }
}

/** A grey line inside a section (iOS `.foregroundStyle(.secondary)` text row). */
@Composable
internal fun SecondaryLine(text: String) {
    Text(text, style = SdyType.body, color = Theme.secondaryText, modifier = Modifier.padding(vertical = 11.dp))
}

internal fun openURL(context: Context, url: String) {
    try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
}

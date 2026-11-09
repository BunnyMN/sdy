package mn.esdy.member.design

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Material's colours set to the dark design, for the few Material widgets used. */
@Composable
fun SdyMaterialTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Theme.accent,
            onPrimary = Color.White,
            secondary = Theme.accent,
            background = Theme.canvas,
            onBackground = Color.White,
            surface = Theme.canvas,
            onSurface = Color.White,
            surfaceVariant = Theme.card,
            onSurfaceVariant = Theme.secondaryText,
            surfaceContainer = Theme.card,
            surfaceContainerHigh = Theme.cardRaised,
            surfaceContainerLow = Theme.card,
            error = Theme.danger,
            outline = Theme.separator,
        ),
        content = content,
    )
}

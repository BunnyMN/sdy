package mn.esdy.member.design

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
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
        typography = Typography().let { t ->
            Typography(
                displayLarge = t.displayLarge.copy(fontFamily = Inter), displayMedium = t.displayMedium.copy(fontFamily = Inter), displaySmall = t.displaySmall.copy(fontFamily = Inter),
                headlineLarge = t.headlineLarge.copy(fontFamily = Inter), headlineMedium = t.headlineMedium.copy(fontFamily = Inter), headlineSmall = t.headlineSmall.copy(fontFamily = Inter),
                titleLarge = t.titleLarge.copy(fontFamily = Inter), titleMedium = t.titleMedium.copy(fontFamily = Inter), titleSmall = t.titleSmall.copy(fontFamily = Inter),
                // Text with no style takes bodyLarge: iOS body, 17.
                bodyLarge = SdyType.body, bodyMedium = t.bodyMedium.copy(fontFamily = Inter), bodySmall = t.bodySmall.copy(fontFamily = Inter),
                labelLarge = t.labelLarge.copy(fontFamily = Inter), labelMedium = t.labelMedium.copy(fontFamily = Inter), labelSmall = t.labelSmall.copy(fontFamily = Inter),
            )
        },
        content = content,
    )
}

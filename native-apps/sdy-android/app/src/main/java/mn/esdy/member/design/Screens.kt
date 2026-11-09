package mn.esdy.member.design

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBackIos
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalIsPushed
import mn.esdy.member.app.LocalNav

// The building blocks of every list, form and sheet — the Android
// counterparts of SwiftUI's NavigationStack + List(.insetGrouped) + Form +
// .sheet / .fullScreenCover / .alert / .confirmationDialog, in the dark
// design.

// region Screens

/**
 * A list screen: the silk glowing behind a large title that shrinks into
 * the top bar as the list scrolls (iOS: List + .navigationTitle +
 * .silkListBackground() + .offlineBanner()). A back button shows by itself
 * on a pushed screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SdyListScreen(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    silk: Boolean = true,
    silkHeight: Dp = 300.dp,
    onRefresh: (suspend () -> Unit)? = null,
    state: LazyListState = rememberLazyListState(),
    actions: @Composable RowScope.() -> Unit = {},
    contentPadding: PaddingValues = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp),
    content: LazyListScope.() -> Unit,
) {
    val collapsed by remember { derivedStateOf { state.firstVisibleItemIndex > 0 || state.firstVisibleItemScrollOffset > 90 } }
    val scrolled by remember { derivedStateOf { if (state.firstVisibleItemIndex > 0) 2000f else state.firstVisibleItemScrollOffset.toFloat() } }
    Box(modifier.fillMaxSize().background(Theme.canvas)) {
        if (silk) SilkListBackground(silkHeight, scrolled)
        Column(Modifier.fillMaxSize()) {
            TopBar(title = title, showTitle = collapsed, actions = actions)
            OfflineBanner()
            val list = @Composable {
                LazyColumn(Modifier.fillMaxSize(), state = state, contentPadding = contentPadding, verticalArrangement = Arrangement.spacedBy(0.dp)) {
                    item("sdy-large-title") {
                        Column(Modifier.fillMaxWidth().padding(start = 4.dp, top = 2.dp, bottom = 14.dp)) {
                            Text(title, style = SdyType.largeTitle, color = Color.White, modifier = Modifier.semantics { heading() })
                            if (subtitle != null) Text(subtitle, style = SdyType.subheadline, color = Color.White.copy(alpha = 0.7f))
                        }
                    }
                    content()
                }
            }
            if (onRefresh != null) {
                val scope = rememberCoroutineScope()
                var refreshing by remember { mutableStateOf(false) }
                PullToRefreshBox(refreshing, onRefresh = { scope.launch { refreshing = true; try { onRefresh() } finally { refreshing = false } } }) { list() }
            } else {
                list()
            }
        }
    }
}

/**
 * The bar at the top of a list screen: back (on a pushed screen), the title
 * once the large one has scrolled away, and actions on the right.
 */
@Composable
fun TopBar(title: String, showTitle: Boolean = true, onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    val pushed = LocalIsPushed.current
    val nav = LocalNav.current
    val back = onBack ?: if (pushed) ({ nav.pop() }) else null
    val alpha by animateFloatAsState(if (showTitle) 1f else 0f, label = "title")
    Box(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.35f * alpha)).statusBarsPadding().height(48.dp)) {
        Row(Modifier.align(Alignment.CenterStart).padding(start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (back != null) {
                Box(
                    Modifier.size(Theme.minTap).pressable(0.9f, onClick = back).semantics { contentDescription = "Буцах" },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.AutoMirrored.Rounded.ArrowBackIos, null, tint = Theme.accent, modifier = Modifier.size(20.dp).padding(start = 4.dp)) }
            }
        }
        Text(
            title, style = SdyType.headline, color = Color.White, maxLines = 1, textAlign = TextAlign.Center,
            modifier = Modifier.align(Alignment.Center).padding(horizontal = 96.dp).graphicsLayer { this.alpha = alpha },
        )
        Row(Modifier.align(Alignment.CenterEnd).padding(end = 8.dp), verticalAlignment = Alignment.CenterVertically, content = actions)
    }
}

/** A tappable icon for a top bar (iOS toolbar button). */
@Composable
fun BarIconButton(icon: ImageVector, label: String, enabled: Boolean = true, tint: Color = Theme.accent, onClick: () -> Unit) {
    Box(
        Modifier.size(Theme.minTap).pressable(0.9f, enabled = enabled, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = if (enabled) tint else Theme.tertiaryText, modifier = Modifier.size(22.dp)) }
}

/** A tappable word for a top bar (iOS toolbar text button). */
@Composable
fun BarTextButton(text: String, enabled: Boolean = true, bold: Boolean = false, color: Color = Theme.accent, onClick: () -> Unit) {
    Text(
        text,
        style = SdyType.body.copy(fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal),
        color = if (enabled) color else Theme.tertiaryText,
        modifier = Modifier.heightIn(min = Theme.minTap).pressable(0.95f, enabled = enabled, onClick = onClick).padding(horizontal = 8.dp, vertical = 11.dp),
    )
}

// endregion

// region Lists

/**
 * A group of rows on a rounded cell, with an optional header above and
 * footer below (iOS List Section in .insetGrouped). Put ListDivider()
 * between rows.
 */
@Composable
fun ListSection(
    modifier: Modifier = Modifier,
    header: String? = null,
    footer: String? = null,
    headerContent: (@Composable () -> Unit)? = null,
    footerContent: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth().padding(bottom = 24.dp)) {
        if (header != null || headerContent != null) {
            Box(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 7.dp)) {
                if (headerContent != null) headerContent()
                else Text(header!!, style = SdyType.footnote, color = Theme.secondaryText, modifier = Modifier.semantics { heading() })
            }
        }
        Column(
            Modifier.fillMaxWidth().background(Theme.groupedCell, RoundedCornerShape(12.dp)).padding(horizontal = 16.dp),
            content = content,
        )
        if (footer != null || footerContent != null) {
            Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 7.dp)) {
                if (footerContent != null) footerContent()
                else Text(footer!!, style = SdyType.footnote, color = Theme.secondaryText)
            }
        }
    }
}

/** One row of a ListSection: at least 44dp tall, tappable when given onClick. */
@Composable
fun ListRow(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    enabled: Boolean = true,
    verticalPadding: Dp = 11.dp,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier.fillMaxWidth()
            .then(if (onClick != null) Modifier.pressable(0.985f, enabled = enabled, onClick = onClick) else Modifier)
            .heightIn(min = Theme.minTap)
            .padding(vertical = verticalPadding)
            .graphicsLayer { alpha = if (enabled) 1f else 0.45f },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

/** A label on the left and a value on the right (iOS LabeledContent). */
@Composable
fun LabeledRow(label: String, value: String, modifier: Modifier = Modifier, valueColor: Color = Theme.secondaryText) {
    ListRow(modifier.semantics(mergeDescendants = true) {}) {
        Text(label, style = SdyType.body, color = Color.White, modifier = Modifier.weight(1f))
        Text(value, style = SdyType.body, color = valueColor, textAlign = TextAlign.End)
    }
}

/** The hairline between rows of a ListSection. */
@Composable
fun ListDivider(inset: Dp = 0.dp) {
    Box(Modifier.fillMaxWidth().padding(start = inset).height(0.5.dp).background(Theme.separator))
}

/** A switch row (iOS Toggle in a Form). */
@Composable
fun ToggleRow(title: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit, subtitle: String? = null, enabled: Boolean = true) {
    ListRow(onClick = { onCheckedChange(!checked) }, enabled = enabled) {
        Column(Modifier.weight(1f)) {
            Text(title, style = SdyType.body, color = Color.White)
            if (subtitle != null) Text(subtitle, style = SdyType.footnote, color = Theme.secondaryText)
        }
        Switch(
            checked = checked, onCheckedChange = onCheckedChange, enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = Theme.success, checkedThumbColor = Color.White, uncheckedTrackColor = Theme.fill, uncheckedBorderColor = Color.Transparent, uncheckedThumbColor = Color.White),
        )
    }
}

/**
 * A plain text field for a Form row: no outline, a grey placeholder
 * (iOS TextField / SecureField / TextField(axis: .vertical)).
 */
@Composable
fun FormTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.Sentences,
    autoCorrect: Boolean = true,
    secure: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else 8,
    imeAction: ImeAction = ImeAction.Default,
    onSubmit: (() -> Unit)? = null,
    enabled: Boolean = true,
    textStyle: androidx.compose.ui.text.TextStyle = SdyType.body,
) {
    // Held as a TextFieldValue so a caller that rewrites the text (digits
    // only, a length cap) is shown exactly, without the keyboard's
    // composition putting the old text back.
    var field by remember { mutableStateOf(TextFieldValue(value, TextRange(value.length))) }
    if (field.text != value) field = TextFieldValue(value, TextRange(value.length))
    BasicTextField(
        value = field,
        onValueChange = { v -> field = v; if (v.text != value) onValueChange(v.text) },
        modifier = modifier.fillMaxWidth().heightIn(min = Theme.minTap).padding(vertical = 11.dp)
            .semantics { contentDescription = placeholder },
        enabled = enabled,
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        textStyle = textStyle.copy(color = Color.White),
        cursorBrush = SolidColor(Theme.accent),
        visualTransformation = if (secure) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(capitalization = capitalization, autoCorrectEnabled = autoCorrect, keyboardType = keyboardType, imeAction = imeAction),
        keyboardActions = KeyboardActions(onAny = { onSubmit?.invoke() }),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) Text(placeholder, style = textStyle, color = Theme.tertiaryText)
                inner()
            }
        },
    )
}

/** A pick-one row: the label and the chosen option, opening a menu (iOS Picker in a Form). */
@Composable
fun <T> PickerRow(label: String, options: List<T>, selected: T, title: (T) -> String, onSelect: (T) -> Unit, enabled: Boolean = true) {
    var open by remember { mutableStateOf(false) }
    Box {
        ListRow(onClick = { open = true }, enabled = enabled) {
            Text(label, style = SdyType.body, color = Color.White, modifier = Modifier.weight(1f))
            Text(title(selected), style = SdyType.body, color = Theme.secondaryText)
            Icon(androidx.compose.material.icons.Icons.Rounded.UnfoldMore, null, tint = Theme.secondaryText, modifier = Modifier.size(16.dp))
        }
        androidx.compose.material3.DropdownMenu(open, onDismissRequest = { open = false }, containerColor = Theme.cardRaised) {
            options.forEach { option ->
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(title(option), color = Color.White) },
                    onClick = { open = false; onSelect(option) },
                    trailingIcon = if (option == selected) ({ Icon(androidx.compose.material.icons.Icons.Rounded.Check, null, tint = Theme.accent) }) else null,
                )
            }
        }
    }
}

/** iOS segmented Picker: a row of equal segments, one selected. */
@Composable
fun <T> SegmentedControl(options: List<T>, selected: T, title: (T) -> String, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().height(34.dp).background(Theme.fill, RoundedCornerShape(9.dp)).padding(2.dp)) {
        options.forEach { option ->
            val on = option == selected
            Box(
                Modifier.weight(1f).fillMaxSize()
                    .background(if (on) Color(0xFF636366) else Color.Transparent, RoundedCornerShape(7.dp))
                    .pressable(0.97f, role = Role.Tab) { onSelect(option) },
                contentAlignment = Alignment.Center,
            ) {
                Text(title(option), style = SdyType.footnote.copy(fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium), color = Color.White, maxLines = 1)
            }
        }
    }
}

// endregion

// region Buttons

/** iOS .borderedProminent: a filled accent capsule. */
@Composable
fun PrimaryButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    color: Color = Theme.brandRed,
    icon: ImageVector? = null,
    fillWidth: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        modifier.then(if (fillWidth) Modifier.fillMaxWidth() else Modifier)
            .heightIn(min = 50.dp)
            .graphicsLayer { alpha = if (enabled) 1f else 0.45f }
            .pressable(enabled = enabled && !busy, onClick = onClick)
            .background(color, RoundedCornerShape(14.dp))
            .padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
        else {
            if (icon != null) Icon(icon, null, tint = Color.White, modifier = Modifier.size(20.dp))
            Text(text, style = SdyType.headline, color = Color.White)
        }
    }
}

/** iOS .bordered: a tinted grey capsule. */
@Composable
fun SecondaryButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    color: Color = Theme.accent,
    icon: ImageVector? = null,
    fillWidth: Boolean = false,
    onClick: () -> Unit,
) {
    Row(
        modifier.then(if (fillWidth) Modifier.fillMaxWidth() else Modifier)
            .heightIn(min = 50.dp)
            .graphicsLayer { alpha = if (enabled) 1f else 0.45f }
            .pressable(enabled = enabled && !busy, onClick = onClick)
            .background(color.copy(alpha = 0.16f), RoundedCornerShape(14.dp))
            .padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = color, strokeWidth = 2.dp)
        else {
            if (icon != null) Icon(icon, null, tint = color, modifier = Modifier.size(20.dp))
            Text(text, style = SdyType.headline, color = color)
        }
    }
}

/** A full-width text button inside a list row (iOS Button in a List). */
@Composable
fun RowButton(text: String, modifier: Modifier = Modifier, color: Color = Theme.accent, enabled: Boolean = true, busy: Boolean = false, icon: ImageVector? = null, center: Boolean = false, onClick: () -> Unit) {
    ListRow(modifier, onClick = onClick, enabled = enabled && !busy) {
        if (center) Spacer(Modifier.weight(1f))
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), color = color, strokeWidth = 2.dp)
        else if (icon != null) Icon(icon, null, tint = color, modifier = Modifier.size(20.dp))
        Text(text, style = SdyType.body.copy(fontWeight = if (center) FontWeight.SemiBold else FontWeight.Normal), color = color)
        Spacer(Modifier.weight(1f))
    }
}

// endregion

// region Sheets and dialogs

/**
 * A sheet from the bottom, full height (iOS .sheet with .large detent).
 * The content draws its own top bar (FormSheet does).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SdySheet(
    onDismiss: () -> Unit,
    dismissible: Boolean = true,
    containerColor: Color = Theme.sheetBackground,
    content: @Composable ColumnScope.() -> Unit,
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { dismissible || it != androidx.compose.material3.SheetValue.Hidden })
    ModalBottomSheet(
        onDismissRequest = { if (dismissible) onDismiss() },
        sheetState = state,
        containerColor = containerColor,
        contentColor = Color.White,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        dragHandle = { Box(Modifier.padding(top = 6.dp).width(36.dp).height(5.dp).background(Color.White.copy(alpha = 0.3f), CircleShape)) },
    ) {
        Column(Modifier.fillMaxWidth().imePadding(), content = content)
    }
}

/**
 * A form in a sheet: «Болих» on the left, the title, an optional confirm on
 * the right, and grouped sections below (iOS NavigationStack { Form } in a
 * .sheet with a cancellation / confirmation toolbar).
 */
@Composable
fun FormSheet(
    title: String,
    onDismiss: () -> Unit,
    confirmTitle: String? = null,
    confirmEnabled: Boolean = true,
    confirmDestructive: Boolean = false,
    busy: Boolean = false,
    cancelTitle: String = "Болих",
    dismissible: Boolean = true,
    onConfirm: () -> Unit = {},
    content: LazyListScope.() -> Unit,
) {
    SdySheet(onDismiss = onDismiss, dismissible = dismissible && !busy) {
        Box(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 8.dp)) {
            Box(Modifier.align(Alignment.CenterStart)) { BarTextButton(cancelTitle, enabled = !busy, onClick = onDismiss) }
            Text(title, style = SdyType.headline, color = Color.White, maxLines = 1, modifier = Modifier.align(Alignment.Center).padding(horizontal = 88.dp))
            if (confirmTitle != null) {
                Box(Modifier.align(Alignment.CenterEnd)) {
                    if (busy) CircularProgressIndicator(Modifier.padding(12.dp).size(20.dp), color = Theme.accent, strokeWidth = 2.dp)
                    else BarTextButton(confirmTitle, enabled = confirmEnabled, bold = true, color = if (confirmDestructive) Theme.danger else Theme.accent, onClick = onConfirm)
                }
            }
        }
        LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp)) {
            content()
        }
        Spacer(Modifier.navigationBarsPadding())
    }
}

/** A screen over everything, closed by its own button (iOS .fullScreenCover). */
@Composable
fun SdyFullScreen(onDismiss: () -> Unit, content: @Composable () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        // Not a pushed screen: a TopBar inside closes nothing on the tab's stack.
        CompositionLocalProvider(LocalIsPushed provides false) {
            Box(Modifier.fillMaxSize().background(Theme.canvas)) { content() }
        }
    }
}

/** A question with a confirm and a cancel (iOS .alert). */
@Composable
fun SdyAlert(
    title: String,
    message: String? = null,
    confirmTitle: String = "OK",
    destructive: Boolean = false,
    dismissTitle: String? = "Болих",
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Theme.cardRaised,
        titleContentColor = Color.White,
        textContentColor = Theme.secondaryText,
        title = { Text(title, style = SdyType.headline) },
        text = message?.let { { Text(it, style = SdyType.subheadline) } },
        confirmButton = {
            TextButton(onClick = { onDismiss(); onConfirm() }) {
                Text(confirmTitle, color = if (destructive) Theme.danger else Theme.accent, style = SdyType.body.copy(fontWeight = FontWeight.SemiBold))
            }
        },
        dismissButton = dismissTitle?.let { { TextButton(onClick = onDismiss) { Text(it, color = Theme.accent, style = SdyType.body) } } },
    )
}

/** One choice of an action sheet. */
data class SheetAction(val title: String, val destructive: Boolean = false, val icon: ImageVector? = null, val action: () -> Unit)

/** A list of choices from the bottom, with Болих (iOS .confirmationDialog). */
@Composable
fun ActionSheet(title: String?, actions: List<SheetAction>, onDismiss: () -> Unit, message: String? = null) {
    SdySheet(onDismiss = onDismiss, containerColor = Theme.cardRaised) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (title != null || message != null) {
                Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (title != null) Text(title, style = SdyType.footnote.copy(fontWeight = FontWeight.SemiBold), color = Theme.secondaryText, textAlign = TextAlign.Center)
                    if (message != null) Text(message, style = SdyType.footnote, color = Theme.secondaryText, textAlign = TextAlign.Center)
                }
            }
            Column(Modifier.fillMaxWidth().background(Theme.card, RoundedCornerShape(14.dp))) {
                actions.forEachIndexed { i, a ->
                    if (i > 0) ListDivider()
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp).pressable(0.98f) { onDismiss(); a.action() }.padding(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (a.icon != null) Icon(a.icon, null, tint = if (a.destructive) Theme.danger else Theme.accent, modifier = Modifier.size(20.dp))
                        Text(a.title, style = SdyType.body, color = if (a.destructive) Theme.danger else Theme.accent)
                    }
                }
            }
            Box(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).background(Theme.card, RoundedCornerShape(14.dp)).pressable(0.98f, onClick = onDismiss),
                contentAlignment = Alignment.Center,
            ) { Text("Болих", style = SdyType.body.copy(fontWeight = FontWeight.SemiBold), color = Theme.accent) }
        }
    }
}

// endregion

/** Content colour and text style for a block (iOS .foregroundStyle / .font on a container). */
@Composable
fun Styled(color: Color, style: androidx.compose.ui.text.TextStyle, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalContentColor provides color, LocalTextStyle provides style, content = content)
}


package mn.esdy.member.features.login

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SendToMobile
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import mn.esdy.member.R
import mn.esdy.member.core.AppConfig
import mn.esdy.member.core.Formatters
import mn.esdy.member.design.Night
import mn.esdy.member.design.PrimaryNightButton
import mn.esdy.member.design.SdySheet
import mn.esdy.member.design.Theme
import mn.esdy.member.design.pressable
import mn.esdy.member.models.EIDStart

private val SheetColor = Color(0xFF141012)
private val Alert = Color(0xFFFDA29B)
private val Ok = Color(0xFF4CD29A)

/**
 * eID Mongolia's sign-in dialog (iOS EIDLoginSheet): it opens already under
 * way — the session is started and handed to the eID app on this phone — and
 * shows the code to match, a draining timer and the steps. No eID app here:
 * the registration number instead, and the request goes to the eID app
 * wherever it is.
 */
@Composable
fun EIDLoginSheet(model: EIDLoginModel, onClose: () -> Unit) {
    val success = model.phase == EIDLoginModel.Phase.Success
    SdySheet(onDismiss = onClose, dismissible = !success, containerColor = SheetColor, fullHeight = true) {
        Head(onClose, closeEnabled = !success)
        Box(Modifier.fillMaxWidth().height(1.dp).background(Night.line.copy(alpha = 0.12f)))
        Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(20.dp)) {
            Content(model)
        }
        Foot(model)
    }
}

@Composable
private fun Head(onClose: () -> Unit, closeEnabled: Boolean) {
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 14.dp, top = 12.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.background(Color.White, CircleShape).padding(horizontal = 14.dp, vertical = 12.dp)) {
            Image(painterResource(R.drawable.eid_wordmark), "e-ID", colorFilter = ColorFilter.tint(Color(0xFF0F2A3D)), modifier = Modifier.height(16.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Нэвтрэх", fontSize = 18.sp, fontWeight = FontWeight.Black, color = Color.White)
            Text(AppConfig.host, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace, color = Night.muted)
        }
        Box(
            Modifier.size(Theme.minTap).pressable(0.9f, enabled = closeEnabled, onClick = onClose).semantics { contentDescription = "Хаах" },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                Modifier.size(38.dp).background(Color.White.copy(alpha = 0.06f), CircleShape).border(1.dp, Night.line.copy(alpha = 0.18f), CircleShape),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Rounded.Close, null, tint = Color.White, modifier = Modifier.size(16.dp)) }
        }
    }
}

@Composable
private fun Content(model: EIDLoginModel) {
    when (val phase = model.phase) {
        EIDLoginModel.Phase.Starting -> Row(
            Modifier.fillMaxWidth().padding(vertical = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
            Text("Хүсэлт үүсгэж байна…", fontSize = 17.sp, color = Night.muted)
        }
        is EIDLoginModel.Phase.Waiting -> Waiting(model, phase.started)
        EIDLoginModel.Phase.Success -> Column(
            Modifier.fillMaxWidth().padding(top = 32.dp, bottom = 12.dp).semantics(mergeDescendants = true) {},
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(Modifier.padding(bottom = 4.dp).background(Color(0xFF173A2F).copy(alpha = 0.5f), CircleShape).padding(10.dp)) {
                Box(Modifier.size(72.dp).background(Color(0xFF173A2F), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.Check, null, tint = Ok, modifier = Modifier.size(34.dp))
                }
            }
            Text("Амжилттай нэвтэрлээ", fontSize = 18.sp, fontWeight = FontWeight.Black, color = Color.White)
            Text("Түр хүлээнэ үү…", fontSize = 13.5.sp, color = Night.muted)
        }
        EIDLoginModel.Phase.Expired, EIDLoginModel.Phase.Refused, is EIDLoginModel.Phase.Failed -> Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            AlertBox(
                when (phase) {
                    EIDLoginModel.Phase.Expired -> "eID хүсэлтийн хугацаа дууслаа. Дахин эхлүүлнэ үү."
                    EIDLoginModel.Phase.Refused -> "Та eID Mongolia апп дээр хүсэлтээс татгалзсан байна."
                    is EIDLoginModel.Phase.Failed -> phase.message
                    else -> ""
                },
            )
            PrimaryNightButton(enabled = model.canStart, onClick = {
                if (model.method == EIDLoginModel.Method.RegisterNumber) model.start() else model.startHere()
            }) {
                Icon(Icons.Rounded.Refresh, null, modifier = Modifier.size(20.dp))
                Text("Дахин оролдох")
            }
        }
        EIDLoginModel.Phase.Idle -> if (model.method == EIDLoginModel.Method.RegisterNumber) {
            Registration(model)
        } else {
            // Only between a cancel and the next start.
            PrimaryNightButton(onClick = { model.startHere() }) {
                Icon(Icons.Rounded.PhoneAndroid, null, modifier = Modifier.size(20.dp))
                Text("eID Mongolia апп-аар нээх")
            }
        }
    }
}

@Composable
private fun Waiting(model: EIDLoginModel, started: EIDStart) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (model.method == EIDLoginModel.Method.SamePhone) {
            PrimaryNightButton(enabled = started.appLink != null, onClick = { EIDLoginModel.openApp(context, started) }) {
                Icon(Icons.Rounded.PhoneAndroid, null, modifier = Modifier.size(20.dp))
                Text("eID Mongolia апп-аар нээх")
            }
            Steps(
                listOf(
                    "eID Mongolia апп-аа нээгээд хүсэлтийг зөвшөөрнө үү.",
                    "Код ижил эсэхийг шалгана.",
                    "PIN1 оруулж «Зөвшөөрөх» дарна. Дараа нь энд буцаж ирнэ.",
                ),
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(40.dp).background(Night.glow.copy(alpha = 0.18f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.SendToMobile, null, tint = Night.rose, modifier = Modifier.size(22.dp))
                }
                Text("Апп руу хүсэлт илгээлээ", fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color.White)
            }
            Text(
                "Утсан дээрх eID Mongolia аппад ирсэн хүсэлтийг нээж, код таарч байгааг шалгаад PIN1-ээ оруулна уу.",
                fontSize = 13.5.sp, color = Night.muted, lineHeight = 20.sp,
            )
        }
        if (started.verificationCode.isNotEmpty()) Code(started.verificationCode)
        Timer(model)
    }
}

/** «Хүчинтэй 2:58» over a bar that drains, amber for the last half minute. */
@Composable
private fun Timer(model: EIDLoginModel) {
    val left = model.secondsLeft
    if (left != null) {
        val low = left <= 30
        val fraction by animateFloatAsState((left.toFloat() / model.totalSeconds).coerceIn(0f, 1f), tween(1000, easing = androidx.compose.animation.core.LinearEasing), label = "timer")
        Column(Modifier.clearAndSetSemantics { contentDescription = "Хүчинтэй хугацаа ${Formatters.clock(left)}" }, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row {
                Text("Хүчинтэй", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Night.muted)
                Spacer(Modifier.weight(1f))
                Text(Formatters.clock(left), fontSize = 12.5.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, color = Night.muted)
            }
            Box(Modifier.fillMaxWidth().height(6.dp).background(Color.White.copy(alpha = 0.08f), CircleShape)) {
                Box(Modifier.fillMaxWidth(fraction).height(6.dp).background(if (low) Theme.warning else Night.accent, CircleShape))
            }
        }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
            Text("Хүлээж байна…", fontSize = 15.sp, color = Night.muted)
        }
    }
}

/** The code as the eID app shows it, a box per digit. */
@Composable
private fun Code(vc: String) {
    Column(
        Modifier.fillMaxWidth()
            .background(Brush.linearGradient(listOf(Night.glow.copy(alpha = 0.16f), Night.glow.copy(alpha = 0.06f))), RoundedCornerShape(20.dp))
            .border(1.dp, Night.glow.copy(alpha = 0.3f), RoundedCornerShape(20.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("БАТАЛГААЖУУЛАХ КОД", fontSize = 11.5.sp, fontWeight = FontWeight.Black, letterSpacing = 0.9.sp, color = Night.rose)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Rounded.VerifiedUser, null, tint = Night.rose, modifier = Modifier.size(18.dp))
        }
        Row(
            Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "Баталгаажуулах код ${vc.toList().joinToString(" ")}" },
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        ) {
            vc.forEach { c ->
                Box(
                    Modifier.weight(1f).widthIn(max = 56.dp).heightIn(min = 58.dp)
                        .background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                        .border(1.dp, Night.glow.copy(alpha = 0.45f), RoundedCornerShape(14.dp)),
                    contentAlignment = Alignment.Center,
                ) { Text(c.toString(), fontSize = 28.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, color = Color.White) }
            }
        }
        Text(
            buildAnnotatedString {
                append("Апп дээрх код ижил биш бол ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = Color.White)) { append("татгалзана") }
                append(" уу.")
            },
            fontSize = 12.5.sp, color = Night.muted,
        )
    }
}

@Composable
private fun Steps(list: List<String>) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        list.forEachIndexed { i, s ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(26.dp).background(Night.glow.copy(alpha = 0.18f), CircleShape), contentAlignment = Alignment.Center) {
                    Text("${i + 1}", fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, color = Night.rose)
                }
                Text(s, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, color = Night.silver)
            }
        }
    }
}

@Composable
private fun Registration(model: EIDLoginModel) {
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    // A TextFieldValue, not a String: the field shows exactly the normalised
    // text (Latin look-alikes → Cyrillic) without the keyboard's composition
    // fighting it.
    var field by remember { mutableStateOf(TextFieldValue(model.registerNumber, TextRange(model.registerNumber.length))) }
    LaunchedEffect(Unit) { if (model.notice == null) try { focus.requestFocus() } catch (_: Exception) {} }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        model.notice?.let { AlertBox(it) }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Регистрийн дугаараар нэвтрэх", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Text("Таны eID Mongolia апп руу баталгаажуулах хүсэлт очно.", fontSize = 13.5.sp, color = Night.muted)
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Регистрийн дугаар", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White)
            Row(
                Modifier.fillMaxWidth().height(52.dp)
                    .background(Color.White.copy(alpha = 0.06f), CircleShape)
                    .border(1.dp, Night.line.copy(alpha = 0.18f), CircleShape)
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.Rounded.Badge, null, tint = Night.muted, modifier = Modifier.size(20.dp))
                val style = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.Medium, fontFamily = FontFamily.Monospace, color = Color.White)
                BasicTextField(
                    value = field,
                    onValueChange = { v ->
                        model.updateRegisterNumber(v.text)
                        val n = model.registerNumber
                        field = if (n == v.text) v else TextFieldValue(n, TextRange(n.length))
                    },
                    singleLine = true,
                    textStyle = style,
                    cursorBrush = SolidColor(Night.rose),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false, imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { if (model.canStart) { focusManager.clearFocus(); model.start() } }),
                    modifier = Modifier.weight(1f).focusRequester(focus).semantics { contentDescription = "Регистрийн дугаар. 2 кирилл үсэг, 8 тоо" },
                    decorationBox = { inner ->
                        Box {
                            if (model.registerNumber.isEmpty()) Text("УБ90010112", style = style.copy(color = Night.muted.copy(alpha = 0.7f)))
                            inner()
                        }
                    },
                )
            }
            val hint = model.registerHint
            if (hint != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.ErrorOutline, null, tint = Alert, modifier = Modifier.size(16.dp))
                    Text(hint, fontSize = 13.sp, color = Alert)
                }
            } else {
                Text("2 үсэг, 8 тоо. Латинаар бичсэн ч кирилл рүү хөрвүүлнэ.", fontSize = 13.sp, color = Night.muted)
            }
        }
        PrimaryNightButton(enabled = model.canStart, dimWhenDisabled = true, onClick = { focusManager.clearFocus(); model.start() }) {
            Text("Апп руу хүсэлт илгээх")
        }
    }
}

@Composable
private fun AlertBox(message: String) {
    Text(
        message, fontSize = 13.5.sp, color = Alert,
        modifier = Modifier.fillMaxWidth().background(Color(0xFF3B1210), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
    )
}

/** The other way in; the PIN line and the app store. */
@Composable
private fun Foot(model: EIDLoginModel) {
    val context = LocalContext.current
    Column(
        Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.25f)).navigationBarsPadding().padding(horizontal = 20.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (model.phase != EIDLoginModel.Phase.Success) {
            if (model.method == EIDLoginModel.Method.SamePhone) {
                Other("Регистрийн дугаараар", Icons.Rounded.Badge) { model.showRegistration() }
            } else {
                Other("Энэ утсан дээрх eID апп-аар", Icons.Rounded.PhoneAndroid) { model.startHere() }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Rounded.Lock, null, tint = Ok, modifier = Modifier.size(15.dp))
            Text("PIN зөвхөн eID апп дотор ·", fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = Night.muted)
            Text(
                "Апп татах", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Night.silver,
                modifier = Modifier.pressable { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(AppConfig.eidStoreURL))) }.padding(vertical = 6.dp),
            )
        }
    }
}

@Composable
private fun Other(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Row(
        Modifier.heightIn(min = Theme.minTap).pressable(onClick = onClick)
            .background(Color.White.copy(alpha = 0.05f), CircleShape)
            .border(1.dp, Night.line.copy(alpha = 0.2f), CircleShape)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(icon, null, tint = Night.silver, modifier = Modifier.size(18.dp))
        Text(title, fontSize = 13.5.sp, fontWeight = FontWeight.Bold, color = Night.silver)
    }
}

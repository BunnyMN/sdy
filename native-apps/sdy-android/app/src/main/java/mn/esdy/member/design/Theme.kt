package mn.esdy.member.design

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarToday
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircleOutline
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.HighlightOff
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The dark design: a black canvas, graphite cards, white type — the iOS
 * app's Theme.swift. The app is always dark (iOS: .preferredColorScheme(.dark)),
 * so "accent" is the dark-mode SDY red from the iOS asset catalog.
 */
object Theme {
    /** SDY red #AF1D26 — the brand. */
    val brandRed = Color(0xFFAF1D26)
    /** SDY red as the iOS AccentColor shows in dark mode (#E54B55), for tints and links. */
    val accent = Color(0xFFE54B55)
    val success = Color(0xFF30D158)
    val warning = Color(0xFFFF9F0A)
    val danger = Color(0xFFFF453A)
    val info = Color(0xFF0A84FF)
    val minTap = 44.dp

    val canvas = Color.Black
    val card = Color(0xFF1C1C1C)          // white 0.11
    val cardRaised = Color(0xFF2B2B2B)    // white 0.17
    val secondaryText = Color(0xFF9E9E9E) // white 0.62
    val tertiaryText = Color(0xFF6B6B6B)  // white 0.42
    /** iOS `.secondary` on dark (secondaryLabel). */
    val systemSecondary = Color(0xFF8D8D93)

    /** iOS grouped-list cells in dark mode (secondarySystemGroupedBackground). */
    val groupedCell = Color(0xFF1C1C1E)
    /** iOS sheet / form background in dark mode. */
    val sheetBackground = Color(0xFF111111)
    val separator = Color(0x29FFFFFF)
    /** iOS tertiarySystemFill (dark) — tracks of bars, fields. */
    val fill = Color(0x3D767680)
}

/** The sign-in's palette: a warm black sky, SDY red, the logo's silver. */
object Night {
    val sky = Color(0xFF0B0709)
    val accent = Theme.brandRed
    val glow = Color(0xFFC3242E)
    val silver = Color(0xFFE4E7EC)
    val rose = Color(0xFFF08A90)
    val muted = Color(0xFF9C8F92)
    val line = Color(0xFFE4E7EC)
}

/**
 * iOS Dynamic Type sizes at the default setting, so a `.font(.headline)` on
 * iOS is `SdyType.headline` here.
 */
/**
 * Inter (SIL Open Font License, third_party/Inter-LICENSE.txt): the closest
 * open face to iOS's SF Pro in width and shape, so text wraps and fits as it
 * does on iPhone. Roboto runs narrower.
 */
val Inter = androidx.compose.ui.text.font.FontFamily(
    androidx.compose.ui.text.font.Font(mn.esdy.member.R.font.inter_regular, FontWeight.Normal),
    androidx.compose.ui.text.font.Font(mn.esdy.member.R.font.inter_medium, FontWeight.Medium),
    androidx.compose.ui.text.font.Font(mn.esdy.member.R.font.inter_semibold, FontWeight.SemiBold),
    androidx.compose.ui.text.font.Font(mn.esdy.member.R.font.inter_bold, FontWeight.Bold),
    androidx.compose.ui.text.font.Font(mn.esdy.member.R.font.inter_extrabold, FontWeight.ExtraBold),
    androidx.compose.ui.text.font.Font(mn.esdy.member.R.font.inter_black, FontWeight.Black),
)

object SdyType {
    val largeTitle = TextStyle(fontFamily = Inter, fontSize = 34.sp, fontWeight = FontWeight.Bold, lineHeight = 41.sp)
    val title = TextStyle(fontFamily = Inter, fontSize = 28.sp, fontWeight = FontWeight.Bold, lineHeight = 34.sp)
    val title2 = TextStyle(fontFamily = Inter, fontSize = 22.sp, fontWeight = FontWeight.Bold, lineHeight = 28.sp)
    val title3 = TextStyle(fontFamily = Inter, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, lineHeight = 25.sp)
    val headline = TextStyle(fontFamily = Inter, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp)
    val body = TextStyle(fontFamily = Inter, fontSize = 17.sp, lineHeight = 22.sp)
    val callout = TextStyle(fontFamily = Inter, fontSize = 16.sp, lineHeight = 21.sp)
    val subheadline = TextStyle(fontFamily = Inter, fontSize = 15.sp, lineHeight = 20.sp)
    val footnote = TextStyle(fontFamily = Inter, fontSize = 13.sp, lineHeight = 18.sp)
    val caption = TextStyle(fontFamily = Inter, fontSize = 12.sp, lineHeight = 16.sp)
    val caption2 = TextStyle(fontFamily = Inter, fontSize = 11.sp, lineHeight = 13.sp)
    val mono = FontFamily.Monospace
}

/**
 * A short coloured label that never relies on colour alone: it always has text
 * and, where it matters, an icon.
 */
enum class Tone { Neutral, Accent, Success, Warning, Danger, Info }

fun Tone.color(): Color = when (this) {
    Tone.Neutral -> Theme.systemSecondary
    Tone.Accent -> Theme.accent
    Tone.Success -> Theme.success
    Tone.Warning -> Theme.warning
    Tone.Danger -> Theme.danger
    Tone.Info -> Theme.info
}

data class Chip(val text: String, val icon: ImageVector? = null, val tone: Tone = Tone.Neutral)

@Composable
fun StatusChip(text: String, icon: ImageVector? = null, tone: Tone = Tone.Neutral, modifier: Modifier = Modifier) {
    val color = tone.color()
    Row(
        modifier
            .background(color.copy(alpha = 0.14f), CircleShape)
            .padding(horizontal = 8.dp, vertical = 4.dp)
            .clearAndSetSemantics { contentDescription = text },
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(icon, null, tint = color, modifier = Modifier.size(13.dp))
        Text(text, style = SdyType.caption.copy(fontWeight = FontWeight.SemiBold), color = color, maxLines = 1)
    }
}

@Composable
fun StatusChip(chip: Chip, modifier: Modifier = Modifier) = StatusChip(chip.text, chip.icon, chip.tone, modifier)

object Chips {
    fun attendance(status: String): Chip? = when (status) {
        "registered" -> Chip("Бүртгүүлсэн", Icons.Rounded.CheckCircleOutline, Tone.Info)
        "attended" -> Chip("Ирсэн", Icons.Rounded.Verified, Tone.Success)
        "absent" -> Chip("Ирээгүй", Icons.Rounded.HighlightOff, Tone.Warning)
        else -> null
    }

    fun eventStatus(status: String): Chip = when (status) {
        "planned" -> Chip("Товлогдсон", Icons.Rounded.CalendarToday, Tone.Info)
        "done" -> Chip("Болсон", Icons.Rounded.Check, Tone.Neutral)
        "cancelled" -> Chip("Цуцлагдсан", Icons.Rounded.Close, Tone.Danger)
        else -> Chip(status)
    }
}

object Labels {
    fun membershipStatus(status: String): String = when (status) {
        "active" -> "Идэвхтэй"
        "suspended" -> "Түдгэлзсэн"
        "expired" -> "Хугацаа дууссан"
        "left" -> "Гарсан"
        "alumni" -> "Ахмад гишүүн"
        else -> "Гишүүнчлэл баталгаажаагүй"
    }

    fun attendance(status: String): String = when (status) {
        "registered" -> "Бүртгүүлсэн"
        "attended" -> "Ирсэн"
        "absent" -> "Ирээгүй"
        else -> "—"
    }

    fun payment(status: String): String = when (status) {
        "pending" -> "Шалгагдаж байна"
        "approved" -> "Баталгаажсан"
        "rejected" -> "Татгалзсан"
        "reversed" -> "Буцаагдсан"
        else -> status
    }

    fun transfer(status: String): String = when (status) {
        "PENDING" -> "Очих байгууллагын шийдвэр хүлээж байна"
        "ACCEPTED" -> "Шилжилт батлагдсан"
        "DECLINED" -> "Шилжих хүсэлт татгалзсан"
        "CANCELLED" -> "Шилжих хүсэлт цуцлагдсан"
        else -> status
    }

    fun joinRequest(status: String): String = when (status.uppercase()) {
        "PENDING" -> "Шийдвэр хүлээж байна"
        "ACCEPTED", "APPROVED" -> "Элсэх хүсэлт батлагдсан"
        "DECLINED", "REJECTED" -> "Элсэх хүсэлт татгалзсан"
        else -> status
    }

    fun motionStatus(status: String): String = when (status) {
        "proposed" -> "Хэлэлцэхээр дэвшүүлсэн"
        "voting" -> "Санал хураалт явагдаж байна"
        "approved" -> "Батлагдсан"
        "rejected" -> "Батлагдсангүй"
        "withdrawn" -> "Буцаасан"
        else -> status
    }

    fun choice(choice: String): String = when (choice) {
        "yes" -> "Зөвшөөрөх"
        "no" -> "Татгалзах"
        "abstain" -> "Түдгэлзэх"
        else -> choice
    }

    fun chose(choice: String): String = when (choice) {
        "yes" -> "Зөвшөөрсөн"
        "no" -> "Татгалзсан"
        "abstain" -> "Түдгэлзсэн"
        else -> choice
    }

    /** Албан тушаал. Shown only — positions grant no permission. */
    fun position(code: String?): String? = when (code) {
        "chair" -> "Тэргүүн"
        "vice_chair" -> "Дэд тэргүүн"
        "secretary" -> "Нарийн бичиг"
        "auditor" -> "Хяналтын хороо"
        "board" -> "Тэргүүлэгч"
        "finance" -> "Санхүүч"
        "member" -> "Энгийн гишүүн"
        else -> null
    }

    fun taskStatus(status: String): String = when (status) {
        "offered" -> "Санал болгосон"
        "accepted" -> "Хүлээн авсан"
        "declined" -> "Татгалзсан"
        "done" -> "Гүйцэтгэсэн"
        else -> status
    }

    fun pointReason(reason: String): String = when (reason) {
        "attendance" -> "Ирц"
        "task" -> "Ажил үүрэг"
        "vote" -> "Санал"
        "sanction" -> "Хяналтын хорооны шийдвэр"
        else -> reason
    }
}


/**
 * One line that shrinks to fit, down to `minScale` of its size, before it
 * would be cut (iOS .lineLimit(1).minimumScaleFactor(minScale)).
 */
@Composable
fun ShrinkText(
    text: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    minScale: Float = 0.7f,
) {
    val max = style.fontSize
    androidx.compose.foundation.text.BasicText(
        text,
        modifier = modifier,
        style = style.copy(color = color),
        maxLines = 1,
        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
        autoSize = androidx.compose.foundation.text.TextAutoSize.StepBased(minFontSize = max * minScale, maxFontSize = max, stepSize = 0.5.sp),
    )
}

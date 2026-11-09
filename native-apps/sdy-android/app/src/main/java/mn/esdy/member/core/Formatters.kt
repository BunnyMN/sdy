package mn.esdy.member.core

import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.floor
import kotlin.math.roundToLong

/** Dates in Asia/Ulaanbaatar as "yyyy-MM-dd HH:mm", money as "1,250,000₮". */
object Formatters {
    val zone: ZoneId = ZoneId.of("Asia/Ulaanbaatar")

    private val display = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.US).withZone(zone)
    private val dayFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd", Locale.US).withZone(zone)
    private val timeOnly = DateTimeFormatter.ofPattern("HH:mm", Locale.US).withZone(zone)

    fun parseDate(value: String?): Instant? {
        if (value.isNullOrEmpty()) return null
        return try {
            OffsetDateTime.parse(value).toInstant()
        } catch (e: Exception) {
            try { Instant.parse(value) } catch (e: Exception) { parseDay(value) }
        }
    }

    /** A calendar day ("2026-10-25" or a timestamp) at its start in Ulaanbaatar. */
    fun parseDay(value: String?): Instant? {
        if (value == null || value.length < 10) return null
        return try { LocalDate.parse(value.take(10)).atStartOfDay(zone).toInstant() } catch (e: Exception) { null }
    }

    fun startOfDay(instant: Instant): Instant = instant.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant()

    /** "2026-10-26 18:30", or "—" when the value is not a date. */
    fun dateTime(value: String?): String = parseDate(value)?.let { display.format(it) } ?: "—"

    fun dateTime(instant: Instant): String = display.format(instant)

    fun day(value: String?): String = parseDate(value)?.let { dayFormat.format(it) } ?: (value ?: "—")

    fun time(instant: Instant): String = timeOnly.format(instant)

    /**
     * "Өнөөдөр 18:30", "Маргааш 10:00", "3 өдрийн дараа · 10:00", "Өчигдөр 09:00",
     * otherwise the full date.
     */
    fun relative(value: String?, now: Instant = Instant.now()): String {
        val date = parseDate(value) ?: return "—"
        val days = ChronoUnit.DAYS.between(now.atZone(zone).toLocalDate(), date.atZone(zone).toLocalDate()).toInt()
        val time = timeOnly.format(date)
        return when (days) {
            0 -> "Өнөөдөр $time"
            1 -> "Маргааш $time"
            -1 -> "Өчигдөр $time"
            in 2..6 -> "$days өдрийн дараа · $time"
            else -> display.format(date)
        }
    }

    private val moneyFormat = DecimalFormat("#,##0", DecimalFormatSymbols(Locale.US)).apply { roundingMode = RoundingMode.HALF_UP }

    /** Swift's `.rounded()`: half away from zero. */
    fun roundHalfAway(value: Double): Double = if (value < 0) -floor(-value + 0.5) else floor(value + 0.5)

    /** "1,250,000₮" */
    fun money(value: Double): String = moneyFormat.format(roundHalfAway(value)) + "₮"

    fun points(value: Double): String = "${roundHalfAway(value).roundToLong()} оноо"

    /** "4:59" countdown */
    fun clock(seconds: Int): String {
        val s = maxOf(0, seconds)
        return "${s / 60}:" + String.format(Locale.US, "%02d", s % 60)
    }
}

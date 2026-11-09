package mn.esdy.member.core

/**
 * Mongolian civil register number: two Cyrillic letters and eight digits
 * ("УБ90010112"). People often type Latin look-alikes on a Latin keyboard;
 * those are turned into the Cyrillic letters they look like.
 */
object RegisterNumber {
    val latinToCyrillic: Map<Char, Char> = mapOf(
        'A' to 'А', 'B' to 'В', 'C' to 'С', 'E' to 'Е', 'H' to 'Н', 'K' to 'К', 'M' to 'М',
        'O' to 'О', 'P' to 'Р', 'T' to 'Т', 'X' to 'Х', 'Y' to 'У',
    )

    private val pattern = Regex("^[А-ЯЁӨҮ]{2}[0-9]{8}$")

    /** Uppercases, maps look-alikes, drops spaces and anything after 10 characters. */
    fun normalize(input: String): String {
        val out = StringBuilder()
        for (ch in input.uppercase()) {
            if (ch.isWhitespace() || ch == '-') continue
            out.append(latinToCyrillic[ch] ?: ch)
        }
        return out.toString().take(10)
    }

    fun isValid(value: String): Boolean = pattern.matches(value)

    /** A hint for what is wrong, or null when valid or still empty. */
    fun hint(value: String): String? {
        if (value.isEmpty() || isValid(value)) return null
        if (value.take(2).any { !isCyrillicLetter(it) }) return "Эхний 2 тэмдэгт кирилл үсэг байна (ж: УБ)."
        if (value.drop(2).any { it !in '0'..'9' }) return "Үсгийн дараа зөвхөн 8 оронтой тоо орно."
        return "2 үсэг, 8 тоо — нийт 10 тэмдэгт (одоо ${value.length})."
    }

    fun isCyrillicLetter(ch: Char): Boolean = ch.code in 0x0410..0x042F || ch == 'Ё' || ch == 'Ө' || ch == 'Ү'
}

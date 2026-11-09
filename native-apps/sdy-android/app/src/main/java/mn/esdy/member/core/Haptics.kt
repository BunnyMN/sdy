package mn.esdy.member.core

import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import java.lang.ref.WeakReference

/** Success / error / light tap, through the window's view (no VIBRATE permission prompt). */
object Haptics {
    private var view: WeakReference<View>? = null

    fun attach(view: View) { this.view = WeakReference(view) }

    fun success() = perform(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
    fun error() = perform(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS)
    fun tap() = perform(if (Build.VERSION.SDK_INT >= 27) HapticFeedbackConstants.KEYBOARD_PRESS else HapticFeedbackConstants.VIRTUAL_KEY)

    private fun perform(constant: Int) {
        view?.get()?.post { view?.get()?.performHapticFeedback(constant) }
    }
}

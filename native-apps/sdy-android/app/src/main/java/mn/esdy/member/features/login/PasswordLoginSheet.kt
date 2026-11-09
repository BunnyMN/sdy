package mn.esdy.member.features.login

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.APIError
import mn.esdy.member.core.login
import mn.esdy.member.design.FormSheet
import mn.esdy.member.design.FormTextField
import mn.esdy.member.design.ListDivider
import mn.esdy.member.design.ListSection
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.RowButton

/** Email and password, for accounts a branch gave a password to (iOS PasswordLoginSheet). */
@Composable
fun PasswordLoginSheet(onDismiss: () -> Unit, onSignedIn: () -> Unit) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (busy || email.isEmpty() || password.isEmpty()) return
        busy = true; error = null
        scope.launch {
            try {
                app.api.login(email.trim(), password)
                if (!app.api.tokens.hasToken) {
                    error = "Нэвтрэх эрх олгогдсонгүй. Дахин оролдоно уу."
                } else {
                    onSignedIn()
                }
            } catch (e: Throwable) {
                val api = APIError.wrap(e)
                error = if (api.status == 401 || api.status == 400) "Имэйл эсвэл нууц үг буруу байна." else api.message
            } finally {
                busy = false
            }
        }
    }

    FormSheet(title = "Нууц үгээр нэвтрэх", onDismiss = onDismiss, busy = busy) {
        item {
            ListSection(footer = "Зөвхөн салбараас нууц үг олгосон бүртгэлд зориулагдсан. Бусад тохиолдолд eID Mongolia-аар нэвтэрнэ үү.") {
                FormTextField(email, { email = it }, "Имэйл", keyboardType = KeyboardType.Email, capitalization = KeyboardCapitalization.None, autoCorrect = false, imeAction = ImeAction.Next)
                ListDivider()
                FormTextField(password, { password = it }, "Нууц үг", keyboardType = KeyboardType.Password, capitalization = KeyboardCapitalization.None, autoCorrect = false, secure = true, imeAction = ImeAction.Go, onSubmit = { submit() })
            }
        }
        error?.let { item { ListSection { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 12.dp)) } } }
        item {
            ListSection {
                RowButton("Нэвтрэх", center = true, busy = busy, enabled = email.isNotEmpty() && password.isNotEmpty()) { submit() }
            }
        }
    }
}


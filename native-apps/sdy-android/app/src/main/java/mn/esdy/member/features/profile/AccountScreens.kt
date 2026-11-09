package mn.esdy.member.features.profile

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.HourglassTop
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mn.esdy.member.R
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.APIError
import mn.esdy.member.core.AppConfig
import mn.esdy.member.core.Formatters
import mn.esdy.member.core.deletionStatus
import mn.esdy.member.core.requestDeletion
import mn.esdy.member.design.ActionSheet
import mn.esdy.member.design.FormTextField
import mn.esdy.member.design.ListDivider
import mn.esdy.member.design.ListSection
import mn.esdy.member.design.NoticeKind
import mn.esdy.member.design.NoticeView
import mn.esdy.member.design.RowButton
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.SheetAction
import mn.esdy.member.design.Theme
import mn.esdy.member.models.DeletionStatus

@Composable
fun AboutScreen() {
    val context = LocalContext.current
    InlineListScreen("Апп-ын тухай") {
        item {
            ListSection {
                Row(Modifier.padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Image(
                        painterResource(R.drawable.logo), null, contentScale = ContentScale.Crop,
                        modifier = Modifier.size(64.dp).clip(RoundedCornerShape(14.dp)).clearAndSetSemantics { },
                    )
                    Column {
                        Text("E-sdy", style = SdyType.title3.copy(fontWeight = FontWeight.Bold), color = Color.White)
                        Text("Хувилбар ${AppConfig.appVersion}", style = SdyType.subheadline, color = Theme.secondaryText)
                    }
                }
                ListDivider()
                Text(
                    "SDY-ийн гишүүдэд зориулсан апп: арга хэмжээнд бүртгүүлэх, QR-ээр ирцээ батлах, хурлын асуудалд eID-ээр санал өгөх, гишүүнчлэлийн хураамжаа хянах.",
                    style = SdyType.subheadline, color = Color.White, modifier = Modifier.padding(vertical = 11.dp),
                )
                ListDivider()
                Text("SDY-ийн зөвшөөрөлтэйгээр хөгжүүлсэн.", style = SdyType.subheadline.copy(fontWeight = FontWeight.Medium), color = Color.White, modifier = Modifier.padding(vertical = 11.dp))
            }
        }
        item {
            ListSection(header = "Нээлттэй эх") {
                Text(
                    "Энэ апп нь Gerege Systems-ийн open-gerege-nexus (Apache License 2.0) платформ дээр суурилсан. Copyright © 2026 Gerege Systems Development Team, Gerege Nomadica Foundation.",
                    style = SdyType.footnote, color = Color.White, modifier = Modifier.padding(vertical = 11.dp),
                )
                ListDivider()
                RowButton("Apache License 2.0") { openURL(context, "https://www.apache.org/licenses/LICENSE-2.0") }
            }
        }
        item {
            ListSection {
                RowButton("Нууцлалын бодлого") { openURL(context, AppConfig.privacyURL) }
                ListDivider()
                RowButton("Тусламж") { openURL(context, AppConfig.supportURL) }
            }
        }
    }
}

/** Store guidelines: an in-app way to delete the account. */
@Composable
fun DeleteAccountScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<DeletionStatus?>(null) }
    var reason by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { status = try { app.api.deletionStatus() } catch (_: Exception) { null } }

    fun submit() {
        busy = true; error = null
        scope.launch {
            try {
                app.api.requestDeletion(reason.trim())
                // The server revoked every session already; nothing to log out of.
                app.clearLocal()
                app.signOutReason = "Бүртгэл устгах хүсэлт хүлээн авлаа. 30 хоногийн дотор дахин нэвтэрвэл хүсэлт цуцлагдаж, гишүүнчлэл тань сэргээгдэнэ."
            } catch (e: Throwable) {
                error = APIError.wrap(e).message
            } finally {
                busy = false
            }
        }
    }

    InlineListScreen("Бүртгэл устгах") {
        item {
            ListSection {
                Column(Modifier.padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Rounded.Warning, null, tint = Theme.danger, modifier = Modifier.size(20.dp))
                        Text("Бүртгэл устгах", style = SdyType.headline, color = Theme.danger)
                    }
                    val body = SdyType.subheadline
                    Text("Хүсэлт илгээсний дараа таны бүх төхөөрөмж дээрх нэвтрэлт хаагдана. 30 хоногийн дотор дахин нэвтэрвэл устгах хүсэлт автоматаар цуцлагдаж, гишүүнчлэл тань сэргээгдэнэ.", style = body, color = Color.White)
                    Text("30 хоногийн дараа таны нэвтрэх бүртгэл, холбоо барих мэдээлэл, мэдэгдлүүд устгагдана. Хуулиар хадгалах шаардлагатай санхүүгийн гүйлгээ, хурлын зурсан саналын бүртгэл нэргүйжүүлэгдэн хадгалагдаж болно.", style = body, color = Color.White)
                    Text("Салбарын гишүүнчлэлээс гарах нь тусдаа асуудал тул салбартаа мэдэгдэнэ үү.", style = body, color = Color.White)
                }
            }
        }
        status?.takeIf { it.isPending }?.let { s ->
            item {
                ListSection {
                    Row(Modifier.padding(vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Rounded.HourglassTop, null, tint = Theme.warning, modifier = Modifier.size(20.dp))
                        Text(
                            "Устгах хүсэлт илгээгдсэн${s.deadline?.let { " · ${Formatters.day(it)}-нд устгагдана" } ?: ""}.",
                            style = SdyType.body, color = Theme.warning,
                        )
                    }
                }
            }
        }
        item {
            ListSection(footer = "Шалтгаан нь үйлчилгээгээ сайжруулахад тусална.") {
                FormTextField(reason, { reason = it.take(500) }, "Шалтгаан (заавал биш)", singleLine = false, minLines = 2, maxLines = 5)
            }
        }
        error?.let { item { ListSection { NoticeView(it, NoticeKind.Error, Modifier.padding(vertical = 11.dp)) } } }
        item {
            ListSection {
                RowButton("Бүртгэлээ устгах", color = Theme.danger, center = true, busy = busy, enabled = !busy && !app.isOffline) { confirm = true }
            }
        }
    }

    if (confirm) {
        ActionSheet(
            title = "Бүртгэлээ устгах уу?",
            message = "Бүх төхөөрөмж дээрх нэвтрэлт хаагдана. 30 хоногийн дотор дахин нэвтэрвэл хүсэлт цуцлагдаж, гишүүнчлэл тань сэргээгдэнэ.",
            actions = listOf(SheetAction("Устгах хүсэлт илгээх", destructive = true) { submit() }),
            onDismiss = { confirm = false },
        )
    }
}

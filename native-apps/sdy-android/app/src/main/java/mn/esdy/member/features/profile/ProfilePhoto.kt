package mn.esdy.member.features.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.max
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import mn.esdy.member.app.LocalApp
import mn.esdy.member.core.APIError
import mn.esdy.member.design.ActionSheet
import mn.esdy.member.design.SdyAlert
import mn.esdy.member.design.SheetAction
import mn.esdy.member.design.Theme
import mn.esdy.member.design.pressable
import mn.esdy.member.design.white

/** The signed-in person's photo, or their initials on SDY red when they have none. */
@Composable
fun AvatarView(size: Dp) {
    val app = LocalApp.current
    val initials = (app.me?.name ?: "").split(" ").filter { it.isNotEmpty() }.take(2).map { it.first() }.joinToString("")
    Box(
        Modifier.size(size).clip(CircleShape)
            .border(max(1.dp, size / 64), Color.White.copy(alpha = 0.18f), CircleShape)
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Crossfade(app.photo, label = "avatar") { photo ->
            if (photo != null) {
                Image(photo, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Box(
                    Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Theme.brandRed, white(0.12f)))),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(initials, fontSize = (size.value * 0.34f).sp, fontWeight = FontWeight.Bold, fontFamily = mn.esdy.member.design.Inter, color = Color.White)
                }
            }
        }
    }
}

/**
 * The Profile header's avatar: tap to choose a photo, replace it or remove
 * it. Uses the system photo picker, which needs no permission — the app only
 * ever sees the one picture chosen.
 */
@Composable
fun EditableAvatar() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var showOptions by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            try {
                app.setPhoto(uri)
            } catch (e: Throwable) {
                val error = APIError.wrap(e)
                failure = if (error.kind == APIError.Kind.Decoding) "Энэ зургийг уншиж чадсангүй. Өөр зураг сонгоно уу." else error.message
            } finally {
                busy = false
            }
        }
    }
    fun pick() = picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))

    Box(
        Modifier
            .shadow(18.dp, CircleShape, clip = false, ambientColor = Color.Black, spotColor = Color.Black.copy(alpha = 0.5f))
            .pressable(0.94f, enabled = !busy && !app.isOffline) { if (app.photo == null) pick() else showOptions = true }
            .semantics { contentDescription = if (app.photo == null) "Профайлын зураг оруулах" else "Профайлын зураг солих" },
    ) {
        AvatarView(128.dp)
        if (busy) {
            Box(Modifier.size(128.dp).background(Color.Black.copy(alpha = 0.45f), CircleShape), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White)
            }
        }
        Box(
            Modifier.align(Alignment.BottomEnd).offset((-2).dp, (-2).dp).size(38.dp)
                .shadow(6.dp, CircleShape)
                .background(Color.White, CircleShape)
                .border(1.dp, Color.Black.copy(alpha = 0.08f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Rounded.PhotoCamera, null, tint = Color.Black, modifier = Modifier.size(18.dp)) }
    }

    if (showOptions) {
        ActionSheet(
            title = "Профайлын зураг",
            actions = listOf(
                SheetAction("Шинэ зураг сонгох") { pick() },
                SheetAction("Зургийг устгах", destructive = true) {
                    busy = true
                    scope.launch {
                        try { app.removePhoto() } catch (e: Throwable) { failure = APIError.wrap(e).message } finally { busy = false }
                    }
                },
            ),
            onDismiss = { showOptions = false },
        )
    }
    failure?.let {
        SdyAlert(title = "Зураг хадгалагдсангүй", message = it, confirmTitle = "За", dismissTitle = null, onConfirm = {}, onDismiss = { failure = null })
    }
}

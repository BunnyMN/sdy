package mn.esdy.member.features.checkin

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.FlashlightOff
import androidx.compose.material.icons.rounded.FlashlightOn
import androidx.compose.material.icons.rounded.NoPhotography
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import mn.esdy.member.core.CheckinCode
import mn.esdy.member.core.Haptics
import mn.esdy.member.core.LinkParser
import mn.esdy.member.design.BarIconButton
import mn.esdy.member.design.BarTextButton
import mn.esdy.member.design.PrimaryButton
import mn.esdy.member.design.SdyFullScreen
import mn.esdy.member.design.SdyType

private enum class CameraStatus { Unknown, Authorized, Denied, NoCamera }

/** Full-screen scanner with permission handling, torch and a clear hint. */
@Composable
fun QRScannerScreen(onDismiss: () -> Unit, onCheckin: (CheckinCode) -> Unit) {
    val context = LocalContext.current
    val hasCamera = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) }
    var status by remember {
        mutableStateOf(
            when {
                !hasCamera -> CameraStatus.NoCamera
                ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED -> CameraStatus.Authorized
                else -> CameraStatus.Unknown
            },
        )
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        status = if (granted) CameraStatus.Authorized else CameraStatus.Denied
    }
    LaunchedEffect(Unit) { if (status == CameraStatus.Unknown) launcher.launch(Manifest.permission.CAMERA) }
    // Back from Settings with the camera allowed: scan at once (iOS restarts
    // the app when a privacy setting changes, so it never sees the old state).
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    androidx.compose.runtime.DisposableEffect(lifecycle) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME && status == CameraStatus.Denied &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            ) status = CameraStatus.Authorized
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    var torch by remember { mutableStateOf(false) }
    var invalid by remember { mutableStateOf<String?>(null) }

    fun handle(value: String) {
        val code = LinkParser.checkin(value)
        if (code != null) {
            Haptics.success()
            onDismiss()
            onCheckin(code)
        } else {
            Haptics.error()
            invalid = "Энэ нь SDY-ийн ирцийн QR биш байна."
        }
    }

    SdyFullScreen(onDismiss) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            when (status) {
                CameraStatus.Authorized -> {
                    CameraPreview(torch) { handle(it) }
                    Overlay(invalid)
                }
                CameraStatus.Unknown -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = Color.White)
                CameraStatus.Denied -> Message(
                    Icons.Rounded.PhotoCamera,
                    "Камерын зөвшөөрөл алга",
                    "Ирцийн QR уншихын тулд Тохиргоо → E-sdy → Зөвшөөрөл → Камер хэсгийг идэвхжүүлнэ үү.",
                    "Тохиргоо нээх" to { openSettings(context) },
                )
                CameraStatus.NoCamera -> Message(
                    Icons.Rounded.NoPhotography,
                    "Камер олдсонгүй",
                    "Энэ төхөөрөмж дээр камер ашиглах боломжгүй байна. Зохион байгуулагчийн QR-ийг утасны камераар уншуулна уу.",
                    null,
                )
            }
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                BarTextButton("Хаах", color = Color.White, onClick = onDismiss)
                Spacer(Modifier.weight(1f))
                if (status == CameraStatus.Authorized) {
                    BarIconButton(
                        if (torch) Icons.Rounded.FlashlightOn else Icons.Rounded.FlashlightOff,
                        if (torch) "Гэрэл унтраах" else "Гэрэл асаах",
                        tint = Color.White,
                    ) { torch = !torch }
                }
            }
        }
    }
}

private fun openSettings(context: Context) {
    context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
}

/** Camera QR reader. Calls `onCode` once per distinct string (again after 3 s). */
@OptIn(ExperimentalGetImage::class)
@Composable
private fun CameraPreview(torch: Boolean, onCode: (String) -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val latest by rememberUpdatedState(onCode)
    var camera by remember { mutableStateOf<Camera?>(null) }
    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }

    DisposableEffect(owner) {
        val executor = Executors.newSingleThreadExecutor()
        val scanner = BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
        val main = ContextCompat.getMainExecutor(context)
        var lastCode: String? = null
        var lastAt = 0L
        val future = ProcessCameraProvider.getInstance(context)
        var provider: ProcessCameraProvider? = null
        future.addListener({
            val p = future.get()
            provider = p
            val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
            val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(executor) { proxy ->
                val media = proxy.image
                if (media == null) { proxy.close(); return@setAnalyzer }
                scanner.process(InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees))
                    .addOnSuccessListener(main) { codes ->
                        val value = codes.firstOrNull()?.rawValue ?: return@addOnSuccessListener
                        val now = System.currentTimeMillis()
                        if (value == lastCode && now - lastAt < 3000) return@addOnSuccessListener
                        lastCode = value
                        lastAt = now
                        latest(value)
                    }
                    .addOnCompleteListener { proxy.close() }
            }
            try {
                p.unbindAll()
                camera = p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
            } catch (_: Exception) {}
        }, main)
        onDispose {
            camera?.cameraControl?.enableTorch(false)
            provider?.unbindAll()
            scanner.close()
            executor.shutdown()
        }
    }
    LaunchedEffect(camera, torch) {
        val c = camera ?: return@LaunchedEffect
        if (c.cameraInfo.hasFlashUnit()) c.cameraControl.enableTorch(torch)
    }
    AndroidView({ previewView }, Modifier.fillMaxSize().clearAndSetSemantics { })
}

@Composable
private fun Overlay(invalid: String?) {
    Column(Modifier.fillMaxSize().navigationBarsPadding(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.weight(1f))
        Box(Modifier.size(250.dp).border(3.dp, Color.White, RoundedCornerShape(24.dp)).clearAndSetSemantics { })
        Spacer(Modifier.weight(1f))
        Column(
            Modifier.padding(16.dp).fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(14.dp))
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (invalid != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Rounded.Warning, null, tint = Color(0xFFFFD60A), modifier = Modifier.size(18.dp))
                    Text(invalid, style = SdyType.subheadline, color = Color(0xFFFFD60A), textAlign = TextAlign.Center)
                }
            }
            Text(
                "Зохион байгуулагчийн үзүүлсэн ирцийн QR-ийг хүрээн дотор байрлуулна уу.",
                style = SdyType.subheadline, color = Color.White, textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun Message(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, text: String, action: Pair<String, () -> Unit>?) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
    ) {
        Icon(icon, null, tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(46.dp))
        Text(title, style = SdyType.title3.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = Color.White)
        Text(text, style = SdyType.body, color = Color.White.copy(alpha = 0.8f), textAlign = TextAlign.Center)
        if (action != null) PrimaryButton(action.first, onClick = action.second)
    }
}

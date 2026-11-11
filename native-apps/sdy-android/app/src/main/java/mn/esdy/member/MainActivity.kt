package mn.esdy.member

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch
import mn.esdy.member.app.AppModel
import mn.esdy.member.app.LocalApp
import mn.esdy.member.app.RootView
import mn.esdy.member.core.AppConfig
import mn.esdy.member.core.DeepLink
import mn.esdy.member.core.Haptics
import mn.esdy.member.core.LinkParser
import mn.esdy.member.design.SdyMaterialTheme

class MainActivity : ComponentActivity() {
    private lateinit var app: AppModel

    override fun onCreate(savedInstanceState: Bundle?) {
        if (BuildConfig.DEBUG) readLaunchArguments(intent)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        app = (application as SDYApplication).appModel()
        Haptics.attach(window.decorView)

        setContent {
            SdyMaterialTheme {
                CompositionLocalProvider(LocalApp provides app) {
                    // In the app's own scope, so an activity recreated mid-launch
                    // does not cancel the first session check (iOS: the root .task).
                    LaunchedEffect(Unit) {
                        if (!app.bootstrapStarted && app.phase == AppModel.Phase.Launching) {
                            app.bootstrapStarted = true
                            app.scope.launch { app.bootstrap() }
                        }
                    }
                    RootView()
                }
            }
        }

        if (savedInstanceState == null) handleIntent(intent)

        // A long-poll that died in the background restarts the moment the app
        // is in front again (iOS: scenePhase == .active).
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) {
                app.resumeTick += 1
                // Read elsewhere (the web, another phone): the count catches up.
                if (app.phase == AppModel.Phase.SignedIn) app.refreshUnread()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (intent.action != Intent.ACTION_VIEW) return
        val parsed = LinkParser.parse(data.toString()) ?: return
        when (val link = LinkParser.deepLink(parsed)) {
            null -> {}
            is DeepLink.EidCallback -> if (link.forApp) app.handle(link) else openInBrowser(data)
            else -> app.handle(link)
        }
    }

    /**
     * The web sign-in's eID return (no `app=android`) reached the app only
     * because Android before 15 cannot match an App Link on its query: hand it
     * back to the browser, where that sign-in is waiting.
     */
    private fun openInBrowser(uri: Uri) {
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
        val browser = packageManager.resolveActivity(probe, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
        val view = Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)
        if (browser != null && browser != packageName && browser != "android") view.setPackage(browser)
        try { startActivity(view) } catch (_: Exception) {}
    }

    /** DEBUG: the launching intent's extras play the role of iOS launch arguments. */
    private fun readLaunchArguments(intent: Intent?) {
        val extras = intent?.extras ?: return
        if (AppConfig.launchArguments.isNotEmpty()) return
        AppConfig.launchArguments = extras.keySet().filter { it.startsWith("SDY") }.associateWith { key ->
            @Suppress("DEPRECATION")
            extras.get(key)?.toString() ?: ""
        }
    }
}

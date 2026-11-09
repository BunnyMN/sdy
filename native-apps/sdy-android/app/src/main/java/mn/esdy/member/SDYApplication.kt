package mn.esdy.member

import android.app.Application
import mn.esdy.member.app.AppModel
import mn.esdy.member.core.APIClient
import mn.esdy.member.core.AppConfig
import mn.esdy.member.core.FixtureRouter
import mn.esdy.member.core.OfflineCache
import mn.esdy.member.core.TokenStore
import mn.esdy.member.design.ThemeStore

/**
 * Holds the one AppModel for the process, so the session and every tab's
 * screens survive the activity being recreated.
 */
class SDYApplication : Application() {
    private var model: AppModel? = null

    /** Built on first use, after MainActivity has read the launch extras. */
    fun appModel(): AppModel = model ?: run {
        ThemeStore.init(this)
        val fixtures = AppConfig.fixturesEnabled
        val api = APIClient(
            tokens = if (fixtures) TokenStore.inMemory() else TokenStore.persistent(this),
            cache = OfflineCache.create(this),
            context = this,
        )
        if (fixtures) api.fixtures = FixtureRouter(this)
        AppModel(api, this).also { model = it }
    }
}

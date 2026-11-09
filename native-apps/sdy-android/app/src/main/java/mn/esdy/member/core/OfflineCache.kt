package mn.esdy.member.core

import android.content.Context
import java.io.File
import java.util.concurrent.Executors

/**
 * The last good answer for each screen, per branch (tenant), so a member
 * with no signal still sees what they saw last time — read-only, under an
 * "Офлайн" banner. Writes are never queued.
 *
 * Files live in the app's no-backup directory and are wiped on sign-out.
 */
class OfflineCache(private val directory: File) {
    private val queue = Executors.newSingleThreadExecutor()

    init { directory.mkdirs() }

    fun fileFor(scope: String, path: String): File {
        val safe = (scope + "_" + path).map { if (it.isLetterOrDigit()) it else '_' }.joinToString("")
        return File(directory, "$safe.json")
    }

    fun save(data: ByteArray, scope: String, path: String) {
        val file = fileFor(scope, path)
        queue.execute {
            try {
                val tmp = File(file.path + ".tmp")
                tmp.writeBytes(data)
                tmp.renameTo(file)
            } catch (_: Exception) {}
        }
    }

    fun load(scope: String, path: String): ByteArray? =
        queue.submit<ByteArray?> { fileFor(scope, path).takeIf { it.exists() }?.readBytes() }.get()

    fun clearAll() {
        queue.submit { directory.listFiles()?.forEach { it.delete() } }.get()
    }

    companion object {
        fun create(context: Context) = OfflineCache(File(context.noBackupFilesDir, "SDYCache"))
    }
}

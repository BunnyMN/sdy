package mn.esdy.member.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The bearer session token, encrypted with a key that lives in the Android
 * Keystore and never leaves this device (iOS: Keychain,
 * AfterFirstUnlockThisDeviceOnly). The ciphertext sits in private
 * SharedPreferences, which backup and device transfer exclude
 * (data_extraction_rules.xml).
 */
class TokenStore private constructor(private val context: Context?, private val inMemory: Boolean) {
    private val lock = Any()
    private var cached: String? = null
    private var loaded = false

    val token: String?
        get() = synchronized(lock) {
            if (!loaded && !inMemory) {
                cached = read()
                loaded = true
            }
            cached
        }

    val hasToken: Boolean get() = !token.isNullOrEmpty()

    fun save(token: String) = synchronized(lock) { saveLocked(token) }

    private fun saveLocked(token: String) {
        cached = token
        loaded = true
        if (inMemory) return
        try {
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val sealed = cipher.iv + cipher.doFinal(token.toByteArray(Charsets.UTF_8))
            prefs()?.edit()?.putString(ACCOUNT, Base64.encodeToString(sealed, Base64.NO_WRAP))?.commit()
        } catch (e: Exception) {
            // The token still works from memory this run; the next launch would
            // find no token and sign the member out without saying why.
            Log.e("keystore", "token not saved: ${e.javaClass.simpleName}")
        }
    }

    fun clear() = synchronized(lock) { clearLocked() }

    /**
     * Clears the token only while it is still `expected`: the answer that
     * ended a session speaks for the token it was sent with, not for one a
     * branch switch or sign-in saved while it was in flight. True if cleared.
     */
    fun clear(ifStill: String?): Boolean = synchronized(lock) {
        loadLocked()
        if (ifStill.isNullOrEmpty() || cached != ifStill) return@synchronized false
        clearLocked()
        true
    }

    /** Saves a token only while `ifStill` is still the current one (a cookie on a late answer must not undo a newer token). */
    fun save(token: String, ifStill: String?): Boolean = synchronized(lock) {
        loadLocked()
        if (cached != ifStill) return@synchronized false
        saveLocked(token)
        true
    }

    private fun loadLocked() {
        if (!loaded && !inMemory) { cached = read(); loaded = true }
    }

    private fun clearLocked() {
        cached = null
        loaded = true
        if (!inMemory) prefs()?.edit()?.remove(ACCOUNT)?.commit()
    }

    private fun read(): String? = try {
        val raw = prefs()?.getString(ACCOUNT, null) ?: return null
        val sealed = Base64.decode(raw, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed, 0, IV))
        String(cipher.doFinal(sealed, IV, sealed.size - IV), Charsets.UTF_8)
    } catch (e: Exception) {
        null
    }

    private fun prefs() = context?.getSharedPreferences("sdy.secure", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val ALIAS = "mn.esdy.member.session"
        private const val ACCOUNT = "session_token"
        private const val TRANSFORM = "AES/GCM/NoPadding"
        private const val IV = 12

        fun persistent(context: Context) = TokenStore(context.applicationContext, inMemory = false)
        /** Tests and fixture mode use an in-memory store so the real one is untouched. */
        fun inMemory() = TokenStore(null, inMemory = true)
    }
}

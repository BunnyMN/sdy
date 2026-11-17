import java.util.Properties

plugins {
    id("com.android.application")
    kotlin("android")
    kotlin("plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Upload key for Google Play — keystore.properties (gitignored) next to this
// project: storeFile, storePassword, keyAlias, keyPassword. Without it a
// release package (assembleRelease / bundleRelease) stops with an error
// instead of quietly producing an unsigned build that Play would refuse.
// Debug builds and the release compile/R8 steps (e.g. :app:minifyReleaseWithR8)
// do not need it.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val hasUploadKey = keystoreProps.getProperty("storeFile") != null

// Same marketing version as the iOS app. The Play build number is derived
// from it — MMmmpp then a two-digit upload counter: 1.1.1 → 1010101 — so a new
// versionName always outranks the last one. Upload the same versionName
// again (a fixed build)? Bump `androidBuild`; set it back to 1 with a new versionName.
val appVersion = "1.1.1"
val androidBuild = 1
val derivedVersionCode = appVersion.split(".").map(String::toInt).let { (major, minor, patch) ->
    ((major * 100 + minor) * 100 + patch) * 100 + androidBuild
}

android {
    namespace = "mn.esdy.member"
    compileSdk = 36

    defaultConfig {
        applicationId = "mn.esdy.member"
        minSdk = 26
        targetSdk = 36
        versionCode = derivedVersionCode
        versionName = appVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (hasUploadKey) {
            create("upload") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("upload")?.let { signingConfig = it }
        }
    }

    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isReturnDefaultValues = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

// Packaging a release (APK or bundle) without the upload key fails loudly.
tasks.matching { it.name in setOf("packageRelease", "signReleaseBundle", "packageReleaseBundle") }.configureEach {
    doFirst {
        if (!hasUploadKey) {
            throw GradleException(
                "Release signing is not configured: native-apps/sdy-android/keystore.properties is missing " +
                    "(storeFile, storePassword, keyAlias, keyPassword). See README.md → «Google Play руу гаргах». " +
                    "Debug builds (assembleDebug) do not need it.",
            )
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-compose:1.12.3")
    implementation(platform("androidx.compose:compose-bom:2026.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.exifinterface:exifinterface:1.4.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    // Check-in QR: CameraX preview + ML Kit's bundled barcode model (works offline, no Play services download).
    implementation("androidx.camera:camera-camera2:1.4.2")
    implementation("androidx.camera:camera-lifecycle:1.4.2")
    implementation("androidx.camera:camera-view:1.4.2")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    // Organiser's check-in QR (CheckinQRView)
    implementation("com.google.zxing:core:3.5.3")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}

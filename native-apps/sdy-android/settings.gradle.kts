// E-sdy — SDY-ийн гишүүдэд зориулсан native Android апп (Jetpack Compose).
// iOS апп (native-apps/sdy-ios)-тай нэг backend, нэг дизайн, нэг үйлдэл.
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "SDYMember"
include(":app")

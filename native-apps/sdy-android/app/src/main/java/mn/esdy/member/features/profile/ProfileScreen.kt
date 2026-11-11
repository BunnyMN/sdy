package mn.esdy.member.features.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.Balance
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.Brush
import androidx.compose.material.icons.rounded.Business
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.EmojiEvents
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PanTool
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.QuestionMark
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Stars
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import mn.esdy.member.app.HomeRoute
import mn.esdy.member.app.LocalApp
import mn.esdy.member.app.LocalNav
import mn.esdy.member.app.Route
import mn.esdy.member.core.AppConfig
import mn.esdy.member.design.ActionSheet
import mn.esdy.member.design.GlassCircleButton
import mn.esdy.member.design.GlassFill
import mn.esdy.member.design.HeroScaffold
import mn.esdy.member.design.IconRow
import mn.esdy.member.design.Labels
import mn.esdy.member.design.HeroOfflineBanner
import mn.esdy.member.design.RowDivider
import mn.esdy.member.design.RowGroup
import mn.esdy.member.design.SdyType
import mn.esdy.member.design.ShrinkText
import mn.esdy.member.design.SheetAction
import mn.esdy.member.design.Theme
import mn.esdy.member.design.pressable
import mn.esdy.member.design.rise
import mn.esdy.member.models.Permission
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val context = LocalContext.current
    var confirmLogout by remember { mutableStateOf(false) }
    fun go(route: HomeRoute) = nav.push(Route.Home(route))

    // "Батболд Ганзориг" → "Б. ГАНЗОРИГ".
    val cardName = run {
        val name = app.me?.name ?: ""
        val parts = name.split(" ").filter { it.isNotEmpty() }
        if (parts.size >= 2) "${parts[0].first()}. ${parts[1]}".uppercase() else (app.me?.name ?: "—").uppercase()
    }

    Column(Modifier.fillMaxSize()) {
        HeroOfflineBanner()
        HeroScaffold(
            heroHeight = 420.dp,
            compact = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AvatarView(32.dp)
                    Text(cardName, style = SdyType.headline, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            },
            pinned = {
                Row(Modifier.fillMaxWidth()) {
                    GlassCircleButton(Icons.Rounded.Notifications, "Мэдэгдэл", dot = app.unreadCount > 0) { go(HomeRoute.Notifications) }
                    Spacer(Modifier.weight(1f))
                    GlassCircleButton(Icons.Rounded.PowerSettingsNew, "Гарах") { confirmLogout = true }
                }
            },
            header = {
                Column(Modifier.fillMaxSize().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    // Room for the pinned round buttons, drawn by HeroScaffold.
                    Spacer(Modifier.height(120.dp))
                    Spacer(Modifier.weight(1f))
                    EditableAvatar()
                    ShrinkText(cardName, SdyType.title2, Color.White, Modifier.padding(top = 18.dp, start = 20.dp, end = 20.dp))
                    val branch = app.record?.approvedBranch
                    if (branch != null) {
                        Labels.position(branch.position)?.let { position ->
                            Row(
                                Modifier.padding(top = 10.dp)
                                    .background(GlassFill, CircleShape)
                                    .border(1.dp, Color.White.copy(alpha = 0.18f), CircleShape)
                                    .padding(horizontal = 14.dp, vertical = 7.dp)
                                    .semantics(mergeDescendants = true) { contentDescription = "Албан тушаал: $position" },
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(Icons.Rounded.Stars, null, tint = Color.White, modifier = Modifier.size(16.dp))
                                Text(position, style = SdyType.subheadline.copy(fontWeight = FontWeight.SemiBold), color = Color.White)
                            }
                        }
                        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Rounded.Business, null, tint = Color.White.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                            Text(branch.name, style = SdyType.subheadline, color = Color.White.copy(alpha = 0.7f))
                        }
                    } else {
                        val email = app.me?.email
                        if (!email.isNullOrEmpty()) Text(email, style = SdyType.subheadline, color = Color.White.copy(alpha = 0.7f), modifier = Modifier.padding(top = 6.dp))
                    }
                    Spacer(Modifier.height(56.dp))
                }
            },
        ) {
            if (app.hasApprovedBranch) {
                Row(Modifier.fillMaxWidth().rise(0), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Tile("Ирц ба оноо", Icons.Rounded.Star, Modifier.weight(1f)) { go(HomeRoute.Participation) }
                    Tile("Тэргүүлэгчид", Icons.Rounded.EmojiEvents, Modifier.weight(1f)) { go(HomeRoute.Leaderboard) }
                }
            }

            RowGroup(Modifier.rise(1)) {
                IconRow("Миний гишүүнчлэл", Icons.Rounded.Badge) { go(HomeRoute.Record) }
                RowDivider()
                IconRow("Харьяалал шилжүүлэх", Icons.Rounded.SwapHoriz) { go(HomeRoute.Transfers) }
                RowDivider()
                IconRow("Мэдэгдэл", Icons.Rounded.Notifications, trailing = if (app.unreadCount > 0) "${app.unreadCount}" else null) { go(HomeRoute.Notifications) }
                if (app.hasApprovedBranch) {
                    RowDivider()
                    IconRow("Миний оролцоо, төлөлтийн түүх", Icons.Rounded.History) { go(HomeRoute.History) }
                }
            }

            val members = app.can(Permission.manageMembers)
            val finance = app.can(Permission.finance)
            val discipline = app.can(Permission.discipline)
            if (app.hasApprovedBranch && (members || discipline || finance)) {
                RowGroup(Modifier.rise(1)) {
                    if (members) IconRow("Гишүүд ба албан тушаал", Icons.Rounded.Groups) { go(HomeRoute.ManageMembers) }
                    if (finance) {
                        if (members) RowDivider()
                        IconRow("Санхүү", Icons.Rounded.Payments) { go(HomeRoute.Finance) }
                    }
                    if (discipline) {
                        if (members || finance) RowDivider()
                        IconRow("Хяналтын хороо", Icons.Rounded.Balance) { go(HomeRoute.Sanctions) }
                    }
                }
            }

            RowGroup(Modifier.rise(2)) {
                IconRow("Нууцлалын бодлого", Icons.Rounded.PanTool) { openURL(context, AppConfig.privacyURL) }
                RowDivider()
                IconRow("Тусламж, холбоо барих", Icons.Rounded.QuestionMark) { openURL(context, AppConfig.supportURL) }
                RowDivider()
                IconRow("Өнгө төрх", Icons.Rounded.Brush) { go(HomeRoute.Appearance) }
                RowDivider()
                IconRow("Блоклосон гишүүд", Icons.Rounded.Block) { go(HomeRoute.Blocked) }
                RowDivider()
                IconRow("Апп-ын тухай", Icons.Rounded.Info) { go(HomeRoute.About) }
            }

            RowGroup(Modifier.rise(3)) {
                IconRow("Гарах", Icons.AutoMirrored.Rounded.Logout, chevron = false) { confirmLogout = true }
                RowDivider()
                IconRow("Бүртгэл устгах", Icons.Rounded.Delete, tint = Color.White, tile = Theme.danger) { go(HomeRoute.DeleteAccount) }
            }
        }
    }

    if (confirmLogout) {
        ActionSheet(
            title = "Гарах уу?",
            message = "Дараа нь eID Mongolia-аар дахин нэвтэрнэ.",
            actions = listOf(SheetAction("Гарах", destructive = true) { app.scope.launch { app.signOut() } }),
            onDismiss = { confirmLogout = false },
        )
    }
}

/** A square card with a red icon tile and a title (Ирц ба оноо, Тэргүүлэгчид). */
@Composable
private fun Tile(title: String, icon: ImageVector, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier.pressable(onClick = onClick)
            .background(Theme.card, RoundedCornerShape(24.dp))
            .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(24.dp))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Box(
            Modifier.size(48.dp).background(Brush.verticalGradient(listOf(Theme.brandRed, Theme.brandRed.copy(alpha = 0.7f))), RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = Color.White, modifier = Modifier.size(24.dp)) }
        Text(title, style = SdyType.body.copy(fontWeight = FontWeight.SemiBold), color = Color.White, modifier = Modifier.fillMaxWidth())
    }
}

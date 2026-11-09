package mn.esdy.member.app

import androidx.compose.runtime.Composable
import mn.esdy.member.features.events.EventDetailScreen
import mn.esdy.member.features.home.JoinRequestScreen
import mn.esdy.member.features.home.NotificationsScreen
import mn.esdy.member.features.home.TransfersScreen
import mn.esdy.member.features.manage.FinanceAdminScreen
import mn.esdy.member.features.manage.MembersAdminScreen
import mn.esdy.member.features.manage.SanctionsAdminScreen
import mn.esdy.member.features.profile.AboutScreen
import mn.esdy.member.features.profile.BlockedMembersScreen
import mn.esdy.member.features.profile.DeleteAccountScreen
import mn.esdy.member.features.profile.LeaderboardScreen
import mn.esdy.member.features.profile.MemberRecordScreen
import mn.esdy.member.features.profile.ParticipationScreen
import mn.esdy.member.features.profile.PersonalHistoryScreen
import mn.esdy.member.features.profile.ThemePickerScreen

/** Where each route leads (iOS HomeRoute.destination and the events stack). */
@Composable
fun RouteContent(route: Route) {
    when (route) {
        is Route.Event -> EventDetailScreen(eventId = route.id)
        is Route.Screen -> route.content()
        is Route.Home -> when (route.route) {
            HomeRoute.Notifications -> NotificationsScreen()
            HomeRoute.Transfers -> TransfersScreen()
            HomeRoute.Record -> MemberRecordScreen()
            HomeRoute.Participation -> ParticipationScreen()
            HomeRoute.Leaderboard -> LeaderboardScreen()
            HomeRoute.History -> PersonalHistoryScreen()
            HomeRoute.About -> AboutScreen()
            HomeRoute.DeleteAccount -> DeleteAccountScreen()
            HomeRoute.JoinRequest -> JoinRequestScreen()
            HomeRoute.Appearance -> ThemePickerScreen()
            HomeRoute.Blocked -> BlockedMembersScreen()
            HomeRoute.ManageMembers -> MembersAdminScreen()
            HomeRoute.Sanctions -> SanctionsAdminScreen()
            HomeRoute.Finance -> FinanceAdminScreen()
        }
    }
}

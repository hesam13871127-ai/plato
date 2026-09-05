import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/providers/auth_notifier.dart';
import '../../features/auth/presentation/providers/auth_state.dart';
import '../../features/auth/presentation/screens/auth_screen.dart';
import '../../features/chat/presentation/screens/chat_list_screen.dart';
import '../../features/game/presentation/screens/create_room_screen.dart';
import '../../features/game/presentation/screens/game_hub_screen.dart';
import '../../features/game/presentation/screens/game_table_screen.dart';
import '../../features/game/presentation/screens/matchmaking_screen.dart';
import '../../features/game/presentation/screens/open_rooms_screen.dart';
import '../../features/game/presentation/screens/room_lobby_screen.dart';
import '../../features/game/presentation/providers/game_providers.dart';
import '../../features/competitive/presentation/screens/season_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/quests/presentation/screens/quests_screen.dart';
import '../../features/shop/presentation/screens/inventory_screen.dart';
import '../../features/shop/presentation/screens/shop_screen.dart';
import '../../features/shop/presentation/screens/wallet_screen.dart';
import '../../features/splash/presentation/splash_screen.dart';

/// Named routes.
class AppRoutes {
  AppRoutes._();
  static const String splash = '/';
  static const String auth = '/auth';
  static const String home = '/home';
  static const String profile = '/profile';
  static const String shop = '/shop';
  static const String inventory = '/inventory';
  static const String quests = '/quests';
  static const String wallet = '/wallet';
  static const String chat = '/chat';
  static const String season = '/season';

  // Games
  static const String games = '/games';
  static const String rooms = '/rooms';
  static String matchmaking(String gameSlug) => '/matchmaking/$gameSlug';
  static String createRoom(String gameSlug) => '/rooms/create/$gameSlug';
  static String room(String roomId) => '/rooms/$roomId';
  static String game(String sessionId) => '/game/$sessionId';
  static String joinCode(String code) => '/join/$code';
}

final goRouterProvider = Provider<GoRouter>((ref) {
  final notifier = ValueNotifier<AuthState>(const AuthState());

  ref
    ..listen(authNotifierProvider, (previous, next) {
      notifier.value = next;
    })
    ..onDispose(notifier.dispose);

  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: notifier,
    redirect: (context, state) {
      final authState = notifier.value;
      final location = state.matchedLocation;

      if (authState.status == AuthStatus.unknown) {
        return location == AppRoutes.splash ? null : AppRoutes.splash;
      }

      final loggedIn = authState.status == AuthStatus.authenticated;
      final onSplash = location == AppRoutes.splash;
      final onAuth = location == AppRoutes.auth;

      if (onSplash) {
        return loggedIn ? AppRoutes.home : AppRoutes.auth;
      }
      if (!loggedIn && !onAuth) return AppRoutes.auth;
      if (loggedIn && onAuth) return AppRoutes.home;
      return null;
    },
    routes: [
      GoRoute(path: AppRoutes.splash, builder: (_, __) => const SplashScreen()),
      GoRoute(path: AppRoutes.auth, builder: (_, __) => const AuthScreen()),
      GoRoute(path: AppRoutes.home, builder: (_, __) => const HomeScreen()),
      GoRoute(path: AppRoutes.profile, builder: (_, __) => const ProfileScreen()),
      GoRoute(path: AppRoutes.shop, builder: (_, __) => const ShopScreen()),
      GoRoute(path: AppRoutes.inventory, builder: (_, __) => const InventoryScreen()),
      GoRoute(path: AppRoutes.quests, builder: (_, __) => const QuestsScreen()),
      GoRoute(path: AppRoutes.season, builder: (_, __) => const SeasonScreen()),
      GoRoute(path: AppRoutes.wallet, builder: (_, __) => const WalletScreen()),
      GoRoute(path: AppRoutes.chat, builder: (_, __) => const ChatListScreen()),

      // Games
      GoRoute(path: AppRoutes.games, builder: (_, __) => const GameHubScreen()),
      GoRoute(path: AppRoutes.rooms, builder: (_, __) => const OpenRoomsScreen()),
      GoRoute(
        path: '/matchmaking/:gameSlug',
        builder: (_, state) => MatchmakingScreen(
          gameSlug: state.pathParameters['gameSlug']!,
          isRanked: state.uri.queryParameters['ranked'] == 'true',
        ),
      ),
      GoRoute(
        path: '/rooms/create/:gameSlug',
        builder: (_, state) =>
            CreateRoomScreen(gameSlug: state.pathParameters['gameSlug']!),
      ),
      GoRoute(
        path: '/join/:code',
        builder: (_, state) => _JoinByCodeScreen(code: state.pathParameters['code']!),
      ),
      GoRoute(
        path: '/rooms/:id',
        builder: (_, state) => RoomLobbyScreen(roomId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/game/:sessionId',
        builder: (_, state) => GameTableScreen(sessionId: state.pathParameters['sessionId']!),
      ),
    ],
  );
});

/// Redirect target for an invite link: joins by code then opens the lobby.
class _JoinByCodeScreen extends ConsumerStatefulWidget {
  const _JoinByCodeScreen({required this.code});
  final String code;

  @override
  ConsumerState<_JoinByCodeScreen> createState() => _JoinByCodeScreenState();
}

class _JoinByCodeScreenState extends ConsumerState<_JoinByCodeScreen> {
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _join());
  }

  Future<void> _join() async {
    // Imported lazily to keep the router file free of feature providers.
    final repo = ref.read(gameRepositoryProvider);
    final result = await repo.joinRoom(accessCode: widget.code.toUpperCase());
    if (!mounted) return;
    result.fold(
      (failure) {
        setState(() => _error = failure.message);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failure.message)));
        context.go('/games');
      },
      (room) => context.go('/rooms/${room.id}'),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFF0B1426),
      body: Center(child: CircularProgressIndicator(color: Color(0xFF00E5FF))),
    );
  }
}

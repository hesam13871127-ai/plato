import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_endpoints.dart';
import '../../../core/network/dio_client.dart';

// ── View models ────────────────────────────────────────────────────────────

class AdminOverview {
  AdminOverview({
    required this.totalUsers,
    required this.activeUsers,
    required this.activeGames,
    required this.matchesTotal,
    required this.matchesToday,
    required this.coinsInCirculation,
    required this.pipsInCirculation,
    required this.openReports,
    required this.matchesByDay,
    required this.topGames,
  });

  final int totalUsers;
  final int activeUsers;
  final int activeGames;
  final int matchesTotal;
  final int matchesToday;
  final int coinsInCirculation;
  final int pipsInCirculation;
  final int openReports;
  final List<Map<String, dynamic>> matchesByDay;
  final List<Map<String, dynamic>> topGames;

  factory AdminOverview.fromJson(Map<String, dynamic> json) {
    int n(dynamic v) => (v as num?)?.toInt() ?? 0;
    List<Map<String, dynamic>> list(dynamic v) =>
        (v as List? ?? const []).whereType<Map<String, dynamic>>().toList();
    return AdminOverview(
      totalUsers: n(json['users']?['total']),
      activeUsers: n(json['users']?['active7d']),
      activeGames: n(json['games']?['active']),
      matchesTotal: n(json['matches']?['total']),
      matchesToday: n(json['matches']?['today']),
      coinsInCirculation: n(json['economy']?['coinsInCirculation']),
      pipsInCirculation: n(json['economy']?['pipsInCirculation']),
      openReports: n(json['moderation']?['openReports']),
      matchesByDay: list(json['matchesByDay']),
      topGames: list(json['topGames']),
    );
  }
}

class AdminUser {
  AdminUser({
    required this.id,
    required this.username,
    required this.displayName,
    required this.email,
    required this.phone,
    required this.status,
    required this.role,
    required this.coins,
    required this.pips,
    required this.gamesPlayed,
  });

  final String id;
  final String username;
  final String displayName;
  final String? email;
  final String? phone;
  final String status;
  final String role;
  final int coins;
  final int pips;
  final int gamesPlayed;

  factory AdminUser.fromJson(Map<String, dynamic> json) {
    int n(dynamic v) => (v as num?)?.toInt() ?? 0;
    return AdminUser(
      id: json['id']?.toString() ?? '',
      username: json['username']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '',
      email: json['email']?.toString(),
      phone: json['phone']?.toString(),
      status: json['status']?.toString() ?? 'active',
      role: json['role']?.toString() ?? 'player',
      coins: n(json['coins']),
      pips: n(json['pips']),
      gamesPlayed: n(json['gamesPlayed']),
    );
  }
}

class AdminShopItem {
  AdminShopItem({
    required this.id,
    required this.name,
    required this.type,
    required this.price,
    required this.currency,
    required this.isAvailable,
    required this.rarity,
  });

  final String id;
  final String name;
  final String type;
  final int price;
  final String currency;
  final bool isAvailable;
  final String rarity;

  factory AdminShopItem.fromJson(Map<String, dynamic> json) => AdminShopItem(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        type: json['type']?.toString() ?? '',
        price: (json['price'] as num?)?.toInt() ?? 0,
        currency: json['currency']?.toString() ?? 'coins',
        isAvailable: json['isAvailable'] == true,
        rarity: json['rarity']?.toString() ?? 'common',
      );
}

class AdminGame {
  AdminGame({
    required this.slug,
    required this.name,
    required this.status,
    required this.minPlayers,
    required this.maxPlayers,
    required this.supportsBots,
    required this.rankedEnabled,
  });

  final String slug;
  final String name;
  final String status;
  final int minPlayers;
  final int maxPlayers;
  final bool supportsBots;
  final bool rankedEnabled;

  factory AdminGame.fromJson(Map<String, dynamic> json) => AdminGame(
        slug: json['slug']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        status: json['status']?.toString() ?? 'active',
        minPlayers: (json['minPlayers'] as num?)?.toInt() ?? 2,
        maxPlayers: (json['maxPlayers'] as num?)?.toInt() ?? 6,
        supportsBots: json['supportsBots'] == true,
        rankedEnabled: json['rankedEnabled'] == true,
      );
}

///
/// Data layer for the full admin panel. All endpoints are admin-only on the
/// server (RolesGuard); this class only marshals requests/responses.
///
class AdminRemoteDataSource {
  AdminRemoteDataSource(this._dio);
  final Dio _dio;

  Future<AdminOverview> overview() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.adminOverview);
    return AdminOverview.fromJson((res.data?['data'] as Map?)?.cast<String, dynamic>() ?? const {});
  }

  Future<List<AdminUser>> users({String? search}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      ApiEndpoints.adminUsers,
      queryParameters: search == null || search.isEmpty ? null : {'search': search},
    );
    final items = ((res.data?['data'] as Map?)?['items'] as List?) ?? const [];
    return items.whereType<Map<String, dynamic>>().map(AdminUser.fromJson).toList();
  }

  Future<void> setUserStatus(String userId, String status) async {
    await _dio.patch<dynamic>(ApiEndpoints.adminUser(userId), data: {'status': status});
  }

  Future<void> setUserRole(String userId, String role) async {
    await _dio.patch<dynamic>(ApiEndpoints.adminUser(userId), data: {'role': role});
  }

  Future<void> banUser({required String userId, required String type, int? durationMinutes, String? reason}) async {
    await _dio.post<dynamic>(ApiEndpoints.adminBanUser, data: {
      'userId': userId,
      'type': type,
      if (durationMinutes != null) 'durationMinutes': durationMinutes,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    });
  }

  Future<void> liftBan(String userId) async {
    await _dio.post<dynamic>(ApiEndpoints.adminLiftBan, data: {'userId': userId});
  }

  Future<void> grantCurrency({required String userId, required String currency, required int amount, String? reason}) async {
    await _dio.post<dynamic>(ApiEndpoints.adminGrantCurrency, data: {
      'userId': userId,
      'currency': currency,
      'amount': amount,
      if (reason != null && reason.isNotEmpty) 'reason': reason,
    });
  }

  Future<List<AdminShopItem>> shopItems() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.adminShopItems);
    final items = (res.data?['data'] as List?) ?? const [];
    return items.whereType<Map<String, dynamic>>().map(AdminShopItem.fromJson).toList();
  }

  Future<void> upsertShopItem(Map<String, dynamic> body) async {
    await _dio.post<dynamic>(ApiEndpoints.adminShopItems, data: body);
  }

  Future<void> deleteShopItem(String itemId) async {
    await _dio.delete<dynamic>(ApiEndpoints.adminShopItem(itemId));
  }

  Future<List<AdminGame>> games() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.adminGames);
    final items = (res.data?['data'] as List?) ?? const [];
    return items.whereType<Map<String, dynamic>>().map(AdminGame.fromJson).toList();
  }

  Future<void> setGameStatus(String slug, String status) async {
    await _dio.post<dynamic>(ApiEndpoints.adminGameStatus, data: {'slug': slug, 'status': status});
  }

  Future<void> upsertGamePlaceholder(String slug, String name) async {
    await _dio.post<dynamic>(ApiEndpoints.adminGames, data: {
      'slug': slug,
      'name': name,
      'status': 'coming_soon',
    });
  }

  Future<List<Map<String, dynamic>>> seasons() async {
    final res = await _dio.get<Map<String, dynamic>>(ApiEndpoints.adminSeasons);
    final items = (res.data?['data'] as List?) ?? const [];
    return items.whereType<Map<String, dynamic>>().toList();
  }

  Future<void> rolloverSeason() async {
    await _dio.post<dynamic>(ApiEndpoints.adminSeasonRollover, data: {});
  }
}

final adminRemoteDataSourceProvider = Provider<AdminRemoteDataSource>((ref) {
  return AdminRemoteDataSource(ref.watch(dioClientProvider).dio);
});

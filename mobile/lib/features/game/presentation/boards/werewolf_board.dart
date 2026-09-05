import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Werewolf: live social deduction. At night wolves pick a victim (and the
/// seer checks a player); by day everyone discusses and votes to lynch. Roles
/// are hidden except your own (and your wolf mates'). The server drives timers.
class WerewolfBoard extends StatefulWidget {
  const WerewolfBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<WerewolfBoard> createState() => _WerewolfBoardState();
}

class _WerewolfBoardState extends State<WerewolfBoard> {
  Timer? _t;
  int _now = DateTime.now().millisecondsSinceEpoch;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(milliseconds: 300), (_) {
      if (mounted) setState(() => _now = DateTime.now().millisecondsSinceEpoch);
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  Map<String, dynamic> get b => widget.session.board;

  List<Map<String, dynamic>> get _players =>
      ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  @override
  Widget build(BuildContext context) {
    final phase = (b['phase'] as String?) ?? 'day_discuss';
    final day = (b['day'] as num?)?.toInt() ?? 1;
    final myRole = b['myRole'] as String?;
    final players = _players;
    final votes = ((b['votes'] as Map?) ?? const {}).map((k, v) => MapEntry(int.tryParse('$k') ?? -1, (v as num).toInt()));
    final log = ((b['log'] as List?) ?? const []).whereType<String>().toList();
    final endsAt = DateTime.tryParse((b['phaseEndsAt'] as String?) ?? '')?.millisecondsSinceEpoch;
    final remain = ((endsAt ?? _now) - _now) / 1000;

    final isNight = phase == 'night_kill' || phase == 'night_seer';
    final iAmWolf = myRole == 'werewolf';
    final iAmSeer = myRole == 'seer';
    final me = widget.mySeat >= 0 && widget.mySeat < players.length ? players[widget.mySeat] : null;
    final iAlive = me?['alive'] == true;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isCompleted
              ? 'Game over'
              : isNight
                  ? '🌙 Night $day — eyes closed'
                  : phase == 'day_vote'
                      ? '☀️ Day $day — vote to lynch!'
                      : '☀️ Day $day — discuss',
          highlight: widget.session.isInProgress,
          icon: isNight ? Icons.nightlight_round : Icons.wb_sunny,
        ),
        const SizedBox(height: 6),
        if (myRole != null)
          Text('Your role: ${_roleLabel(myRole)}',
              style: TextStyle(
                  color: iAmWolf ? AppColors.danger : AppColors.softCyan,
                  fontWeight: FontWeight.bold)),
        if (widget.session.isInProgress)
          Text('${remain.clamp(0, 99).toStringAsFixed(0)}s left',
              style: const TextStyle(color: AppColors.warning, fontSize: 12)),
        const SizedBox(height: 10),
        TableSurface(
          child: Column(
            children: [
              GridView.count(
                crossAxisCount: 4,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 0.95,
                children: [
                  for (var i = 0; i < players.length; i++)
                    _PlayerCard(
                      name: i == widget.mySeat ? 'You' : widget.session.seats[i].displayName,
                      alive: players[i]['alive'] == true,
                      role: players[i]['role'] as String?,
                      votes: votes.values.where((v) => v == i).length,
                      showVotes: phase == 'day_vote',
                      isMe: i == widget.mySeat,
                      onTap: iAlive && widget.session.isInProgress
                          ? () => _onPlayerTap(i, phase, iAmWolf, iAmSeer, players)
                          : null,
                    ),
                ],
              ),
              const SizedBox(height: 10),
              Container(
                constraints: const BoxConstraints(maxHeight: 90),
                width: double.infinity,
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                    color: AppColors.glassFill, borderRadius: BorderRadius.circular(12)),
                child: ListView(
                  reverse: true,
                  children: [
                    for (final line in log.reversed)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 1),
                        child: Text(line,
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _onPlayerTap(int target, String phase, bool iAmWolf, bool iAmSeer, List<Map<String, dynamic>> players) {
    if (target == widget.mySeat) return;
    if (players[target]['alive'] != true) return;
    if (phase == 'night_kill' && iAmWolf) {
      GameFeedback.hit();
      widget.onAction('kill', {'target': target});
    } else if (phase == 'night_seer' && iAmSeer) {
      GameFeedback.tap();
      widget.onAction('seer_check', {'target': target});
    } else if (phase == 'day_vote') {
      GameFeedback.tap();
      widget.onAction('vote', {'target': target});
    }
  }

  String _roleLabel(String r) => r == 'werewolf'
      ? '🐺 Werewolf'
      : r == 'seer'
          ? '🔮 Seer'
          : '🧑‍🌾 Villager';
}

class _PlayerCard extends StatelessWidget {
  const _PlayerCard({
    required this.name,
    required this.alive,
    required this.role,
    required this.votes,
    required this.showVotes,
    required this.isMe,
    required this.onTap,
  });

  final String name;
  final bool alive;
  final String? role;
  final int votes;
  final bool showVotes;
  final bool isMe;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedOpacity(
        opacity: alive ? 1 : 0.35,
        duration: const Duration(milliseconds: 300),
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: isMe ? AppColors.electricPurple.withOpacity(0.3) : AppColors.glassFill,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: alive ? AppColors.glassStroke : AppColors.danger.withOpacity(0.5)),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(alive ? Icons.person : Icons.skull,
                  size: 26, color: alive ? AppColors.softCyan : AppColors.textMuted),
              const SizedBox(height: 4),
              Text(name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w600)),
              if (role != null)
                Text(role == 'werewolf' ? '🐺' : role == 'seer' ? '🔮' : '🧑‍🌾',
                    style: const TextStyle(fontSize: 12)),
              if (showVotes && votes > 0)
                Text('$votes vote${votes > 1 ? 's' : ''}',
                    style: const TextStyle(color: AppColors.warning, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Sea Battle (Battleship). Placement: your fleet is auto-arranged — shuffle
/// until you like it, then lock in. Battle: tap the enemy ocean to fire; a hit
/// lets you fire again. Your own ocean is shown small underneath with the
/// enemy's shots on it. The enemy fleet never reaches the client.
class SeaBattleBoard extends StatelessWidget {
  const SeaBattleBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  Map<String, dynamic> get b => session.board;

  static const _size = 10;

  List<List<int>> _shots(int seat) {
    final oceans = (b['oceans'] as List?) ?? const [];
    if (seat < 0 || seat >= oceans.length) return const [];
    final raw = ((oceans[seat] as Map)['shots'] as List?) ?? const [];
    return raw.map((row) => (row as List).map((v) => (v as num?)?.toInt() ?? 0).toList()).toList();
  }

  int _shipsLeft(int seat) {
    final oceans = (b['oceans'] as List?) ?? const [];
    if (seat < 0 || seat >= oceans.length) return 0;
    return ((oceans[seat] as Map)['shipsLeft'] as num?)?.toInt() ?? 0;
  }

  List<List<int>> _myShipCells() {
    final ships = (b['myShips'] as List?) ?? const [];
    final cells = <List<int>>[];
    for (final ship in ships.whereType<Map>()) {
      for (final cell in (ship['cells'] as List? ?? const []).whereType<List>()) {
        cells.add([(cell[0] as num).toInt(), (cell[1] as num).toInt()]);
      }
    }
    return cells;
  }

  @override
  Widget build(BuildContext context) {
    final phase = (b['phase'] as String?) ?? 'placing';
    final placing = phase == 'placing';
    final ready = ((b['ready'] as List?) ?? const []).whereType<bool>().toList();
    final iAmReady = mySeat >= 0 && mySeat < ready.length && ready[mySeat];
    final opponent = mySeat == 0 ? 1 : 0;
    final myTurn = session.isInProgress && !placing && session.currentSeat == mySeat;
    final playground = TableSkins.playgroundFor(session, mySeat);
    final last = b['lastShot'] as Map?;
    final myCells = _myShipCells();
    final spectator = mySeat < 0;

    final status = !session.isInProgress
        ? 'Game over'
        : placing
            ? (spectator
                ? 'Captains are placing their fleets…'
                : iAmReady
                    ? 'Waiting for the enemy admiral…'
                    : 'Arrange your fleet, then lock in')
            : myTurn
                ? (last != null && last['seat'] == mySeat && last['result'] != 'miss' ? 'Hit! Fire again' : 'Your shot — tap the enemy ocean')
                : 'Enemy is aiming…';

    return Column(
      children: [
        TurnIndicator(text: status, highlight: myTurn || (placing && !iAmReady && !spectator), icon: Icons.sailing_rounded),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _FleetStatus(label: spectator ? session.seats[0].displayName : 'Your fleet', ships: _shipsLeft(spectator ? 0 : mySeat), color: playground.accent),
              _FleetStatus(label: spectator ? (session.seats.length > 1 ? session.seats[1].displayName : 'Enemy') : 'Enemy fleet', ships: _shipsLeft(spectator ? 1 : opponent), color: AppColors.coral),
            ],
          ),
        ),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(10),
          child: placing && !spectator
              ? _Ocean(
                  shots: _shots(mySeat),
                  ships: myCells,
                  size: _size,
                  playground: playground,
                  showShips: true,
                  enabled: false,
                  onFire: null,
                  lastShot: null,
                )
              : _Ocean(
                  shots: _shots(spectator ? 1 : opponent),
                  ships: const [],
                  size: _size,
                  playground: playground,
                  showShips: false,
                  enabled: myTurn,
                  lastShot: last != null && last['seat'] == mySeat ? last : null,
                  onFire: (r, c) {
                    GameFeedback.hit();
                    onAction('fire', {'r': r, 'c': c});
                  },
                ),
        ),
        if (placing && !spectator && !iAmReady)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: Row(
              children: [
                ActionButton(
                  label: 'Shuffle',
                  icon: Icons.shuffle_rounded,
                  color: AppColors.surfaceElevated,
                  onPressed: () {
                    GameFeedback.tap();
                    onAction('shuffle', {});
                  },
                ),
                const SizedBox(width: 10),
                ActionButton(
                  label: 'Lock in fleet',
                  icon: Icons.anchor_rounded,
                  onPressed: () {
                    GameFeedback.move();
                    onAction('ready', {});
                  },
                ),
              ],
            ),
          ),
        if (!placing && !spectator)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Text(
                      'Your ocean\nEnemy shots land here.',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                    ),
                  ),
                ),
                SizedBox(
                  width: 150,
                  height: 150,
                  child: _Ocean(
                    shots: _shots(mySeat),
                    ships: myCells,
                    size: _size,
                    playground: playground,
                    showShips: true,
                    enabled: false,
                    onFire: null,
                    lastShot: last != null && last['seat'] != mySeat ? last : null,
                    compact: true,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _FleetStatus extends StatelessWidget {
  const _FleetStatus({required this.label, required this.ships, required this.color});
  final String label;
  final int ships;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text('$label ', style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w700, fontSize: 12)),
        for (var i = 0; i < 5; i++)
          Icon(Icons.directions_boat_filled_rounded, size: 14, color: i < ships ? color : AppColors.textMuted.withValues(alpha: 0.4)),
      ],
    );
  }
}

class _Ocean extends StatelessWidget {
  const _Ocean({
    required this.shots,
    required this.ships,
    required this.size,
    required this.playground,
    required this.showShips,
    required this.enabled,
    required this.onFire,
    required this.lastShot,
    this.compact = false,
  });

  final List<List<int>> shots;
  final List<List<int>> ships;
  final int size;
  final PlaygroundSkin playground;
  final bool showShips;
  final bool enabled;
  final void Function(int r, int c)? onFire;
  final Map? lastShot;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final shipSet = <String>{for (final s in ships) '${s[0]}:${s[1]}'};
    final lastR = (lastShot?['r'] as num?)?.toInt();
    final lastC = (lastShot?['c'] as num?)?.toInt();
    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(compact ? 8 : 12),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0E3A5E), Color(0xFF071F36)],
          ),
          border: Border.all(color: playground.line),
        ),
        child: Column(
          children: List.generate(size, (r) {
            return Expanded(
              child: Row(
                children: List.generate(size, (c) {
                  final shot = r < shots.length && c < shots[r].length ? shots[r][c] : 0;
                  final ship = shipSet.contains('$r:$c');
                  final isLast = lastR == r && lastC == c;
                  return Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: enabled && shot == 0 && onFire != null ? () => onFire!(r, c) : null,
                      child: Container(
                        margin: EdgeInsets.all(compact ? 0.6 : 1.2),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(compact ? 2 : 4),
                          color: ship && showShips
                              ? playground.accent.withValues(alpha: shot >= 2 ? 0.25 : 0.55)
                              : Colors.white.withValues(alpha: 0.05),
                          border: isLast ? Border.all(color: Colors.white, width: compact ? 1 : 1.6) : null,
                        ),
                        child: Center(child: _mark(shot, compact)),
                      ),
                    ),
                  );
                }),
              ),
            );
          }),
        ),
      ),
    );
  }

  Widget? _mark(int shot, bool compact) {
    final s = compact ? 6.0 : 12.0;
    if (shot == 1) {
      return Container(
        width: s * 0.5,
        height: s * 0.5,
        decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.55)),
      );
    }
    if (shot == 2) {
      return Icon(Icons.local_fire_department_rounded, size: s * 1.4, color: AppColors.coral);
    }
    if (shot == 3) {
      return Icon(Icons.close_rounded, size: s * 1.5, color: const Color(0xFFFF3D5A));
    }
    return null;
  }
}

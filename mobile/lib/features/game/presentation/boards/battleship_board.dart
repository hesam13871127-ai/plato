import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

class _ShipSpec {
  const _ShipSpec(this.name, this.size);
  final String name;
  final int size;
}

const _kFleetSpecs = [
  _ShipSpec('Carrier', 5),
  _ShipSpec('Battleship', 4),
  _ShipSpec('Cruiser', 3),
  _ShipSpec('Submarine', 3),
  _ShipSpec('Destroyer', 2),
];

/// A ship as placed on the grid (local draft or confirmed).
class _FleetShip {
  const _FleetShip(this.name, this.size, this.x, this.y, this.horizontal);
  final String name;
  final int size;
  final int x;
  final int y;
  final bool horizontal;

  bool covers(int cx, int cy) {
    for (var i = 0; i < size; i++) {
      final sx = horizontal ? x + i : x;
      final sy = horizontal ? y : y + i;
      if (sx == cx && sy == cy) return true;
    }
    return false;
  }

  Map<String, dynamic> toPayload() => {'name': name, 'size': size, 'x': x, 'y': y, 'horizontal': horizontal};
}

/// Parsed battleship view (your own fleet only — the enemy's is redacted).
class _NavalView {
  _NavalView(Map<String, dynamic> b)
      : phase = (b['phase'] as String?) ?? 'place',
        fleets = _fleets(b['fleets']),
        salvos = _salvos(b['salvos']),
        lastShot = _shot(b['lastShot']),
        sunk = _sunk(b['sunk']),
        enemyRemaining = _nums(b['enemyRemaining']),
        log = _log(b['log']);

  final String phase;
  final List<List<_FleetShip>> fleets;
  final List<List<_Salvo>> salvos;
  final _LastShot? lastShot;
  final List<List<String>> sunk;
  final List<int> enemyRemaining;
  final List<String> log;

  static List<List<_FleetShip>> _fleets(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map(
        (fleet) => fleet.whereType<Map>().map((m) {
          return _FleetShip(
            (m['name'] as String?) ?? '',
            (m['size'] as num?)?.toInt() ?? 0,
            (m['x'] as num?)?.toInt() ?? 0,
            (m['y'] as num?)?.toInt() ?? 0,
            (m['horizontal'] as bool?) ?? false,
          );
        }).toList(),
      )
      .toList();

  static List<List<_Salvo>> _salvos(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map(
        (list) => list.whereType<Map>().map((m) {
          return _Salvo(
            (m['x'] as num?)?.toInt() ?? 0,
            (m['y'] as num?)?.toInt() ?? 0,
            (m['hit'] as bool?) ?? false,
          );
        }).toList(),
      )
      .toList();

  static List<List<String>> _sunk(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map((list) => list.whereType<String>().toList())
      .toList();

  static _LastShot? _shot(Object? raw) {
    if (raw == null) return null;
    final m = raw as Map;
    return _LastShot(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['x'] as num?)?.toInt() ?? 0,
      (m['y'] as num?)?.toInt() ?? 0,
      (m['hit'] as bool?) ?? false,
      (m['sunk'] as String?) ?? '',
    );
  }

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();
}

class _Salvo {
  const _Salvo(this.x, this.y, this.hit);
  final int x;
  final int y;
  final bool hit;
}

class _LastShot {
  const _LastShot(this.seat, this.x, this.y, this.hit, this.sunk);
  final int seat;
  final int x;
  final int y;
  final bool hit;
  final String sunk;
}

/// Battleship, wave-6 board.
///
/// Deploy five ships on your grid (random placement with re-rolls), then tap
/// the target grid to trade salvos until one fleet rests on the seabed.
class BattleshipBoard extends StatefulWidget {
  const BattleshipBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BattleshipBoard> createState() => _BattleshipBoardState();
}

class _BattleshipBoardState extends State<BattleshipBoard> {
  String _skin = 'wood';
  final math.Random _rng = math.Random();
  List<_FleetShip> _draft = const [];
  bool _draftSeeded = false;

  _NavalView get _view => _NavalView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    if (view.phase == 'place' && !_draftSeeded) {
      _draft = _randomFleet();
      _draftSeeded = true;
    }

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.sailing_rounded,
        ),
        const SizedBox(height: 8),
        BoardSkinRow(
          selected: _skin,
          onPick: (id) {
            GameFeedback.tap();
            setState(() => _skin = id);
          },
        ),
        const SizedBox(height: 10),
        TableSurface(
          skin: skin,
          child: view.phase == 'place' ? _placeView(view) : _battleView(view),
        ),
      ],
    );
  }

  // ── placement ─────────────────────────────────────────────────────────────

  Widget _placeView(_NavalView view) {
    final deployed = view.fleets.length > widget.mySeat && view.fleets[widget.mySeat].isNotEmpty;
    return Column(
      children: [
        Text(
          deployed ? 'Fleet deployed — waiting for the enemy…' : 'Lay out your five ships',
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        _grid(
          cellBuilder: (x, y) {
            final covered = _draft.any((s) => s.covers(x, y));
            return Container(
              margin: const EdgeInsets.all(1),
              decoration: BoxDecoration(
                color: covered ? const Color(0xFF64748B) : Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(3),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
            );
          },
        ),
        const SizedBox(height: 10),
        if (!deployed && _myTurn)
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () {
                    GameFeedback.tap();
                    setState(() => _draft = _randomFleet());
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: BorderSide(color: AppColors.softCyan.withValues(alpha: 0.5)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('RE-ROLL', style: TextStyle(fontWeight: FontWeight.w900)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: ElevatedButton(
                  onPressed: _deploy,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.electricPurple,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('DEPLOY FLEET  ⚓', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
                ),
              ),
            ],
          ),
      ],
    );
  }

  Future<void> _deploy() async {
    GameFeedback.tap();
    await widget.onAction('deploy', {
      'fleet': _draft.map((s) => s.toPayload()).toList(),
    });
  }

  // ── battle ────────────────────────────────────────────────────────────────

  Widget _battleView(_NavalView view) {
    final enemy = widget.mySeat == 0 ? 1 : 0;
    final mySalvos = view.salvos.length > widget.mySeat ? view.salvos[widget.mySeat] : const <_Salvo>[];
    final enemySalvos = view.salvos.length > enemy ? view.salvos[enemy] : const <_Salvo>[];
    final myFleet = view.fleets.length > widget.mySeat ? view.fleets[widget.mySeat] : const <_FleetShip>[];
    final enemySunk = view.sunk.length > enemy ? view.sunk[enemy] : const <String>[];
    final mySunk = view.sunk.length > widget.mySeat ? view.sunk[widget.mySeat] : const <String>[];
    final remaining = view.enemyRemaining.length > widget.mySeat ? view.enemyRemaining[widget.mySeat] : 17;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('🎯 TARGET GRID', style: TextStyle(color: AppColors.softCyan, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1)),
            const Spacer(),
            Text('$remaining cells afloat', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 6),
        _grid(
          cellBuilder: (x, y) {
            final salvo = mySalvos.where((s) => s.x == x && s.y == y).toList();
            final known = salvo.isNotEmpty;
            final hit = known && salvo.last.hit;
            return _targetCell(x, y, known, hit);
          },
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            const Text('⚓ YOUR FLEET', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1)),
            const Spacer(),
            if (mySunk.isNotEmpty)
              Flexible(
                child: Text(
                  'lost: ${mySunk.join(', ')}',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.danger, fontSize: 10, fontWeight: FontWeight.w700),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        _grid(
          cellBuilder: (x, y) {
            final ship = myFleet.where((s) => s.covers(x, y)).toList();
            final shot = enemySalvos.where((s) => s.x == x && s.y == y).toList();
            final onShip = ship.isNotEmpty;
            final damaged = onShip && shot.isNotEmpty;
            return Container(
              margin: const EdgeInsets.all(1),
              decoration: BoxDecoration(
                color: damaged
                    ? AppColors.danger
                    : onShip
                        ? const Color(0xFF64748B)
                        : shot.isNotEmpty
                            ? const Color(0xFF16324A)
                            : Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(3),
                border: Border.all(
                  color: onShip ? const Color(0xFF94A3B8) : Colors.white.withValues(alpha: 0.08),
                ),
              ),
              child: shot.isNotEmpty && !onShip
                  ? const Center(child: Icon(Icons.water_drop_rounded, size: 10, color: Color(0xFF3B82F6)))
                  : damaged
                      ? const Center(child: Icon(Icons.local_fire_department_rounded, size: 12, color: Colors.white))
                      : null,
            );
          },
        ),
        if (enemySunk.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                for (final name in enemySunk)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFFD9A94A).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'sunk: $name',
                      style: const TextStyle(color: Color(0xFFD9A94A), fontSize: 10, fontWeight: FontWeight.w800),
                    ),
                  ),
              ],
            ),
          ),
        if (view.log.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              view.log.last,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontStyle: FontStyle.italic),
            ),
          ),
      ],
    );
  }

  Widget _targetCell(int x, int y, bool known, bool hit) {
    final fireable = _myTurn && !known && widget.session.isInProgress;
    return GestureDetector(
      onTap: fireable
          ? () {
              GameFeedback.tap();
              widget.onAction('fire', {'x': x, 'y': y});
            }
          : null,
      child: Container(
        margin: const EdgeInsets.all(1),
        decoration: BoxDecoration(
          color: hit
              ? AppColors.danger.withValues(alpha: 0.8)
              : known
                  ? const Color(0xFF16324A)
                  : fireable
                      ? const Color(0xFF1E293B)
                      : Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(3),
          border: Border.all(
            color: fireable ? AppColors.softCyan.withValues(alpha: 0.35) : Colors.white.withValues(alpha: 0.08),
          ),
        ),
        child: Center(
          child: hit
              ? const Icon(Icons.local_fire_department_rounded, size: 13, color: Colors.white)
              : known
                  ? const Icon(Icons.water_drop_rounded, size: 10, color: Color(0xFF3B82F6))
                  : null,
        ),
      ),
    );
  }

  /// A uniform ten-by-ten grid of square cells.
  Widget _grid({required Widget Function(int x, int y) cellBuilder}) {
    return AspectRatio(
      aspectRatio: 1,
      child: Column(
        children: [
          for (var y = 0; y < 10; y++)
            Expanded(
              child: Row(
                children: [
                  for (var x = 0; x < 10; x++) Expanded(child: cellBuilder(x, y)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── misc ──────────────────────────────────────────────────────────────────

  List<_FleetShip> _randomFleet() {
    for (var attempt = 0; attempt < 200; attempt++) {
      final fleet = <_FleetShip>[];
      var ok = true;
      for (final spec in _kFleetSpecs) {
        var placed = false;
        for (var tries = 0; tries < 60 && !placed; tries++) {
          final horizontal = _rng.nextBool();
          final x = _rng.nextInt(horizontal ? 11 - spec.size : 10);
          final y = _rng.nextInt(horizontal ? 10 : 11 - spec.size);
          if (_fits(fleet, spec.size, x, y, horizontal)) {
            fleet.add(_FleetShip(spec.name, spec.size, x, y, horizontal));
            placed = true;
          }
        }
        if (!placed) {
          ok = false;
          break;
        }
      }
      if (ok) return fleet;
    }
    // Deterministic fallback: tidy rows.
    final fleet = <_FleetShip>[];
    for (var i = 0; i < _kFleetSpecs.length; i++) {
      fleet.add(_FleetShip(_kFleetSpecs[i].name, _kFleetSpecs[i].size, 0, i * 2, true));
    }
    return fleet;
  }

  bool _fits(List<_FleetShip> fleet, int size, int x, int y, bool horizontal) {
    for (var i = 0; i < size; i++) {
      final sx = horizontal ? x + i : x;
      final sy = horizontal ? y : y + i;
      if (fleet.any((s) => s.covers(sx, sy))) return false;
    }
    return true;
  }

  String _statusText(_NavalView view) {
    if (!widget.session.isInProgress) {
      return widget.session.winnerSeat == widget.mySeat ? 'Fleet destroyed — you rule the waves!' : 'Your fleet rests on the seabed…';
    }
    if (view.phase == 'place') return _myTurn ? 'Deploy your fleet' : 'Enemy is deploying…';
    if (!_myTurn) return 'Incoming fire — brace!';
    final last = view.lastShot;
    if (last != null && last.seat == widget.mySeat) {
      if (last.sunk.isNotEmpty) return 'You sank the ${last.sunk}! Keep firing.';
      if (last.hit) return 'Direct hit! Fire again next turn.';
      return 'Splash — adjust your aim';
    }
    return 'Pick a target on the enemy grid';
  }
}

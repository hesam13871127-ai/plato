import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Werewolf — the village sits in a circle around a campfire. The sky shifts
/// between a starry night (wolves hunt, seer peeks) and a warm day (discussion,
/// then voting). Your secret role card flips in at the top; tap a villager to
/// pick a night victim / a seer target / a lynch vote. Vote tallies appear as
/// pips under each player, the countdown ring shows how long the phase lasts,
/// and a story feed narrates the events.
class WerewolfBoard extends StatefulWidget {
  const WerewolfBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<WerewolfBoard> createState() => _WerewolfBoardState();
}

class _Villager {
  _Villager({required this.seat, required this.alive, required this.role});
  final int seat;
  final bool alive;
  final String? role;
}

class _WerewolfBoardState extends State<WerewolfBoard> {
  Timer? _clock;
  int? _picked; // what I chose in the current phase (local echo)
  String? _pickedPhase;
  String? _lastEventKey;
  bool _busy = false;

  Map<String, dynamic> get b => widget.session.board;
  String get _phase => (b['phase'] as String?) ?? 'night_kill';
  bool get _night => _phase.startsWith('night');
  String? get _myRole => b['myRole'] as String?;
  int get _day => (b['day'] as num?)?.toInt() ?? 1;

  List<_Villager> get _players => ((b['players'] as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _Villager(seat: (m['seat'] as num?)?.toInt() ?? 0, alive: m['alive'] != false, role: m['role'] as String?))
      .toList();

  Map<int, int> get _votes {
    final raw = b['votes'];
    final out = <int, int>{};
    if (raw is Map) {
      raw.forEach((k, v) {
        final voter = int.tryParse(k.toString());
        final target = (v as num?)?.toInt();
        if (voter != null && target != null) out[voter] = target;
      });
    }
    return out;
  }

  bool get _iAmAlive {
    final ps = _players;
    return widget.mySeat >= 0 && widget.mySeat < ps.length && ps[widget.mySeat].alive;
  }

  /// What action my tap would send in the current phase, or null when I'm a
  /// bystander in this phase.
  String? get _actionType {
    if (!widget.session.isInProgress || !_iAmAlive) return null;
    if (_phase == 'night_kill' && _myRole == 'werewolf') return 'kill';
    if (_phase == 'night_seer' && _myRole == 'seer') return 'seer_check';
    if (_phase == 'day_vote') return 'vote';
    return null;
  }

  bool get _alreadyActed {
    if (_phase == 'day_vote') return _votes.containsKey(widget.mySeat);
    if (_phase == 'night_kill') return b['killTarget'] != null;
    if (_phase == 'night_seer') return b['seerChecked'] != null;
    return false;
  }

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant WerewolfBoard old) {
    super.didUpdateWidget(old);
    if (_pickedPhase != _phase) {
      _picked = null;
      _pickedPhase = _phase;
    }
    final ev = b['lastEvent'];
    if (ev is Map) {
      final key = '${ev['kind']}-${ev['seat']}-$_day-$_phase';
      if (key != _lastEventKey) {
        _lastEventKey = key;
        if (ev['kind'] == 'attack' || ev['kind'] == 'lynch') GameFeedback.hit();
      }
    }
  }

  Future<void> _tap(int seat) async {
    final type = _actionType;
    if (type == null || _busy || seat == widget.mySeat && type != 'kill') return;
    final ps = _players;
    if (seat >= ps.length || !ps[seat].alive) return;
    if (type == 'kill' && ps[seat].role == 'werewolf') return; // wolves don't eat wolves
    if (type == 'vote' && _alreadyActed) return;
    GameFeedback.tap();
    setState(() {
      _picked = seat;
      _pickedPhase = _phase;
      _busy = true;
    });
    await widget.onAction(type, {'target': seat});
    if (mounted) setState(() => _busy = false);
  }

  double _phaseProgress() {
    final endsRaw = b['phaseEndsAt'] as String?;
    final ms = (b['phaseMs'] as num?)?.toDouble() ?? 10000;
    if (endsRaw == null) return 0;
    final ends = DateTime.tryParse(endsRaw);
    if (ends == null) return 0;
    final left = ends.difference(DateTime.now()).inMilliseconds.toDouble();
    return (left / ms).clamp(0.0, 1.0);
  }

  int _secondsLeft() {
    final endsRaw = b['phaseEndsAt'] as String?;
    final ends = endsRaw == null ? null : DateTime.tryParse(endsRaw);
    if (ends == null) return 0;
    return math.max(0, ends.difference(DateTime.now()).inSeconds);
  }

  @override
  Widget build(BuildContext context) {
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final players = _players;
    final names = ((b['names'] as List?) ?? const []).map((e) => e.toString()).toList();
    final votes = _votes;
    final tally = <int, int>{};
    votes.forEach((_, t) => tally[t] = (tally[t] ?? 0) + 1);
    final wolfCount = (b['wolfCount'] as num?)?.toInt() ?? 1;
    final aliveCount = (b['aliveCount'] as num?)?.toInt() ?? players.where((p) => p.alive).length;
    final actionType = _actionType;
    final acted = _alreadyActed;
    final seerResult = b['seerResult'] is Map ? Map<String, dynamic>.from(b['seerResult'] as Map) : null;
    final lastEvent = b['lastEvent'] is Map ? Map<String, dynamic>.from(b['lastEvent'] as Map) : null;
    final log = ((b['log'] as List?) ?? const []).map((e) => e.toString()).toList();
    final winner = b['winner'] as String?;

    String nameOf(int seat) {
      if (seat >= 0 && seat < names.length && names[seat].isNotEmpty) return names[seat];
      if (seat >= 0 && seat < widget.session.seats.length) return widget.session.seats[seat].displayName;
      return 'Player ${seat + 1}';
    }

    String status;
    IconData icon;
    if (!widget.session.isInProgress) {
      status = winner == 'wolves' ? 'The wolves devoured the village' : (winner == 'village' ? 'The village is safe' : 'Game over');
      icon = winner == 'wolves' ? Icons.dark_mode_rounded : Icons.wb_sunny_rounded;
    } else if (!_iAmAlive) {
      status = 'You are out — watch from the shadows';
      icon = Icons.visibility_off_rounded;
    } else {
      switch (_phase) {
        case 'night_kill':
          status = _myRole == 'werewolf' ? (acted ? 'The pack has chosen…' : 'Wolf — pick tonight\'s victim') : 'Night $_day — the wolves are hunting';
          icon = Icons.nightlight_round;
          break;
        case 'night_seer':
          status = _myRole == 'seer' ? (acted ? 'Your vision forms…' : 'Seer — reveal one player') : 'The seer is peering into souls';
          icon = Icons.remove_red_eye_rounded;
          break;
        case 'day_discuss':
          status = 'Day $_day — discuss in chat who to trust';
          icon = Icons.forum_rounded;
          break;
        case 'day_vote':
          status = acted ? 'Vote cast — waiting for the village' : 'Vote — tap who to lynch';
          icon = Icons.how_to_vote_rounded;
          break;
        default:
          status = 'Night falls…';
          icon = Icons.nightlight_round;
      }
    }

    final skyTop = _night ? const Color(0xFF0B1030) : const Color(0xFF2E6BD6);
    final skyBottom = _night ? const Color(0xFF1B1F4A) : const Color(0xFFF7B267);

    return Column(
      children: [
        TurnIndicator(text: status, highlight: actionType != null && !acted, icon: icon),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: Column(
            children: [
              // Role card + counters.
              Row(
                children: [
                  Expanded(child: _RoleCard(role: _myRole, alive: _iAmAlive)),
                  const SizedBox(width: 8),
                  Column(
                    children: [
                      _Counter(icon: '🐺', label: '$wolfCount wolf${wolfCount == 1 ? '' : 'ves'}', color: AppColors.coral),
                      const SizedBox(height: 6),
                      _Counter(icon: '🧑‍🌾', label: '$aliveCount alive', color: AppColors.softCyan),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
              // Village circle.
              AnimatedContainer(
                duration: const Duration(milliseconds: 700),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [skyTop, skyBottom]),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                ),
                child: AspectRatio(
                  aspectRatio: 1.05,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final w = constraints.maxWidth;
                      final h = constraints.maxHeight;
                      final center = Offset(w / 2, h / 2 + 6);
                      final radius = math.min(w, h) * 0.38;
                      final n = players.length;
                      return Stack(
                        children: [
                          Positioned.fill(child: CustomPaint(painter: _SkyPainter(night: _night, seed: _day))),
                          // Campfire / sun in the middle with the phase countdown ring.
                          Positioned(
                            left: center.dx - 40,
                            top: center.dy - 40,
                            child: _PhaseDial(progress: widget.session.isInProgress ? _phaseProgress() : 0, seconds: _secondsLeft(), night: _night, phase: _phase),
                          ),
                          for (var i = 0; i < n; i++)
                            Builder(
                              builder: (context) {
                                // Put me at the bottom of the circle.
                                final rel = widget.mySeat >= 0 ? (i - widget.mySeat + n) % n : i;
                                final a = math.pi / 2 + rel * 2 * math.pi / n;
                                final pos = center + Offset(math.cos(a) * radius, math.sin(a) * radius * 0.92);
                                final p = players[i];
                                final canTarget = actionType != null &&
                                    !acted &&
                                    p.alive &&
                                    (i != widget.mySeat) &&
                                    !(actionType == 'kill' && p.role == 'werewolf');
                                final myVote = votes[widget.mySeat];
                                final highlighted = (_picked == i && _pickedPhase == _phase) || myVote == i || (b['killTarget'] as num?)?.toInt() == i || (b['seerChecked'] as num?)?.toInt() == i;
                                final isVictim = lastEvent != null && lastEvent['seat'] == i && (lastEvent['kind'] == 'attack' || lastEvent['kind'] == 'lynch');
                                return Positioned(
                                  left: pos.dx - 34,
                                  top: pos.dy - 40,
                                  child: _VillagerChip(
                                    session: widget.session,
                                    seat: i,
                                    name: nameOf(i),
                                    alive: p.alive,
                                    role: p.role,
                                    me: i == widget.mySeat,
                                    votes: tally[i] ?? 0,
                                    highlighted: highlighted,
                                    targetable: canTarget,
                                    victim: isVictim,
                                    seerKnown: seerResult != null && seerResult['target'] == i ? (seerResult['isWolf'] == true) : null,
                                    onTap: canTarget ? () => _tap(i) : null,
                                  ),
                                );
                              },
                            ),
                        ],
                      );
                    },
                  ),
                ),
              ),
              const SizedBox(height: 8),
              // Seer result / event banner.
              if (seerResult != null && _myRole == 'seer')
                _Banner(
                  color: seerResult['isWolf'] == true ? AppColors.coral : AppColors.success,
                  text: '${nameOf((seerResult['target'] as num).toInt())} is ${seerResult['isWolf'] == true ? 'a WEREWOLF 🐺' : 'not a wolf ✅'}',
                )
              else if (lastEvent != null && lastEvent['kind'] != 'none')
                _Banner(
                  color: lastEvent['kind'] == 'attack' ? AppColors.coral : (lastEvent['kind'] == 'lynch' ? AppColors.gold : AppColors.softCyan),
                  text: lastEvent['kind'] == 'attack'
                      ? '${nameOf((lastEvent['seat'] as num).toInt())} was attacked in the night'
                      : lastEvent['kind'] == 'lynch'
                          ? '${nameOf((lastEvent['seat'] as num).toInt())} was lynched — ${_roleLabel(lastEvent['role'] as String?)}'
                          : 'A quiet round — nobody was harmed',
                ),
              const SizedBox(height: 6),
              // Story feed.
              Container(
                height: 84,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)),
                child: ListView.builder(
                  reverse: true,
                  itemCount: log.length,
                  itemBuilder: (context, i) {
                    final line = log[log.length - 1 - i];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text(
                        line,
                        style: TextStyle(color: i == 0 ? AppColors.textPrimary : AppColors.textMuted, fontSize: 11.5, fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w500),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _roleLabel(String? role) {
    switch (role) {
      case 'werewolf':
        return 'a werewolf 🐺';
      case 'seer':
        return 'the seer 🔮';
      case 'villager':
        return 'an innocent villager';
      default:
        return 'unknown';
    }
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _RoleCard extends StatelessWidget {
  const _RoleCard({required this.role, required this.alive});
  final String? role;
  final bool alive;

  @override
  Widget build(BuildContext context) {
    final String title;
    final String emoji;
    final String hint;
    final Color color;
    switch (role) {
      case 'werewolf':
        title = 'Werewolf';
        emoji = '🐺';
        hint = 'Each night pick a victim. By day, blend in.';
        color = AppColors.coral;
        break;
      case 'seer':
        title = 'Seer';
        emoji = '🔮';
        hint = 'Each night learn whether one player is a wolf.';
        color = AppColors.electricPurple;
        break;
      case 'villager':
        title = 'Villager';
        emoji = '🧑‍🌾';
        hint = 'Find the wolves and vote them out by day.';
        color = AppColors.softCyan;
        break;
      default:
        title = 'Spectator';
        emoji = '👀';
        hint = 'Watch the village unravel.';
        color = AppColors.textMuted;
    }
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [color.withValues(alpha: alive ? 0.35 : 0.12), color.withValues(alpha: 0.08)]),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: alive ? 0.9 : 0.4), width: 1.4),
        boxShadow: alive ? [BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 14)] : null,
      ),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 30)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(title.toUpperCase(), style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                    if (!alive) ...[
                      const SizedBox(width: 6),
                      const Text('· eliminated', style: TextStyle(color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w700)),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(hint, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Counter extends StatelessWidget {
  const _Counter({required this.icon, required this.label, required this.color});
  final String icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withValues(alpha: 0.5))),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(icon, style: const TextStyle(fontSize: 14)),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _VillagerChip extends StatelessWidget {
  const _VillagerChip({
    required this.session,
    required this.seat,
    required this.name,
    required this.alive,
    required this.role,
    required this.me,
    required this.votes,
    required this.highlighted,
    required this.targetable,
    required this.victim,
    required this.seerKnown,
    required this.onTap,
  });
  final GameSessionView session;
  final int seat;
  final String name;
  final bool alive;
  final String? role;
  final bool me;
  final int votes;
  final bool highlighted;
  final bool targetable;
  final bool victim;
  final bool? seerKnown;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final ring = highlighted ? AppColors.gold : (targetable ? Colors.white : (me ? palette.light : Colors.white24));
    final emoji = !alive ? '🪦' : (role == 'werewolf' ? '🐺' : (role == 'seer' ? '🔮' : (seerKnown == true ? '🐺' : '🧑‍🌾')));
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 68,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(center: const Alignment(-0.3, -0.3), colors: alive ? [palette.light, palette.base, palette.dark] : [Colors.grey.shade600, Colors.grey.shade800, Colors.black]),
                border: Border.all(color: ring, width: highlighted || targetable ? 2.4 : 1.4),
                boxShadow: [
                  if (targetable || highlighted) BoxShadow(color: ring.withValues(alpha: 0.6), blurRadius: 14),
                  if (victim) BoxShadow(color: AppColors.coral.withValues(alpha: 0.8), blurRadius: 18, spreadRadius: 2),
                ],
              ),
              child: Center(
                child: Opacity(
                  opacity: alive ? 1 : 0.7,
                  child: Text(emoji, style: const TextStyle(fontSize: 22)),
                ),
              ),
            ),
            const SizedBox(height: 3),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(6)),
              child: Text(
                me ? 'You' : name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: alive ? Colors.white : Colors.white54, fontSize: 10, fontWeight: FontWeight.w800, decoration: alive ? null : TextDecoration.lineThrough),
              ),
            ),
            if (votes > 0)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (var i = 0; i < math.min(votes, 6); i++)
                      Container(
                        width: 7,
                        height: 7,
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.gold, boxShadow: [BoxShadow(color: AppColors.gold, blurRadius: 4)]),
                      ),
                    if (votes > 6) const Text(' +', style: TextStyle(color: AppColors.gold, fontSize: 9, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _PhaseDial extends StatelessWidget {
  const _PhaseDial({required this.progress, required this.seconds, required this.night, required this.phase});
  final double progress;
  final int seconds;
  final bool night;
  final String phase;

  @override
  Widget build(BuildContext context) {
    final color = night ? AppColors.electricPurple : AppColors.gold;
    final String emoji;
    switch (phase) {
      case 'night_kill':
        emoji = '🌙';
        break;
      case 'night_seer':
        emoji = '🔮';
        break;
      case 'day_vote':
        emoji = '🗳️';
        break;
      case 'day_discuss':
        emoji = '☀️';
        break;
      default:
        emoji = '🔥';
    }
    return SizedBox(
      width: 80,
      height: 80,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [color.withValues(alpha: 0.5), color.withValues(alpha: 0.05)]),
            ),
          ),
          SizedBox(
            width: 76,
            height: 76,
            child: CircularProgressIndicator(value: progress, strokeWidth: 4, color: color, backgroundColor: Colors.white.withValues(alpha: 0.12)),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(emoji, style: const TextStyle(fontSize: 22)),
              Text('${seconds}s', style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w900)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.color, required this.text});
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      child: Container(
        key: ValueKey(text),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withValues(alpha: 0.7))),
        child: Text(text, textAlign: TextAlign.center, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w800)),
      ),
    );
  }
}

class _SkyPainter extends CustomPainter {
  _SkyPainter({required this.night, required this.seed});
  final bool night;
  final int seed;

  @override
  void paint(Canvas canvas, Size size) {
    final rnd = math.Random(42 + seed);
    if (night) {
      final star = Paint()..color = Colors.white;
      for (var i = 0; i < 60; i++) {
        final p = Offset(rnd.nextDouble() * size.width, rnd.nextDouble() * size.height * 0.7);
        star.color = Colors.white.withValues(alpha: 0.3 + rnd.nextDouble() * 0.7);
        canvas.drawCircle(p, 0.6 + rnd.nextDouble() * 1.2, star);
      }
      // Moon.
      final moon = Offset(size.width * 0.82, size.height * 0.14);
      canvas.drawCircle(moon, 16, Paint()..color = const Color(0xFFFFF4C2).withValues(alpha: 0.25)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12));
      canvas.drawCircle(moon, 11, Paint()..color = const Color(0xFFFFF4C2));
      canvas.drawCircle(moon + const Offset(4, -3), 9, Paint()..color = const Color(0xFF0B1030));
    } else {
      // Clouds.
      final cloud = Paint()..color = Colors.white.withValues(alpha: 0.35);
      for (var i = 0; i < 5; i++) {
        final c = Offset(rnd.nextDouble() * size.width, size.height * (0.08 + rnd.nextDouble() * 0.25));
        canvas.drawCircle(c, 12, cloud);
        canvas.drawCircle(c + const Offset(12, 4), 9, cloud);
        canvas.drawCircle(c + const Offset(-12, 4), 8, cloud);
      }
    }
    // Ground silhouette (huts).
    final ground = Paint()..color = (night ? const Color(0xFF0A0B1E) : const Color(0xFF6B4A2B)).withValues(alpha: 0.75);
    final path = Path()..moveTo(0, size.height);
    path.lineTo(0, size.height * 0.86);
    for (var x = 0.0; x < size.width; x += size.width / 7) {
      path.lineTo(x + size.width / 14, size.height * 0.78);
      path.lineTo(x + size.width / 7, size.height * 0.86);
    }
    path.lineTo(size.width, size.height);
    path.close();
    canvas.drawPath(path, ground);
  }

  @override
  bool shouldRepaint(covariant _SkyPainter old) => old.night != night || old.seed != seed;
}

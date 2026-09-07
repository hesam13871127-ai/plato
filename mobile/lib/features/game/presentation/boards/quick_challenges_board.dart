import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Quick Challenges — six frantic 8-second arcade rounds. Each round type gets
/// its own stage: a giant pulsing TAP button with a fill ring, a reaction
/// traffic light that flips red → green (tap early and you're out), a 2×2
/// number grid where the target is announced, and a d-pad matching a spinning
/// arrow. A "3-2-1" countdown precedes every round, live race bars show every
/// player's progress, and the reveal phase shows a podium with points gained.
class QuickChallengesBoard extends StatefulWidget {
  const QuickChallengesBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<QuickChallengesBoard> createState() => _QuickChallengesBoardState();
}

class _QuickChallengesBoardState extends State<QuickChallengesBoard> with SingleTickerProviderStateMixin {
  Timer? _clock;
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 600))..repeat(reverse: true);
  int _localTaps = 0; // optimistic tap counter (server echoes value)
  int _lastRound = -1;
  String? _lastPhase;
  bool _falseStarted = false;
  int _wrongFlash = 0; // wrong number/direction flash counter

  Map<String, dynamic> get b => widget.session.board;
  String get _type => (b['type'] as String?) ?? 'tap';
  String get _phase => (b['phase'] as String?) ?? 'ready';
  int get _round => (b['round'] as num?)?.toInt() ?? 1;
  int get _target => (b['target'] as num?)?.toInt() ?? 6;
  List<Map<String, dynamic>> get _players => ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

  Map<String, dynamic>? get _me {
    final ps = _players;
    return widget.mySeat >= 0 && widget.mySeat < ps.length ? ps[widget.mySeat] : null;
  }

  bool get _active => widget.session.isInProgress && _phase == 'active';
  bool get _finished => _me?['finished'] == true;
  bool get _canAct => _active && !_finished && widget.mySeat >= 0;

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(milliseconds: 100), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant QuickChallengesBoard old) {
    super.didUpdateWidget(old);
    if (_round != _lastRound) {
      _lastRound = _round;
      _localTaps = 0;
      _falseStarted = false;
      _wrongFlash = 0;
    }
    if (_phase != _lastPhase) {
      _lastPhase = _phase;
      if (_phase == 'active') GameFeedback.roll();
      if (_phase == 'reveal') GameFeedback.hit();
    }
    final serverTaps = (_me?['value'] as num?)?.toInt() ?? 0;
    if (serverTaps > _localTaps) _localTaps = serverTaps;
  }

  bool _goShown() {
    final raw = b['reactStartAt'] as String?;
    final go = raw == null ? null : DateTime.tryParse(raw);
    return go != null && DateTime.now().isAfter(go);
  }

  Future<void> _tap() async {
    if (!_canAct) return;
    GameFeedback.tap();
    setState(() => _localTaps += 1);
    await widget.onAction('tap', {});
  }

  Future<void> _react() async {
    if (!_canAct || _falseStarted) return;
    if (!_goShown()) {
      setState(() => _falseStarted = true);
      GameFeedback.hit();
    } else {
      GameFeedback.move();
    }
    await widget.onAction('react', {});
  }

  Future<void> _number(int n) async {
    if (!_canAct) return;
    final target = (b['targetNumber'] as num?)?.toInt();
    if (n != target) {
      GameFeedback.hit();
      setState(() => _wrongFlash = n);
      Future<void>.delayed(const Duration(milliseconds: 350), () {
        if (mounted) setState(() => _wrongFlash = 0);
      });
      return; // don't spam the server with a guaranteed rejection
    }
    GameFeedback.move();
    await widget.onAction('order_tap', {'number': n});
  }

  Future<void> _direction(String dir) async {
    if (!_canAct) return;
    if (dir != (b['pointer'] as String?)) {
      GameFeedback.hit();
      setState(() => _wrongFlash = dir.hashCode);
      Future<void>.delayed(const Duration(milliseconds: 350), () {
        if (mounted) setState(() => _wrongFlash = 0);
      });
      return;
    }
    GameFeedback.move();
    await widget.onAction('direction_tap', {'dir': dir});
  }

  double _phaseLeft() {
    final endsRaw = b['phaseEndsAt'] as String?;
    final ends = endsRaw == null ? null : DateTime.tryParse(endsRaw);
    if (ends == null) return 0;
    final ms = _phase == 'ready' ? ((b['readyMs'] as num?)?.toDouble() ?? 3000) : (_phase == 'active' ? ((b['activeMs'] as num?)?.toDouble() ?? 8000) : ((b['revealMs'] as num?)?.toDouble() ?? 3000));
    return (ends.difference(DateTime.now()).inMilliseconds / ms).clamp(0.0, 1.0);
  }

  int _countdown() {
    final endsRaw = b['phaseEndsAt'] as String?;
    final ends = endsRaw == null ? null : DateTime.tryParse(endsRaw);
    if (ends == null) return 0;
    return math.max(0, (ends.difference(DateTime.now()).inMilliseconds / 1000).ceil());
  }

  @override
  Widget build(BuildContext context) {
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final players = _players;
    final instruction = (b['instruction'] as String?) ?? '';
    final tapGoal = (b['tapGoal'] as num?)?.toInt() ?? 20;
    final left = _phaseLeft();
    final lastResult = b['lastResult'] is Map ? Map<String, dynamic>.from(b['lastResult'] as Map) : null;

    final String typeLabel;
    final String typeEmoji;
    switch (_type) {
      case 'reaction':
        typeLabel = 'REACTION';
        typeEmoji = '🚦';
        break;
      case 'target_number':
        typeLabel = 'TARGET NUMBER';
        typeEmoji = '🎯';
        break;
      case 'direction':
        typeLabel = 'DIRECTION';
        typeEmoji = '🧭';
        break;
      default:
        typeLabel = 'TAP FRENZY';
        typeEmoji = '⚡';
    }

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_phase == 'ready') {
      status = 'Round $_round of $_target — get ready…';
    } else if (_phase == 'reveal') {
      status = 'Round $_round results';
    } else if (_finished) {
      status = 'Done! Waiting for the others…';
    } else {
      status = instruction;
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _canAct, icon: Icons.flash_on_rounded),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: Column(
            children: [
              // Header: round dots + type + timer bar.
              Row(
                children: [
                  for (var i = 1; i <= _target; i++)
                    Container(
                      width: 10,
                      height: 10,
                      margin: const EdgeInsets.only(right: 4),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: i < _round ? playground.accent : (i == _round ? AppColors.gold : Colors.white24),
                        boxShadow: i == _round ? [const BoxShadow(color: AppColors.gold, blurRadius: 6)] : null,
                      ),
                    ),
                  const Spacer(),
                  Text('$typeEmoji  $typeLabel', style: const TextStyle(color: AppColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 1)),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: widget.session.isInProgress ? left : 0,
                  minHeight: 5,
                  backgroundColor: Colors.white.withValues(alpha: 0.12),
                  color: _phase == 'active' ? (left < 0.3 ? AppColors.coral : playground.accent) : (_phase == 'ready' ? AppColors.gold : AppColors.textMuted),
                ),
              ),
              const SizedBox(height: 10),
              // Stage.
              SizedBox(
                height: 250,
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: !widget.session.isInProgress
                      ? _FinalStage(session: widget.session, players: players)
                      : _phase == 'ready'
                          ? _CountdownStage(key: ValueKey('ready$_round'), seconds: _countdown(), emoji: typeEmoji, label: typeLabel, instruction: instruction, pulse: _pulse)
                          : _phase == 'reveal'
                              ? _RevealStage(key: ValueKey('reveal$_round'), session: widget.session, players: players, result: lastResult, type: _type)
                              : _buildActiveStage(playground.accent, tapGoal),
                ),
              ),
              const SizedBox(height: 10),
              // Race bars.
              for (var i = 0; i < players.length; i++)
                _RaceBar(
                  session: widget.session,
                  seat: i,
                  me: i == widget.mySeat,
                  score: (players[i]['score'] as num?)?.toInt() ?? 0,
                  progress: _type == 'tap' ? (((players[i]['value'] as num?)?.toDouble() ?? 0) / tapGoal).clamp(0.0, 1.0) : (players[i]['finished'] == true ? 1.0 : 0.0),
                  finished: players[i]['finished'] == true,
                  falseStart: players[i]['falseStart'] == true,
                  gained: lastResult != null && _phase == 'reveal' ? ((lastResult['gained'] as List?)?.elementAt(i) as num?)?.toInt() : null,
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildActiveStage(Color accent, int tapGoal) {
    switch (_type) {
      case 'reaction':
        final go = _goShown();
        final done = _finished;
        final Color light = _falseStarted ? AppColors.coral : (go ? AppColors.success : const Color(0xFFE63946));
        return _StageFrame(
          key: const ValueKey('reaction'),
          child: GestureDetector(
            onTap: _canAct && !_falseStarted ? _react : null,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 120),
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(center: const Alignment(-0.3, -0.3), colors: [Color.lerp(light, Colors.white, 0.45)!, light, Color.lerp(light, Colors.black, 0.3)!]),
                    border: Border.all(color: Colors.white, width: 4),
                    boxShadow: [BoxShadow(color: light.withValues(alpha: 0.7), blurRadius: 30, spreadRadius: 4)],
                  ),
                  child: Center(
                    child: Text(
                      _falseStarted ? 'OOPS' : (done ? '✓' : (go ? 'GO!' : 'WAIT')),
                      style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 1),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  _falseStarted ? 'Too early — you jumped the gun!' : (done ? 'Nice reflexes!' : (go ? 'TAP NOW!' : 'Tap the moment it turns green')),
                  style: TextStyle(color: _falseStarted ? AppColors.coral : AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        );
      case 'target_number':
        final items = ((b['items'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
        final target = (b['targetNumber'] as num?)?.toInt() ?? 0;
        return _StageFrame(
          key: const ValueKey('target'),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              RichText(
                text: TextSpan(
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 14, fontWeight: FontWeight.w700),
                  children: [
                    const TextSpan(text: 'Tap  '),
                    TextSpan(text: '$target', style: const TextStyle(color: AppColors.gold, fontSize: 30, fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final n in items)
                    _BigKey(
                      label: '$n',
                      color: _wrongFlash == n ? AppColors.coral : accent,
                      done: _finished && n == target,
                      onTap: _canAct ? () => _number(n) : null,
                    ),
                ],
              ),
            ],
          ),
        );
      case 'direction':
        final pointer = (b['pointer'] as String?) ?? 'up';
        final arrowAngle = {'up': -math.pi / 2, 'right': 0.0, 'down': math.pi / 2, 'left': math.pi}[pointer] ?? 0.0;
        Widget key(String dir, IconData icon) => _BigKey(
              icon: icon,
              color: _wrongFlash == dir.hashCode ? AppColors.coral : accent,
              done: _finished && dir == pointer,
              onTap: _canAct ? () => _direction(dir) : null,
              size: 58,
            );
        return _StageFrame(
          key: const ValueKey('direction'),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black.withValues(alpha: 0.35), border: Border.all(color: AppColors.gold, width: 2), boxShadow: const [BoxShadow(color: AppColors.gold, blurRadius: 14)]),
                child: Transform.rotate(angle: arrowAngle, child: const Icon(Icons.arrow_forward_rounded, color: AppColors.gold, size: 60)),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  key('up', Icons.keyboard_arrow_up_rounded),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      key('left', Icons.keyboard_arrow_left_rounded),
                      const SizedBox(width: 58),
                      key('right', Icons.keyboard_arrow_right_rounded),
                    ],
                  ),
                  key('down', Icons.keyboard_arrow_down_rounded),
                ],
              ),
            ],
          ),
        );
      default:
        final taps = math.max(_localTaps, (_me?['value'] as num?)?.toInt() ?? 0);
        final frac = (taps / tapGoal).clamp(0.0, 1.0);
        return _StageFrame(
          key: const ValueKey('tap'),
          child: GestureDetector(
            onTapDown: _canAct ? (_) => _tap() : null,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 150,
                  height: 150,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox(
                        width: 150,
                        height: 150,
                        child: CircularProgressIndicator(value: frac, strokeWidth: 8, color: _finished ? AppColors.success : AppColors.gold, backgroundColor: Colors.white.withValues(alpha: 0.12)),
                      ),
                      AnimatedBuilder(
                        animation: _pulse,
                        builder: (context, _) => Container(
                          width: 110 + (_canAct ? _pulse.value * 8 : 0),
                          height: 110 + (_canAct ? _pulse.value * 8 : 0),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(center: const Alignment(-0.3, -0.3), colors: [Color.lerp(accent, Colors.white, 0.4)!, accent, Color.lerp(accent, Colors.black, 0.3)!]),
                            border: Border.all(color: Colors.white, width: 3),
                            boxShadow: [BoxShadow(color: accent.withValues(alpha: 0.6), blurRadius: 24)],
                          ),
                          child: Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(_finished ? '✓' : '$taps', style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w900, height: 1)),
                                Text(_finished ? 'DONE' : '/ $tapGoal', style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w800)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Text(_finished ? 'Goal reached!' : 'TAP TAP TAP!', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 1)),
              ],
            ),
          ),
        );
    }
  }
}

// ── Stages ────────────────────────────────────────────────────────────────────

class _StageFrame extends StatelessWidget {
  const _StageFrame({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: child,
    );
  }
}

class _CountdownStage extends StatelessWidget {
  const _CountdownStage({super.key, required this.seconds, required this.emoji, required this.label, required this.instruction, required this.pulse});
  final int seconds;
  final String emoji;
  final String label;
  final String instruction;
  final AnimationController pulse;

  @override
  Widget build(BuildContext context) {
    return _StageFrame(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 40)),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 2)),
          const SizedBox(height: 4),
          AnimatedBuilder(
            animation: pulse,
            builder: (context, _) => Text(
              '$seconds',
              style: TextStyle(color: AppColors.gold, fontSize: 56 + pulse.value * 6, fontWeight: FontWeight.w900, height: 1, shadows: const [Shadow(color: AppColors.gold, blurRadius: 18)]),
            ),
          ),
          const SizedBox(height: 6),
          Text(instruction, style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _RevealStage extends StatelessWidget {
  const _RevealStage({super.key, required this.session, required this.players, required this.result, required this.type});
  final GameSessionView session;
  final List<Map<String, dynamic>> players;
  final Map<String, dynamic>? result;
  final String type;

  @override
  Widget build(BuildContext context) {
    final order = ((result?['order'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    final gained = ((result?['gained'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
    if (order.isEmpty) {
      return const _StageFrame(child: Center(child: Text('Nobody finished this round!', style: TextStyle(color: AppColors.coral, fontSize: 15, fontWeight: FontWeight.w800))));
    }
    final podium = order.take(3).toList();
    // Podium display order: 2nd, 1st, 3rd.
    final slots = <int?>[podium.length > 1 ? podium[1] : null, podium[0], podium.length > 2 ? podium[2] : null];
    const heights = [70.0, 100.0, 50.0];
    const medals = ['🥈', '🥇', '🥉'];
    return _StageFrame(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < 3; i++)
                if (slots[i] != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: _PodiumSlot(
                      session: session,
                      seat: slots[i]!,
                      medal: medals[i],
                      height: heights[i],
                      gained: slots[i]! < gained.length ? gained[slots[i]!] : 0,
                      detail: type == 'reaction' && slots[i]! < players.length && players[slots[i]!]['reactionMs'] != null ? '${players[slots[i]!]['reactionMs']} ms' : null,
                    ),
                  ),
            ],
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _PodiumSlot extends StatelessWidget {
  const _PodiumSlot({required this.session, required this.seat, required this.medal, required this.height, required this.gained, required this.detail});
  final GameSessionView session;
  final int seat;
  final String medal;
  final double height;
  final int gained;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final name = seat < session.seats.length ? session.seats[seat].displayName : 'Seat $seat';
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(medal, style: const TextStyle(fontSize: 26)),
        Text('+$gained', style: const TextStyle(color: AppColors.gold, fontSize: 14, fontWeight: FontWeight.w900)),
        if (detail != null) Text(detail!, style: const TextStyle(color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: height),
          duration: const Duration(milliseconds: 500),
          curve: Curves.easeOutBack,
          builder: (context, h, _) => Container(
            width: 78,
            height: h,
            decoration: BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [palette.light, palette.base, palette.dark]),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(10)),
              boxShadow: [BoxShadow(color: palette.glow.withValues(alpha: 0.5), blurRadius: 12)],
            ),
            alignment: Alignment.topCenter,
            padding: const EdgeInsets.only(top: 6),
            child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w800)),
          ),
        ),
      ],
    );
  }
}

class _FinalStage extends StatelessWidget {
  const _FinalStage({required this.session, required this.players});
  final GameSessionView session;
  final List<Map<String, dynamic>> players;

  @override
  Widget build(BuildContext context) {
    final ranked = [for (var i = 0; i < players.length; i++) i]..sort((a, b) => ((players[b]['score'] as num?) ?? 0).compareTo((players[a]['score'] as num?) ?? 0));
    return _StageFrame(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('🏆 FINAL STANDINGS', style: TextStyle(color: AppColors.gold, fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
          const SizedBox(height: 10),
          for (var r = 0; r < ranked.length && r < 4; r++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(r == 0 ? '🥇' : (r == 1 ? '🥈' : (r == 2 ? '🥉' : '  ${r + 1}.')), style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 8),
                  Text(ranked[r] < session.seats.length ? session.seats[ranked[r]].displayName : 'Seat ${ranked[r]}', style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w800)),
                  const SizedBox(width: 10),
                  Text('${players[ranked[r]]['score'] ?? 0} pts', style: const TextStyle(color: AppColors.gold, fontSize: 13, fontWeight: FontWeight.w900)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── Controls & bars ───────────────────────────────────────────────────────────

class _BigKey extends StatelessWidget {
  const _BigKey({this.label, this.icon, required this.color, required this.done, required this.onTap, this.size = 76});
  final String? label;
  final IconData? icon;
  final Color color;
  final bool done;
  final VoidCallback? onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = done ? AppColors.success : color;
    return GestureDetector(
      onTapDown: onTap == null ? null : (_) => onTap!(),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(size * 0.24),
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color.lerp(c, Colors.white, 0.3)!, c, Color.lerp(c, Colors.black, 0.3)!]),
          border: Border.all(color: Colors.white.withValues(alpha: 0.85), width: 2),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 6, offset: const Offset(0, 4)),
            if (onTap != null) BoxShadow(color: c.withValues(alpha: 0.5), blurRadius: 14),
          ],
        ),
        child: Center(
          child: label != null
              ? Text(label!, style: TextStyle(color: Colors.white, fontSize: size * 0.42, fontWeight: FontWeight.w900))
              : Icon(icon, color: Colors.white, size: size * 0.6),
        ),
      ),
    );
  }
}

class _RaceBar extends StatelessWidget {
  const _RaceBar({required this.session, required this.seat, required this.me, required this.score, required this.progress, required this.finished, required this.falseStart, required this.gained});
  final GameSessionView session;
  final int seat;
  final bool me;
  final int score;
  final double progress;
  final bool finished;
  final bool falseStart;
  final int? gained;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final name = seat < session.seats.length ? session.seats[seat].displayName : 'Seat $seat';
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        children: [
          SizedBox(
            width: 74,
            child: Text(me ? 'You' : name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: me ? AppColors.gold : AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w800)),
          ),
          Expanded(
            child: Stack(
              children: [
                Container(height: 14, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(7))),
                AnimatedFractionallySizedBox(
                  duration: const Duration(milliseconds: 160),
                  widthFactor: falseStart ? 1 : progress.clamp(0.02, 1.0),
                  child: Container(
                    height: 14,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: falseStart ? [AppColors.coral, AppColors.coral.withValues(alpha: 0.5)] : [palette.light, palette.base]),
                      borderRadius: BorderRadius.circular(7),
                      boxShadow: finished ? [BoxShadow(color: palette.glow.withValues(alpha: 0.6), blurRadius: 8)] : null,
                    ),
                  ),
                ),
                if (finished || falseStart)
                  Positioned(
                    right: 4,
                    top: 0,
                    bottom: 0,
                    child: Icon(falseStart ? Icons.close_rounded : Icons.check_rounded, size: 12, color: Colors.white),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            width: 58,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (gained != null && gained! > 0) Text('+$gained ', style: const TextStyle(color: AppColors.success, fontSize: 10.5, fontWeight: FontWeight.w900)),
                Text('$score', style: const TextStyle(color: AppColors.gold, fontSize: 12, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

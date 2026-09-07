import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Impostor — a Spyfall-style bluffing game. Your briefing card slides in
/// (crew: the secret location; impostor: a red "you are the impostor" card),
/// the eight possible locations are shown as a grid so everyone can bluff
/// convincingly, and the impostor may risk a final guess from that grid at any
/// time. After discussion the crew votes: tap a portrait to lock in a vote or
/// choose "skip". The resolution reveals the impostor and the true location.
class ImpostorLightBoard extends StatefulWidget {
  const ImpostorLightBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<ImpostorLightBoard> createState() => _ImpostorLightBoardState();
}

class _ImpostorLightBoardState extends State<ImpostorLightBoard> {
  Timer? _clock;
  bool _busy = false;
  String? _lastPhase;
  String? _guessCandidate;

  Map<String, dynamic> get b => widget.session.board;
  String get _phase => (b['phase'] as String?) ?? 'discussion';
  bool get _isImpostor => b['youAreImpostor'] == true;
  List<Map<String, dynamic>> get _players => ((b['players'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  List<String> get _options => ((b['options'] as List?) ?? const []).map((e) => e.toString()).toList();

  bool get _iAmAlive {
    final ps = _players;
    return widget.mySeat >= 0 && widget.mySeat < ps.length && ps[widget.mySeat]['alive'] != false;
  }

  bool get _voted => b['myVote'] != null;
  bool get _canVote => widget.session.isInProgress && _phase == 'voting' && _iAmAlive && !_voted && !_busy;

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
  void didUpdateWidget(covariant ImpostorLightBoard old) {
    super.didUpdateWidget(old);
    if (_phase != _lastPhase) {
      _lastPhase = _phase;
      if (_phase == 'voting') GameFeedback.roll();
      if (_phase == 'resolution') GameFeedback.hit();
    }
  }

  Future<void> _vote(int target) async {
    if (!_canVote || target == widget.mySeat) return;
    GameFeedback.tap();
    setState(() => _busy = true);
    await widget.onAction('vote', {'target': target});
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _guess(String location) async {
    if (!_isImpostor || !widget.session.isInProgress || _phase == 'resolution' || _busy) return;
    GameFeedback.hit();
    setState(() {
      _busy = true;
      _guessCandidate = null;
    });
    await widget.onAction('guess_location', {'location': location});
    if (mounted) setState(() => _busy = false);
  }

  double _progress() {
    final endsRaw = b['phaseEndsAt'] as String?;
    final ms = (b['phaseMs'] as num?)?.toDouble() ?? 20000;
    final ends = endsRaw == null ? null : DateTime.tryParse(endsRaw);
    if (ends == null) return 0;
    return (ends.difference(DateTime.now()).inMilliseconds / ms).clamp(0.0, 1.0);
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
    final options = _options;
    final location = b['location'] as String?;
    final category = (b['category'] as String?) ?? 'Places';
    final message = (b['message'] as String?) ?? '';
    final results = ((b['results'] as List?) ?? const []).whereType<Map>().toList();
    final tally = <int, int>{for (final r in results) (r['seat'] as num).toInt(): (r['votes'] as num).toInt()};
    final revealedImpostor = (b['revealedImpostor'] as num?)?.toInt();
    final revealedLocation = b['revealedLocation'] as String?;
    final ejected = (b['ejectedSeat'] as num?)?.toInt();
    final outcome = b['outcome'] as String?;
    final votedCount = (b['votedCount'] as num?)?.toInt() ?? 0;
    final aliveCount = (b['aliveCount'] as num?)?.toInt() ?? players.length;
    final myVote = (b['myVote'] as num?)?.toInt();
    final resolution = _phase == 'resolution' || !widget.session.isInProgress;

    String nameOf(int seat) {
      if (seat >= 0 && seat < players.length) return (players[seat]['name'] as String?) ?? 'Player ${seat + 1}';
      if (seat >= 0 && seat < widget.session.seats.length) return widget.session.seats[seat].displayName;
      return 'Player ${seat + 1}';
    }

    String status;
    IconData icon;
    if (resolution) {
      status = outcome == 'impostor' ? 'The impostor wins!' : (outcome == 'crew' ? 'Crew wins!' : 'Round over');
      icon = outcome == 'impostor' ? Icons.masks_rounded : Icons.shield_rounded;
    } else if (_phase == 'discussion') {
      status = _isImpostor ? 'Bluff! Figure out the location from the chat' : 'Discuss the location — ask sneaky questions';
      icon = Icons.forum_rounded;
    } else {
      status = _voted ? 'Vote locked · $votedCount/$aliveCount in' : 'Vote — who is the impostor?';
      icon = Icons.how_to_vote_rounded;
    }

    final phaseColor = resolution ? (outcome == 'impostor' ? AppColors.coral : AppColors.success) : (_phase == 'voting' ? AppColors.gold : playground.accent);

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _canVote, icon: icon),
        const SizedBox(height: 6),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: Column(
            children: [
              // Briefing card + timer.
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _BriefingCard(
                      impostor: _isImpostor,
                      location: resolution ? (revealedLocation ?? location) : location,
                      category: category,
                      revealed: resolution,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _PhaseTimer(progress: widget.session.isInProgress ? _progress() : 0, seconds: _secondsLeft(), label: _phase == 'discussion' ? 'TALK' : (_phase == 'voting' ? 'VOTE' : 'DONE'), color: phaseColor),
                ],
              ),
              const SizedBox(height: 8),
              // Location grid.
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(left: 2, bottom: 4),
                  child: Text(
                    _isImpostor && !resolution ? 'POSSIBLE LOCATIONS · tap one to make your final guess' : 'POSSIBLE LOCATIONS',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1),
                  ),
                ),
              ),
              GridView.count(
                crossAxisCount: 4,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 6,
                crossAxisSpacing: 6,
                childAspectRatio: 1.35,
                children: [
                  for (final opt in options)
                    _LocationTile(
                      name: opt,
                      emoji: _emojiFor(opt),
                      highlight: (!_isImpostor && opt == location) || (resolution && opt == revealedLocation),
                      wrongGuess: resolution && b['impostorGuess'] == opt && opt != revealedLocation,
                      selected: _guessCandidate == opt,
                      onTap: _isImpostor && !resolution && !_busy ? () => setState(() => _guessCandidate = _guessCandidate == opt ? null : opt) : null,
                    ),
                ],
              ),
              if (_guessCandidate != null && _isImpostor && !resolution) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    ActionButton(
                      label: 'Final answer: ${_guessCandidate!}',
                      icon: Icons.priority_high_rounded,
                      color: AppColors.coral,
                      onPressed: () => _guess(_guessCandidate!),
                    ),
                    const SizedBox(width: 8),
                    ActionButton(label: 'Cancel', icon: Icons.close_rounded, expanded: false, color: AppColors.surfaceElevated, onPressed: () => setState(() => _guessCandidate = null)),
                  ],
                ),
              ],
              const SizedBox(height: 10),
              // Crew.
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  for (var i = 0; i < players.length; i++)
                    _CrewPortrait(
                      session: widget.session,
                      seat: i,
                      name: nameOf(i),
                      me: i == widget.mySeat,
                      alive: players[i]['alive'] != false,
                      locked: players[i]['voted'] == true && _phase == 'voting',
                      votes: resolution ? (tally[i] ?? 0) : 0,
                      myPick: myVote == i,
                      impostor: resolution && revealedImpostor == i,
                      ejected: resolution && ejected == i,
                      targetable: _canVote && i != widget.mySeat && players[i]['alive'] != false,
                      onTap: _canVote && i != widget.mySeat ? () => _vote(i) : null,
                    ),
                ],
              ),
              if (_phase == 'voting' && _iAmAlive && widget.session.isInProgress) ...[
                const SizedBox(height: 10),
                ActionButton(
                  label: _voted ? (myVote == -1 ? 'You skipped' : 'Voted for ${nameOf(myVote ?? -1)}') : 'Skip vote',
                  icon: _voted ? Icons.lock_rounded : Icons.skip_next_rounded,
                  color: AppColors.surfaceElevated,
                  onPressed: _canVote ? () => _vote(-1) : null,
                ),
              ],
              const SizedBox(height: 8),
              // Message banner.
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(color: phaseColor.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12), border: Border.all(color: phaseColor.withValues(alpha: 0.7))),
                child: Text(message, textAlign: TextAlign.center, style: TextStyle(color: phaseColor, fontSize: 12.5, fontWeight: FontWeight.w800)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _emojiFor(String location) {
    const map = {
      'airport': '✈️',
      'beach': '🏖️',
      'hospital': '🏥',
      'school': '🏫',
      'restaurant': '🍽️',
      'cinema': '🎬',
      'space station': '🛰️',
      'zoo': '🦁',
      'library': '📚',
      'stadium': '🏟️',
      'casino': '🎰',
      'pirate ship': '🏴‍☠️',
      'submarine': '🐙',
      'circus': '🎪',
      'bank': '🏦',
      'train station': '🚆',
      'supermarket': '🛒',
      'museum': '🏛️',
      'ski resort': '⛷️',
      'wedding': '💒',
      'police station': '🚓',
      'amusement park': '🎢',
      'farm': '🚜',
      'gym': '🏋️',
    };
    return map[location] ?? '📍';
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _BriefingCard extends StatelessWidget {
  const _BriefingCard({required this.impostor, required this.location, required this.category, required this.revealed});
  final bool impostor;
  final String? location;
  final String category;
  final bool revealed;

  @override
  Widget build(BuildContext context) {
    final color = impostor ? AppColors.coral : AppColors.softCyan;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [color.withValues(alpha: 0.35), color.withValues(alpha: 0.08)]),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.9), width: 1.4),
        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.3), blurRadius: 16)],
      ),
      child: Row(
        children: [
          Text(impostor ? '🕵️' : '📍', style: const TextStyle(fontSize: 32)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(impostor ? 'YOU ARE THE IMPOSTOR' : 'TOP SECRET · $category', style: TextStyle(color: color, fontSize: 10.5, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                const SizedBox(height: 3),
                Text(
                  impostor
                      ? (revealed && location != null ? 'It was: ${location!}' : 'You don\'t know the location')
                      : (location ?? '???'),
                  style: TextStyle(color: AppColors.textPrimary, fontSize: impostor ? 14 : 20, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 2),
                Text(
                  impostor ? 'Listen closely, answer vaguely, and guess it before they catch you.' : 'Prove you know it — without giving it away to the impostor.',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 10.5),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PhaseTimer extends StatelessWidget {
  const _PhaseTimer({required this.progress, required this.seconds, required this.label, required this.color});
  final double progress;
  final int seconds;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 64,
      height: 64,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(value: progress, strokeWidth: 5, color: color, backgroundColor: Colors.white.withValues(alpha: 0.12)),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('$seconds', style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.w900, height: 1)),
              Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 1)),
            ],
          ),
        ],
      ),
    );
  }
}

class _LocationTile extends StatelessWidget {
  const _LocationTile({required this.name, required this.emoji, required this.highlight, required this.wrongGuess, required this.selected, required this.onTap});
  final String name;
  final String emoji;
  final bool highlight;
  final bool wrongGuess;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = wrongGuess ? AppColors.coral : (highlight ? AppColors.softCyan : (selected ? AppColors.gold : AppColors.glassStroke));
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        decoration: BoxDecoration(
          color: highlight ? AppColors.softCyan.withValues(alpha: 0.2) : (selected ? AppColors.gold.withValues(alpha: 0.2) : Colors.black.withValues(alpha: 0.3)),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color, width: highlight || selected ? 1.8 : 1),
          boxShadow: highlight || selected ? [BoxShadow(color: color.withValues(alpha: 0.4), blurRadius: 10)] : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 18)),
            const SizedBox(height: 2),
            Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(color: wrongGuess ? AppColors.coral : AppColors.textPrimary, fontSize: 9.5, fontWeight: FontWeight.w800, decoration: wrongGuess ? TextDecoration.lineThrough : null),
            ),
          ],
        ),
      ),
    );
  }
}

class _CrewPortrait extends StatelessWidget {
  const _CrewPortrait({
    required this.session,
    required this.seat,
    required this.name,
    required this.me,
    required this.alive,
    required this.locked,
    required this.votes,
    required this.myPick,
    required this.impostor,
    required this.ejected,
    required this.targetable,
    required this.onTap,
  });
  final GameSessionView session;
  final int seat;
  final String name;
  final bool me;
  final bool alive;
  final bool locked;
  final int votes;
  final bool myPick;
  final bool impostor;
  final bool ejected;
  final bool targetable;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final ring = impostor ? AppColors.coral : (myPick ? AppColors.gold : (targetable ? Colors.white : (me ? palette.light : Colors.white24)));
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 70,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(center: const Alignment(-0.3, -0.3), colors: alive ? [palette.light, palette.base, palette.dark] : [Colors.grey.shade600, Colors.grey.shade800, Colors.black]),
                    border: Border.all(color: ring, width: myPick || targetable || impostor ? 2.6 : 1.4),
                    boxShadow: [if (targetable || myPick || impostor) BoxShadow(color: ring.withValues(alpha: 0.6), blurRadius: 14)],
                  ),
                  child: Center(child: Text(impostor ? '🕵️' : (ejected ? '🚀' : '🧑‍🚀'), style: const TextStyle(fontSize: 22))),
                ),
                if (locked)
                  Positioned(
                    right: -4,
                    top: -4,
                    child: Container(
                      width: 20,
                      height: 20,
                      decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.gold, boxShadow: [BoxShadow(color: Colors.black45, blurRadius: 4)]),
                      child: const Icon(Icons.lock_rounded, size: 12, color: Color(0xFF1B1B2F)),
                    ),
                  ),
                if (votes > 0)
                  Positioned(
                    left: -4,
                    bottom: -4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: AppColors.coral, borderRadius: BorderRadius.circular(8)),
                      child: Text('$votes', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              me ? 'You' : name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: alive ? AppColors.textPrimary : AppColors.textMuted, fontSize: 10.5, fontWeight: FontWeight.w800),
            ),
            if (impostor) const Text('IMPOSTOR', style: TextStyle(color: AppColors.coral, fontSize: 8.5, fontWeight: FontWeight.w900, letterSpacing: 1)),
          ],
        ),
      ),
    );
  }
}

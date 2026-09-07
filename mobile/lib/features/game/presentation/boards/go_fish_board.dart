import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Go Fish for 2–4 players. Your hand is fanned at the bottom grouped by
/// rank; tap a rank to select it, then tap an opponent (top) to ask them.
/// Books are shown as small stacks beside each player. The pond sits in the
/// middle of the table.
class GoFishBoard extends StatefulWidget {
  const GoFishBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<GoFishBoard> createState() => _GoFishBoardState();
}

class _GoFishBoardState extends State<GoFishBoard> {
  String? _rank;

  Map<String, dynamic> get b => widget.session.board;
  List<Map<String, dynamic>> get _hand =>
      ((b['hand'] as List?) ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  List<int> get _handSizes => ((b['handSizes'] as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
  List<List<String>> get _books =>
      ((b['books'] as List?) ?? const []).map((e) => (e as List).map((r) => r.toString()).toList()).toList();
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  void _ask(int target) {
    if (!_myTurn || _rank == null) return;
    final sizes = _handSizes;
    if (target < sizes.length && sizes[target] == 0) return;
    GameFeedback.move();
    widget.onAction('ask', {'target': target, 'rank': _rank});
    setState(() => _rank = null);
  }

  @override
  Widget build(BuildContext context) {
    final hand = _hand;
    final sizes = _handSizes;
    final books = _books;
    final pond = (b['pondCount'] as num?)?.toInt() ?? 0;
    final last = b['lastEvent'] as Map?;
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final current = widget.session.currentSeat;
    final seats = widget.session.seats;
    final me = widget.mySeat;

    // Group hand by rank.
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final c in hand) {
      groups.putIfAbsent(c['rank'].toString(), () => []).add(c);
    }
    final ranks = groups.keys.toList()..sort((a, b) => _rankOrder(a).compareTo(_rankOrder(b)));
    if (_rank != null && !groups.containsKey(_rank)) _rank = null;

    String status;
    if (!widget.session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      status = _rank == null ? 'Your turn — pick a rank from your hand' : 'Now tap a player to ask for ${_rankLabel(_rank!)}s';
    } else {
      final name = current >= 0 && current < seats.length ? seats[current].displayName : 'Opponent';
      status = '$name is asking…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.style_rounded),
        const SizedBox(height: 4),
        if (last != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              _eventText(last),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: last['booked'] != null ? AppColors.gold : AppColors.textSecondary,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        const SizedBox(height: 4),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(10),
          child: Column(
            children: [
              // Opponents.
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  for (var i = 0; i < seats.length; i++)
                    if (i != me)
                      Expanded(
                        child: _Opponent(
                          session: widget.session,
                          seat: i,
                          cards: i < sizes.length ? sizes[i] : 0,
                          books: i < books.length ? books[i] : const [],
                          active: i == current && widget.session.isInProgress,
                          askable: _myTurn && _rank != null && (i < sizes.length ? sizes[i] > 0 : false),
                          accent: playground.accent,
                          onTap: () => _ask(i),
                        ),
                      ),
                ],
              ),
              const SizedBox(height: 12),
              // Pond.
              SizedBox(
                height: 78,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    for (var i = 0; i < (pond.clamp(0, 5)); i++)
                      Positioned(
                        left: null,
                        top: 8 - i * 2.0,
                        child: Transform.translate(
                          offset: Offset(i * 2.0, 0),
                          child: const _CardBack(width: 44, height: 62),
                        ),
                      ),
                    if (pond == 0)
                      Text('Pond empty', style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 12)),
                    Positioned(
                      bottom: 0,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(8)),
                        child: Text('🎣 $pond in the pond', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              // My books + hand.
              Row(
                children: [
                  if (me >= 0)
                    SkinnedPiece(skin: TableSkins.pieceSkin(widget.session.cosmeticsOf(me).piece), seat: me, size: 16),
                  const SizedBox(width: 6),
                  Text(me >= 0 ? 'Your hand' : 'Spectating', style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800, fontSize: 12)),
                  const Spacer(),
                  if (me >= 0 && me < books.length) _BookStack(books: books[me], accent: playground.accent),
                ],
              ),
              const SizedBox(height: 8),
              if (me < 0)
                Text('Hands are hidden from spectators.', style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11))
              else if (hand.isEmpty)
                Text('No cards — waiting for the pond.', style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11))
              else
                SizedBox(
                  height: 96,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      for (final r in ranks)
                        Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: _RankGroup(
                            rank: r,
                            cards: groups[r]!,
                            selected: _rank == r,
                            enabled: _myTurn,
                            accent: playground.accent,
                            onTap: () {
                              if (!_myTurn) return;
                              GameFeedback.tap();
                              setState(() => _rank = _rank == r ? null : r);
                            },
                          ),
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

  String _eventText(Map e) {
    final seat = (e['seat'] as num?)?.toInt() ?? 0;
    final target = (e['target'] as num?)?.toInt() ?? 0;
    final who = seat == widget.mySeat ? 'You' : _name(seat);
    final whom = target == widget.mySeat ? 'you' : _name(target);
    final rank = _rankLabel(e['rank'].toString());
    final got = (e['got'] as num?)?.toInt() ?? 0;
    final booked = e['booked'];
    final buffer = StringBuffer();
    if (got > 0) {
      buffer.write('$who asked $whom for ${rank}s and got $got!');
    } else if (e['luckyDraw'] == true) {
      buffer.write('$who went fishing and caught a $rank!');
    } else {
      buffer.write('$who asked $whom for ${rank}s — go fish!');
    }
    if (booked != null) buffer.write(' 📚 Book of ${_rankLabel(booked.toString())}s!');
    return buffer.toString();
  }

  String _name(int seat) => seat >= 0 && seat < widget.session.seats.length ? widget.session.seats[seat].displayName : 'Player';

  static int _rankOrder(String r) {
    const order = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    final i = order.indexOf(r);
    return i < 0 ? 99 : i;
  }

  static String _rankLabel(String r) {
    switch (r) {
      case 'A':
        return 'Ace';
      case 'J':
        return 'Jack';
      case 'Q':
        return 'Queen';
      case 'K':
        return 'King';
      default:
        return r;
    }
  }
}

class _Opponent extends StatelessWidget {
  const _Opponent({
    required this.session,
    required this.seat,
    required this.cards,
    required this.books,
    required this.active,
    required this.askable,
    required this.accent,
    required this.onTap,
  });

  final GameSessionView session;
  final int seat;
  final int cards;
  final List<String> books;
  final bool active;
  final bool askable;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = session.seats[seat].displayName;
    return GestureDetector(
      onTap: askable ? onTap : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: askable ? accent.withValues(alpha: 0.16) : Colors.black.withValues(alpha: 0.2),
          border: Border.all(color: askable ? accent : (active ? AppColors.softCyan : Colors.white.withValues(alpha: 0.1)), width: askable || active ? 1.8 : 1),
          boxShadow: askable ? [BoxShadow(color: accent.withValues(alpha: 0.4), blurRadius: 14)] : null,
        ),
        child: Column(
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SkinnedPiece(skin: TableSkins.pieceSkin(session.cosmeticsOf(seat).piece), seat: seat, size: 14),
                const SizedBox(width: 5),
                Flexible(
                  child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: active ? AppColors.softCyan : AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: 40,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  for (var i = 0; i < cards.clamp(0, 7); i++)
                    Positioned(
                      left: 10.0 + i * 7,
                      child: const _CardBack(width: 26, height: 38),
                    ),
                  if (cards == 0) Text('no cards', style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 10)),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('$cards cards', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
                const SizedBox(width: 6),
                _BookStack(books: books, accent: accent, compact: true),
              ],
            ),
            if (askable)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('ASK', style: TextStyle(color: accent, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
              ),
          ],
        ),
      ),
    );
  }
}

class _BookStack extends StatelessWidget {
  const _BookStack({required this.books, required this.accent, this.compact = false});
  final List<String> books;
  final Color accent;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    if (books.isEmpty) {
      return Text(compact ? '0 books' : 'No books yet', style: const TextStyle(color: AppColors.textMuted, fontSize: 10));
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final r in books.take(compact ? 4 : 7))
          Container(
            margin: const EdgeInsets.only(right: 3),
            width: compact ? 16 : 22,
            height: compact ? 22 : 30,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(4),
              color: Colors.white,
              border: Border.all(color: accent, width: 1.2),
              boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 3, offset: Offset(0, 2))],
            ),
            alignment: Alignment.center,
            child: Text(r, style: TextStyle(color: const Color(0xFF1B1E33), fontSize: compact ? 9 : 11, fontWeight: FontWeight.w900)),
          ),
        if (books.length > (compact ? 4 : 7)) Text('+${books.length - (compact ? 4 : 7)}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
      ],
    );
  }
}

class _RankGroup extends StatelessWidget {
  const _RankGroup({required this.rank, required this.cards, required this.selected, required this.enabled, required this.accent, required this.onTap});
  final String rank;
  final List<Map<String, dynamic>> cards;
  final bool selected;
  final bool enabled;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const w = 50.0;
    final width = w + (cards.length - 1) * 16.0;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        transform: Matrix4.translationValues(0, selected ? -10 : 0, 0),
        width: width + 8,
        child: Stack(
          children: [
            for (var i = 0; i < cards.length; i++)
              Positioned(
                left: 4.0 + i * 16,
                top: 4,
                child: _PlayingCard(rank: rank, suit: cards[i]['suit'].toString(), width: w, height: 72, glow: selected ? accent : null, dim: !enabled),
              ),
          ],
        ),
      ),
    );
  }
}

class _PlayingCard extends StatelessWidget {
  const _PlayingCard({required this.rank, required this.suit, required this.width, required this.height, this.glow, this.dim = false});
  final String rank;
  final String suit;
  final double width;
  final double height;
  final Color? glow;
  final bool dim;

  static const _suits = {'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣'};

  @override
  Widget build(BuildContext context) {
    final red = suit == 'H' || suit == 'D';
    final color = red ? const Color(0xFFE23D5C) : const Color(0xFF1B1E33);
    return Opacity(
      opacity: dim ? 0.8 : 1,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.white, Color(0xFFEDEBF5)]),
          border: Border.all(color: glow ?? Colors.black26, width: glow != null ? 2 : 1),
          boxShadow: [
            const BoxShadow(color: Colors.black54, blurRadius: 5, offset: Offset(0, 3)),
            if (glow != null) BoxShadow(color: glow!.withValues(alpha: 0.6), blurRadius: 14),
          ],
        ),
        child: Stack(
          children: [
            Positioned(
              left: 5,
              top: 3,
              child: Column(
                children: [
                  Text(rank, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w900, height: 1)),
                  Text(_suits[suit] ?? '', style: TextStyle(color: color, fontSize: 11, height: 1)),
                ],
              ),
            ),
            Center(child: Text(_suits[suit] ?? '', style: TextStyle(color: color, fontSize: height * 0.38))),
          ],
        ),
      ),
    );
  }
}

class _CardBack extends StatelessWidget {
  const _CardBack({required this.width, required this.height});
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF8A6CFF), Color(0xFF3B2A9E)]),
        border: Border.all(color: Colors.white.withValues(alpha: 0.7), width: 1.2),
        boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 4, offset: Offset(0, 2))],
      ),
      child: Center(
        child: Container(
          width: width * 0.6,
          height: height * 0.6,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
            gradient: LinearGradient(colors: [Colors.white.withValues(alpha: 0.15), Colors.transparent]),
          ),
        ),
      ),
    );
  }
}

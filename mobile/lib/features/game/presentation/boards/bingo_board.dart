import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed bingo view (own card + drawn balls; opponents' cards are hidden).
class _BingoView {
  _BingoView(Map<String, dynamic> b)
      : cards = _cards(b['cards']),
        marks = _marks(b['marks']),
        drawn = _nums(b['drawn']),
        lastBall = (b['lastBall'] as num?)?.toInt(),
        lastWin = _lastWin(b['lastWin']);

  final List<List<List<int>>> cards; // per seat (own only; others empty)
  final List<List<List<bool>>> marks;
  final List<int> drawn;
  final int? lastBall;
  final _LastWin? lastWin;

  static List<List<List<int>>> _cards(Object? raw) => ((raw as List?) ?? const [])
      .map(
        (seat) => (seat as List?)
                ?.whereType<List>()
                .map((row) => row.whereType<num>().map((n) => n.toInt()).toList())
                .toList() ??
            <List<int>>[],
      )
      .toList();

  static List<List<List<bool>>> _marks(Object? raw) => ((raw as List?) ?? const [])
      .map(
        (seat) => (seat as List?)
                ?.whereType<List>()
                .map((row) => row.map((m) => m == true).toList())
                .toList() ??
            <List<bool>>[],
      )
      .toList();

  static List<int> _nums(Object? raw) =>
      ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();

  static _LastWin? _lastWin(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _LastWin(
      (m['seat'] as num?)?.toInt() ?? 0,
      ((m['line'] as List?) ?? const [])
          .whereType<List>()
          .map((p) => [(p[0] as num).toInt(), (p[1] as num).toInt()])
          .toList(),
    );
  }
}

class _LastWin {
  const _LastWin(this.seat, this.line);
  final int seat;
  final List<List<int>> line;
}

const _letters = ['B', 'I', 'N', 'G', 'O'];

/// Bingo (75-ball), wave-3 3D board.
///
/// Your private card glows in the centre: dabbed numbers dim, the FREE star
/// sparkles, and the winning line flashes gold. The cage strip shows every
/// ball called so far with the latest one enlarged; opponents appear as
/// progress dots only (their cards stay hidden). Big DRAW button on your turn.
class BingoBoard extends StatefulWidget {
  const BingoBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<BingoBoard> createState() => _BingoBoardState();
}

class _BingoBoardState extends State<BingoBoard> with SingleTickerProviderStateMixin {
  String _skin = 'wood';

  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 650),
  );

  _BingoView get _view => _BingoView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  List<List<int>>? get _myCard {
    final cards = _view.cards;
    return cards.length > widget.mySeat && cards[widget.mySeat].isNotEmpty
        ? cards[widget.mySeat]
        : null;
  }

  List<List<bool>>? get _myMarks {
    final marks = _view.marks;
    return marks.length > widget.mySeat && marks[widget.mySeat].isNotEmpty
        ? marks[widget.mySeat]
        : null;
  }

  @override
  void initState() {
    super.initState();
    _pulse.repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _draw() async {
    if (!_myTurn) return;
    GameFeedback.tap();
    await widget.onAction('draw', {});
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    final card = _myCard ?? List.generate(5, (_) => List.filled(5, 0));
    final marks = _myMarks ?? List.generate(5, (_) => List.filled(5, false));
    final winLine = view.lastWin != null && view.lastWin!.seat == widget.mySeat
        ? view.lastWin!.line
        : <List<int>>[];

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.campaign_rounded,
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
          child: Column(
            children: [
              _cageStrip(view),
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 1,
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color.lerp(skin.edge, Colors.white, 0.12)!,
                        skin.edge,
                        Color.lerp(skin.edge, Colors.black, 0.5)!,
                      ],
                    ),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.5),
                        blurRadius: 16,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(11),
                    child: Column(
                      children: [
                        // B I N G O header.
                        Row(
                          children: [
                            for (final letter in _letters)
                              Expanded(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 5),
                                  decoration: BoxDecoration(
                                    color: AppColors.electricPurple.withValues(alpha: 0.35),
                                    border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                                  ),
                                  child: Center(
                                    child: Text(
                                      letter,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w900,
                                        fontSize: 16,
                                        letterSpacing: 1.5,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        for (var r = 0; r < 5; r++)
                          Expanded(
                            child: Row(
                              children: [
                                for (var c = 0; c < 5; c++) _cell(card, marks, r, c, winLine),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _opponentsRow(view),
              const SizedBox(height: 10),
              ElevatedButton(
                onPressed: _myTurn ? _draw : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _myTurn ? AppColors.electricPurple : Colors.white.withValues(alpha: 0.08),
                  foregroundColor: Colors.white,
                  disabledForegroundColor: Colors.white38,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  elevation: _myTurn ? 6 : 0,
                ),
                child: Text(
                  _myTurn ? 'DRAW A BALL!' : 'WAITING…',
                  style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1.2, fontSize: 14),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _cell(
    List<List<int>> card,
    List<List<bool>> marks,
    int r,
    int c,
    List<List<int>> winLine,
  ) {
    final value = card[r][c];
    final marked = marks[r][c];
    final isFree = r == 2 && c == 2;
    final isWinning = winLine.any((p) => p[0] == r && p[1] == c);
    final isLast = _view.lastBall != null && value == _view.lastBall;

    Color bg;
    if (isWinning) {
      bg = Color.lerp(const Color(0xFFF5C542), Colors.white, 0.25 + 0.2 * _pulse.value)!;
    } else if (isFree) {
      bg = AppColors.softCyan.withValues(alpha: 0.30);
    } else if (marked) {
      bg = AppColors.electricPurple.withValues(alpha: 0.55);
    } else {
      bg = Colors.white.withValues(alpha: 0.07);
    }

    return Expanded(
      child: Container(
        margin: const EdgeInsets.all(1.2),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isWinning
                ? const Color(0xFFF5C542)
                : isLast
                    ? Colors.white
                    : Colors.white.withValues(alpha: 0.10),
            width: isWinning || isLast ? 1.8 : 0.8,
          ),
          boxShadow: isWinning || isLast
              ? [
                  BoxShadow(
                    color: (isWinning ? const Color(0xFFF5C542) : Colors.white).withValues(alpha: 0.5),
                    blurRadius: 10,
                  ),
                ]
              : null,
        ),
        child: Center(
          child: isFree
              ? Icon(
                  Icons.star_rounded,
                  color: AppColors.softCyan.withValues(alpha: 0.9),
                  size: 26,
                )
              : Text(
                  '$value',
                  style: TextStyle(
                    color: marked ? Colors.white : Colors.white.withValues(alpha: 0.85),
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                    shadows: marked
                        ? const [Shadow(color: Colors.black54, blurRadius: 3)]
                        : null,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _cageStrip(_BingoView view) {
    final recent = view.drawn.length > 12 ? view.drawn.sublist(view.drawn.length - 12) : view.drawn;
    return SizedBox(
      height: 46,
      child: Row(
        children: [
          const SizedBox(width: 4),
          Icon(Icons.format_list_numbered,
              color: AppColors.textSecondary.withValues(alpha: 0.8), size: 16),
          const SizedBox(width: 6),
          Expanded(
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: recent.length,
              separatorBuilder: (_, __) => const SizedBox(width: 5),
              itemBuilder: (context, i) {
                final ball = recent[i];
                final isLast = i == recent.length - 1;
                return Container(
                  width: isLast ? 38 : 30,
                  height: isLast ? 38 : 30,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      center: const Alignment(-0.3, -0.4),
                      colors: isLast
                          ? const [Color(0xFFFFFFFF), Color(0xFFFFE9A8), Color(0xFFE8A93C)]
                          : const [Color(0xFFE8EDF7), Color(0xFFB9C4D9), Color(0xFF7E8CA6)],
                    ),
                    border: Border.all(
                      color: isLast ? const Color(0xFFF5C542) : Colors.transparent,
                      width: 2,
                    ),
                    boxShadow: isLast
                        ? [
                            BoxShadow(
                              color: const Color(0xFFF5C542).withValues(alpha: 0.6),
                              blurRadius: 12,
                            ),
                          ]
                        : null,
                  ),
                  child: Text(
                    '$ball',
                    style: TextStyle(
                      color: isLast ? const Color(0xFF5A3E10) : const Color(0xFF2A3348),
                      fontWeight: FontWeight.w900,
                      fontSize: isLast ? 15 : 12,
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(width: 4),
        ],
      ),
    );
  }

  Widget _opponentsRow(_BingoView view) {
    final total = widget.session.seats.length;
    if (total <= 1) return const SizedBox.shrink();
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        for (var seat = 0; seat < total; seat++)
          if (seat != widget.mySeat)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.visibility_off_rounded,
                    size: 12, color: AppColors.textSecondary.withValues(alpha: 0.7)),
                const SizedBox(width: 3),
                Text(
                  _seatLabel(seat),
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
      ],
    );
  }

  String _statusText(_BingoView view) {
    if (!widget.session.isInProgress) {
      final win = view.lastWin;
      if (win != null && win.seat == widget.mySeat) return 'BINGO! You win!';
      if (win != null) return 'Seat ${win.seat + 1} shouted BINGO';
      return 'Game over';
    }
    if (!_myTurn) return 'Waiting for the table…';
    return 'Your turn — draw the next ball from the cage';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

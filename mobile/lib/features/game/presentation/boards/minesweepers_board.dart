import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

class _MinesView {
  _MinesView(Map<String, dynamic> b)
      : width = (b['width'] as num?)?.toInt() ?? 9,
        height = (b['height'] as num?)?.toInt() ?? 9,
        mineCount = (b['mineCount'] as num?)?.toInt() ?? 10,
        cells = _cells(b['cells']),
        revealedSafe = (b['revealedSafe'] as num?)?.toInt() ?? 0,
        hits = _nums(b['hits']),
        lastReveal = _reveal(b['lastReveal']),
        log = _log(b['log']);

  final int width;
  final int height;
  final int mineCount;
  final List<_Cell> cells;
  final int revealedSafe;
  final List<int> hits;
  final _Reveal? lastReveal;
  final List<String> log;

  static List<_Cell> _cells(Object? raw) => ((raw as List?) ?? const [])
      .whereType<Map>()
      .map((m) => _Cell(
            m['mine'] == true,
            m['revealed'] == true,
            (m['adj'] as num?)?.toInt() ?? 0,
          ))
      .toList();

  static List<int> _nums(Object? raw) => ((raw as List?) ?? const []).whereType<num>().map((n) => n.toInt()).toList();
  static List<String> _log(Object? raw) => ((raw as List?) ?? const []).whereType<String>().toList();
  static _Reveal? _reveal(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    return _Reveal(
      (m['seat'] as num?)?.toInt() ?? 0,
      (m['x'] as num?)?.toInt() ?? 0,
      (m['y'] as num?)?.toInt() ?? 0,
      m['hitMine'] == true,
      (m['adj'] as num?)?.toInt() ?? 0,
    );
  }

  int idx(int x, int y) => y * width + x;
  _Cell at(int x, int y) => cells[idx(x, y)];
  int get totalSafe => width * height - mineCount;
}

class _Cell {
  const _Cell(this.mine, this.revealed, this.adj);
  final bool mine;
  final bool revealed;
  final int adj;
}

class _Reveal {
  const _Reveal(this.seat, this.x, this.y, this.hitMine, this.adj);
  final int seat;
  final int x;
  final int y;
  final bool hitMine;
  final int adj;
}

/// Minesweepers — Plato multiplayer duel, wave-8 board.
/// Shared 9×9 board, ten mines. Tap to reveal, flood-fill empties,
/// mine hits flash red and cost points.
class MinesweepersBoard extends StatefulWidget {
  const MinesweepersBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override
  State<MinesweepersBoard> createState() => _MinesState();
}

class _MinesState extends State<MinesweepersBoard> {
  String _skin = 'wood';
  _MinesView get _view => _MinesView(widget.session.board);
  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  Future<void> _reveal(int x, int y) async {
    if (!_myTurn) return;
    GameFeedback.tap();
    await widget.onAction('reveal', {'x': x, 'y': y});
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    return Column(
      children: [
        TurnIndicator(text: _statusText(view), highlight: _myTurn, icon: Icons.grid_on_rounded),
        const SizedBox(height: 8),
        BoardSkinRow(selected: _skin, onPick: (id) { GameFeedback.tap(); setState(()=>_skin=id);}),
        const SizedBox(height: 10),
        TableSurface(
          skin: skin,
          child: Column(
            children: [
              _scoreRow(view),
              const SizedBox(height: 10),
              AspectRatio(
                aspectRatio: 1,
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: LinearGradient(
                      begin: Alignment.topLeft, end: Alignment.bottomRight,
                      colors: [Color.lerp(skin.edge, Colors.white, 0.1)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.5)!],
                    ),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 14, offset: const Offset(0,6))],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: _grid(view),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text('${view.revealedSafe} / ${view.totalSafe} safe revealed · ${view.mineCount} mines', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
              if (view.log.isNotEmpty)
                Padding(padding: const EdgeInsets.only(top: 6), child: Text(view.log.last, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontStyle: FontStyle.italic))),
            ],
          ),
        ),
      ],
    );
  }

  Widget _grid(_MinesView view) {
    return Column(
      children: [
        for (var y=0; y<view.height; y++)
          Expanded(
            child: Row(
              children: [
                for (var x=0; x<view.width; x++) Expanded(child: _cell(view, x, y)),
              ],
            ),
          ),
      ],
    );
  }

  Widget _cell(_MinesView view, int x, int y) {
    final cell = view.at(x, y);
    final isLast = view.lastReveal != null && view.lastReveal!.x==x && view.lastReveal!.y==y;
    final revealed = cell.revealed;
    Color bg;
    Widget? content;
    Border? border;
    if (!revealed) {
      bg = const Color(0xFF2A3350);
      border = Border.all(color: Colors.white.withValues(alpha: 0.08));
      content = null;
    } else if (cell.mine) {
      bg = AppColors.danger.withValues(alpha: 0.35);
      border = Border.all(color: AppColors.danger.withValues(alpha: 0.7), width: 1.4);
      content = const Text('💣', style: TextStyle(fontSize: 14));
    } else if (cell.adj==0) {
      bg = Colors.white.withValues(alpha: 0.04);
      border = Border.all(color: Colors.white.withValues(alpha: 0.06));
    } else {
      bg = AppColors.softCyan.withValues(alpha: 0.12);
      border = Border.all(color: Colors.white.withValues(alpha: 0.08));
      content = Text('${cell.adj}', style: TextStyle(color: _numColor(cell.adj), fontSize: 14, fontWeight: FontWeight.w900));
    }
    return GestureDetector(
      onTap: !revealed && _myTurn ? () => _reveal(x, y) : null,
      child: Container(
        margin: const EdgeInsets.all(1),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(4),
          border: isLast ? Border.all(color: AppColors.softCyan, width: 1.6) : border,
          boxShadow: isLast ? [BoxShadow(color: AppColors.softCyan.withValues(alpha: 0.4), blurRadius: 6)] : null,
        ),
        child: Center(child: content),
      ),
    );
  }

  Color _numColor(int n) {
    switch(n) {
      case 1: return const Color(0xFF4ADE80);
      case 2: return const Color(0xFF60A5FA);
      case 3: return const Color(0xFFF87171);
      case 4: return const Color(0xFFFACC15);
      case 5: return const Color(0xFFA78BFA);
      case 6: return const Color(0xFFFF7EDB);
      default: return Colors.white;
    }
  }

  Widget _scoreRow(_MinesView view) {
    return Wrap(
      spacing: 8, runSpacing: 6, alignment: WrapAlignment.center,
      children: [
        for (var seat=0; seat<widget.session.seats.length; seat++)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: widget.session.currentSeat==seat && widget.session.isInProgress ? AppColors.electricPurple.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: widget.session.currentSeat==seat && widget.session.isInProgress ? AppColors.softCyan : Colors.white.withValues(alpha: 0.12)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(_seatLabel(seat), style: TextStyle(color: seat==widget.mySeat?AppColors.softCyan:AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
              const SizedBox(width: 6),
              Text('${widget.session.scores.length>seat?widget.session.scores[seat]:0}', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900)),
              if (view.hits.length>seat && view.hits[seat]>0) ...[
                const SizedBox(width: 6),
                Text('💥${view.hits[seat]}', style: const TextStyle(color: AppColors.danger, fontSize: 11, fontWeight: FontWeight.w800)),
              ],
            ]),
          ),
      ],
    );
  }

  String _statusText(_MinesView view) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat==null) return 'All safe cells cleared — a tie';
      return widget.session.winnerSeat==widget.mySeat ? 'Flag planted — you win!' : 'They swept cleaner…';
    }
    if (!_myTurn) return 'Waiting for their sweep…';
    final last = view.lastReveal;
    if (last!=null && last.hitMine && last.seat==widget.mySeat) return 'Boom! Pick carefully next time';
    if (last!=null && !last.hitMine && last.seat==widget.mySeat && last.adj==0) return 'Nice basin — keep flowing!';
    return 'Tap a hidden cell to reveal';
  }
  String _seatLabel(int seat) {
    if (seat>=widget.session.seats.length) return 'Seat ${seat+1}';
    return seat==widget.mySeat?'You':widget.session.seats[seat].displayName;
  }
}

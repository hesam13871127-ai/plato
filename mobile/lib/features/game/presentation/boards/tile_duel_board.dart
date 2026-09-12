import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

const _dirs = ['left', 'right', 'up', 'down'];
const _n = 4;

/// One 4×4 grid, row-major (mirrors the server engine).
class _Grid {
  _Grid(this.cells);
  final List<int> cells;

  List<int> get flat => List<int>.from(cells);
  int get score => cells.fold(0, (a, b) => a + b);
  bool get stuck => legalDirs(this).isEmpty;
}

List<int> _slideRowLeft(List<int> row) {
  final vals = row.where((v) => v != 0).toList();
  final out = <int>[];
  for (var i = 0; i < vals.length; i++) {
    if (i + 1 < vals.length && vals[i] == vals[i + 1]) {
      out.add(vals[i] * 2);
      i++;
    } else {
      out.add(vals[i]);
    }
  }
  while (out.length < _n) out.add(0);
  return out;
}

List<int>? _applyDir(List<int> grid, String dir) {
  final lines = <List<int>>[];
  for (var i = 0; i < _n; i++) {
    if (dir == 'left') {
      lines.add(grid.sublist(i * _n, i * _n + _n));
    } else if (dir == 'right') {
      lines.add(grid.sublist(i * _n, i * _n + _n).reversed.toList());
    } else if (dir == 'up') {
      lines.add([grid[i], grid[_n + i], grid[2 * _n + i], grid[3 * _n + i]]);
    } else {
      lines.add([grid[3 * _n + i], grid[2 * _n + i], grid[_n + i], grid[i]]);
    }
  }
  final moved = lines.map(_slideRowLeft).toList();
  var changed = false;
  for (var i = 0; i < _n && !changed; i++) {
    for (var j = 0; j < _n && !changed; j++) {
      if (moved[i][j] != lines[i][j]) changed = true;
    }
  }
  if (!changed) return null;

  final next = List<int>.filled(_n * _n, 0);
  for (var i = 0; i < _n; i++) {
    for (var j = 0; j < _n; j++) {
      if (dir == 'left') next[i * _n + j] = moved[i][j];
      else if (dir == 'right') next[i * _n + (_n - 1 - j)] = moved[i][j];
      else if (dir == 'up') next[j * _n + i] = moved[i][j];
      else next[(_n - 1 - j) * _n + i] = moved[i][j];
    }
  }
  return next;
}

List<String> legalDirs(_Grid grid) => _dirs.where((d) => _applyDir(grid.flat, d) != null).toList();

/// Parsed 2048-duel view.
class _DuelView {
  _DuelView(Map<String, dynamic> b)
      : grids = _grids(b['grids']),
        lastMoves = _moves(b['lastMoves']),
        passStreak = (b['passStreak'] as num?)?.toInt() ?? 0,
        log = _log(b['log']);

  final List<_Grid> grids;
  final List<_LastMove?> lastMoves;
  final int passStreak;
  final List<String> log;

  static List<_Grid> _grids(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map((g) => _Grid(g.whereType<num>().map((n) => n.toInt()).toList()))
      .toList();

  static List<_LastMove?> _moves(Object? raw) => ((raw as List?) ?? const []).map((m) {
        if (m == null) return null;
        final map = m as Map;
        return _LastMove((map['dir'] as String?) ?? '', (map['gained'] as num?)?.toInt() ?? 0);
      }).toList();

  static List<String> _log(Object? raw) =>
      ((raw as List?) ?? const []).whereType<String>().toList();

  _Grid gridFor(int seat) => grids.length > seat ? grids[seat] : _Grid(List<int>.filled(16, 0));
  _LastMove? lastFor(int seat) =>
      lastMoves.length > seat ? lastMoves[seat] : null;
}

class _LastMove {
  const _LastMove(this.dir, this.gained);
  final String dir;
  final int gained;
}

const _tileColors = {
  2: Color(0xFF3B4463),
  4: Color(0xFF4A5578),
  8: Color(0xFFE8A94A),
  16: Color(0xFFE88C4A),
  32: Color(0xFFE86E4A),
  64: Color(0xFFE8504A),
  128: Color(0xFFF5C542),
  256: Color(0xFFF0B429),
  512: Color(0xFFEDAB20),
  1024: Color(0xFFE9A219),
  2048: Color(0xFFF9F6F2),
};

/// 2048 Duel, wave-7 board.
///
/// Two private boards on one felt: yours on top (drag or use the arrow keys),
/// theirs below for watching. Tiles glow gold as they climb; forging the
/// 2048 tile ends the duel on the spot.
class TileDuelBoard extends StatefulWidget {
  const TileDuelBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<TileDuelBoard> createState() => _TileDuelBoardState();
}

class _TileDuelBoardState extends State<TileDuelBoard> {
  String _skin = 'wood';

  _DuelView get _view => _DuelView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  Future<void> _move(String dir) async {
    if (!_myTurn) return;
    GameFeedback.tap();
    await widget.onAction('move', {'dir': dir});
  }

  Future<void> _pass() async {
    if (!_myTurn) return;
    GameFeedback.tap();
    await widget.onAction('pass', {});
  }

  void _onPanEnd(DragEndDetails d) {
    if (!_myTurn) return;
    final v = d.velocity;
    double dx = d.delta.dx;
    double dy = d.delta.dy;
    if (v.pixelsPerSecond.dx.abs() > 300) dx = v.pixelsPerSecond.dx / 10;
    if (v.pixelsPerSecond.dy.abs() > 300) dy = v.pixelsPerSecond.dy / 10;
    if (dx.abs() < 24 && dy.abs() < 24) return;
    if (dx.abs() > dy.abs()) {
      _move(dx > 0 ? 'right' : 'left');
    } else {
      _move(dy > 0 ? 'down' : 'up');
    }
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    final myGrid = view.gridFor(widget.mySeat);
    final foeSeat = 1 - widget.mySeat;
    final foeGrid = view.gridFor(foeSeat);
    final iAmStuck = myGrid.stuck;

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view, myGrid, iAmStuck),
          highlight: _myTurn,
          icon: Icons.merge_rounded,
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
              _scoreRow(view),
              const SizedBox(height: 12),
              _boardLabel(view, 'YOUR BOARD', widget.mySeat, myGrid),
              const SizedBox(height: 6),
              AspectRatio(
                aspectRatio: 1,
                child: GestureDetector(
                  onPanEnd: _myTurn ? _onPanEnd : null,
                  child: _grid(myGrid, mine: true, skin: skin),
                ),
              ),
              const SizedBox(height: 10),
              _controls(iAmStuck),
              const SizedBox(height: 14),
              _boardLabel(view, 'OPPONENT', foeSeat, foeGrid),
              const SizedBox(height: 6),
              AspectRatio(
                aspectRatio: 1,
                child: _grid(foeGrid, mine: false, skin: skin),
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
          ),
        ),
      ],
    );
  }

  Widget _boardLabel(_DuelView view, String label, int seat, _Grid grid) {
    final last = view.lastFor(seat);
    final active = widget.session.currentSeat == seat && widget.session.isInProgress;
    return Row(
      children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: active ? AppColors.softCyan : Colors.white24)),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1)),
        if (active)
          const Text(' · TO MOVE', style: TextStyle(color: AppColors.softCyan, fontSize: 10, fontWeight: FontWeight.w900)),
        const Spacer(),
        if (grid.stuck)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(8)),
            child: const Text('STUCK', style: TextStyle(color: AppColors.danger, fontSize: 10, fontWeight: FontWeight.w900)),
          ),
        if (last != null && last.gained > 0)
          Text('merged +${last.gained}', style: const TextStyle(color: Color(0xFFF5C542), fontSize: 10, fontWeight: FontWeight.w800)),
      ],
    );
  }

  Widget _scoreRow(_DuelView view) {
    return Row(
      children: [
        Expanded(child: _chip(_seatLabel(widget.mySeat), view.gridFor(widget.mySeat).score, widget.mySeat)),
        const SizedBox(width: 10),
        Expanded(child: _chip(_seatLabel(1 - widget.mySeat), view.gridFor(1 - widget.mySeat).score, 1 - widget.mySeat)),
      ],
    );
  }

  Widget _chip(String name, int total, int seat) {
    final active = widget.session.currentSeat == seat && widget.session.isInProgress;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: active ? AppColors.electricPurple.withValues(alpha: 0.22) : Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: active ? AppColors.softCyan : Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(name, overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
          Text('$total', style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _grid(_Grid grid, {required bool mine, required BoardSkin skin}) {
    return Container(
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: Color.lerp(skin.edge, Colors.black, 0.45),
        border: Border.all(
          color: mine
              ? AppColors.softCyan.withValues(alpha: widget.session.isInProgress ? 0.35 : 0.12)
              : Colors.white.withValues(alpha: 0.12),
          width: mine && widget.session.isInProgress ? 1.6 : 1,
        ),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 10, offset: const Offset(0, 5)),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Column(
          children: [
            for (var r = 0; r < _n; r++)
              Expanded(
                child: Row(
                  children: [
                    for (var c = 0; c < _n; c++) _tile(grid.cells[r * _n + c]),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tile(int value) {
    final empty = value == 0;
    final bg = _tileColors[value] ?? const Color(0xFFE9A219);
    final big = value >= 2048;
    final fontSize = value.toString().length >= 5
        ? 10.0
        : value.toString().length == 4
            ? 13.0
            : 17.0;
    return Expanded(
      child: Container(
        margin: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: empty ? Colors.black.withValues(alpha: 0.28) : bg,
          borderRadius: BorderRadius.circular(7),
          border: Border.all(color: empty ? Colors.white.withValues(alpha: 0.05) : Colors.white.withValues(alpha: 0.14)),
          boxShadow: big
              ? [BoxShadow(color: const Color(0xFFF9F6F2).withValues(alpha: 0.7), blurRadius: 12)]
              : (value >= 512
                  ? [BoxShadow(color: bg.withValues(alpha: 0.35), blurRadius: 8)]
                  : null),
        ),
        child: Center(
          child: empty
              ? null
              : Text(
                  '$value',
                  style: TextStyle(
                    color: value <= 4 ? const Color(0xFFDDE4F5) : const Color(0xFF3A2405),
                    fontSize: fontSize,
                    fontWeight: FontWeight.w900,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _controls(bool iAmStuck) {
    if (iAmStuck) {
      return ElevatedButton.icon(
        onPressed: _myTurn ? _pass : null,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.danger.withValues(alpha: 0.8),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        icon: const Icon(Icons.hourglass_bottom_rounded, size: 18),
        label: Text(_myTurn ? 'STUCK — PASS THE TURN' : 'WAITING…',
            style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1)),
      );
    }
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _dirButton(Icons.keyboard_arrow_up_rounded, 'up', 'Up'),
        const SizedBox(width: 8),
        _dirButton(Icons.keyboard_arrow_down_rounded, 'down', 'Down'),
        const SizedBox(width: 8),
        _dirButton(Icons.keyboard_arrow_left_rounded, 'left', 'Left'),
        const SizedBox(width: 8),
        _dirButton(Icons.keyboard_arrow_right_rounded, 'right', 'Right'),
      ],
    );
  }

  Widget _dirButton(IconData icon, String dir, String label) {
    final enabled = _myTurn;
    return Tooltip(
      message: label,
      child: SizedBox(
        width: 58,
        height: 46,
        child: ElevatedButton(
          onPressed: enabled ? () => _move(dir) : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: enabled ? AppColors.electricPurple.withValues(alpha: 0.55) : Colors.white.withValues(alpha: 0.06),
            foregroundColor: Colors.white,
            disabledForegroundColor: Colors.white24,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
          child: Icon(icon, size: 26),
        ),
      ),
    );
  }

  String _statusText(_DuelView view, _Grid myGrid, bool iAmStuck) {
    if (!widget.session.isInProgress) {
      if (widget.session.winnerSeat == null) return 'Both boards stuck — a dead even duel';
      return widget.session.winnerSeat == widget.mySeat
          ? 'You forged the 2048 tile — victory!'
          : 'They forged 2048 first…';
    }
    if (!_myTurn) return 'Watching their board breathe…';
    if (iAmStuck) return 'No moves left — pass the turn';
    return 'Drag your board (or use the arrows) to slide a line';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }
}

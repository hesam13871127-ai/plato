import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed chess view — the engine exposes the full board (no hidden info).
class _ChessPiece {
  const _ChessPiece(this.t, this.s);
  final String t; // p n b r q k
  final int s; // 0 = white (bottom), 1 = black (top)
}

class _ChessView {
  _ChessView(Map<String, dynamic> b)
      : cells = _parse(b['cells'] ?? b['grid']),
        castlingK = _pair(b['castling']?['k']),
        castlingQ = _pair(b['castling']?['q']),
        ep = _intPair(b['ep']),
        lastMove = _lastMove(b['lastMove']),
        status = (b['status'] as String?) ?? 'playing';

  final List<List<_ChessPiece?>> cells;
  final List<bool>? castlingK; // [seat0, seat1]
  final List<bool>? castlingQ;
  final List<int>? ep;
  final _LastMove? lastMove;
  final String status;

  static List<List<_ChessPiece?>> _parse(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map(
        (row) => row
            .whereType<Map>()
            .map((p) => _ChessPiece((p['t'] as String?) ?? 'p', (p['s'] as num?)?.toInt() ?? 0))
            .toList(),
      )
      .toList();

  static List<bool>? _pair(Object? raw) =>
      raw is List && raw.length == 2 ? [raw[0] == true, raw[1] == true] : null;

  static List<int>? _intPair(Object? raw) {
    if (raw is List && raw.length == 2 && raw[0] is num && raw[1] is num) {
      return [(raw[0] as num).toInt(), (raw[1] as num).toInt()];
    }
    return null;
  }

  static _LastMove? _lastMove(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    final from = _intPair(m['from']);
    final to = _intPair(m['to']);
    if (from == null || to == null) return null;
    return _LastMove(from, to, m['captured'] as String?);
  }

  static const _startCount = {'p': 8, 'n': 2, 'b': 2, 'r': 2, 'q': 1};

  /// Material captured BY `seat` (pieces of the OTHER seat that are gone).
  int materialCapturedBy(int seat) {
    final alive = <String, int>{};
    for (final row in cells) {
      for (final p in row) {
        if (p != null && p.s != seat) alive[p.t] = (alive[p.t] ?? 0) + 1;
      }
    }
    var points = 0;
    const vals = {'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0};
    _startCount.forEach((t, n) {
      points += (n - (alive[t] ?? 0)) * (vals[t] ?? 0);
    });
    return points;
  }

  List<int>? kingOf(int seat) {
    for (var r = 0; r < cells.length; r++) {
      for (var c = 0; c < cells[r].length; c++) {
        final p = cells[r][c];
        if (p != null && p.s == seat && p.t == 'k') return [r, c];
      }
    }
    return null;
  }
}

class _LastMove {
  const _LastMove(this.from, this.to, this.captured);
  final List<int> from;
  final List<int> to;
  final String? captured;
}

/// One legal destination for the selected piece.
class _Target {
  const _Target(this.r, this.c, {this.capture = false, this.castle = false, this.promotion = false});
  final int r;
  final int c;
  final bool capture;
  final bool castle;
  final bool promotion;
}

const _glyphs = {'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚'};
const _files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/// Chess for two players, wave-2 3D board.
///
/// Full client-side rules mirror: sliding pieces, knight jumps, pawn pushes
/// and captures, en passant, promotion (picker sheet), castling with
/// through-check checks and king-safety filtering. Ivory vs charcoal sphere
/// pieces with gold-crowned kings, legal-move dots, last-move tint, pulsing
/// check glow and material trays.
class ChessBoard extends StatefulWidget {
  const ChessBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<ChessBoard> createState() => _ChessBoardState();
}

class _ChessBoardState extends State<ChessBoard> {
  String _skin = 'wood';
  List<int>? _selected;

  static const _palettes = <PiecePalette>[PiecePalette.white, PiecePalette.black];

  _ChessView get _view => _ChessView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  PiecePalette _paletteFor(int seat) => _palettes[seat % _palettes.length];

  // ── rules mirror (identical logic to the engine) ─────────────────────────

  bool _in(int r, int c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  List<_Target> _targetsFor(List<int> from) {
    final view = _view;
    if (from.length != 2 || from[0] < 0 || from[0] >= 8 || from[1] < 0 || from[1] >= 8) {
      return const [];
    }
    final piece = view.cells[from[0]][from[1]];
    if (piece == null || piece.s != widget.mySeat) return const [];
    final out = <_Target>[];

    void add(int r, int c, {bool capture = false}) {
      out.add(_Target(r, c, capture: capture));
    }

    if (piece.t == 'p') {
      final dir = widget.mySeat == 0 ? -1 : 1;
      final promoRow = widget.mySeat == 0 ? 0 : 7;
      final startRow = widget.mySeat == 0 ? 6 : 1;
      if (_in(from[0] + dir, from[1]) && view.cells[from[0] + dir][from[1]] == null) {
        out.add(_Target(from[0] + dir, from[1],
            promotion: from[0] + dir == promoRow));
        if (from[0] == startRow && view.cells[from[0] + 2 * dir][from[1]] == null) {
          add(from[0] + 2 * dir, from[1]);
        }
      }
      for (final dc in [-1, 1]) {
        final tr = from[0] + dir;
        final tc = from[1] + dc;
        if (!_in(tr, tc)) continue;
        final target = view.cells[tr][tc];
        if (target != null && target.s != widget.mySeat) {
          out.add(_Target(tr, tc, capture: true, promotion: tr == promoRow));
        } else if (target == null &&
            view.ep != null &&
            view.ep![0] == tr &&
            view.ep![1] == tc) {
          out.add(_Target(tr, tc, capture: true));
        }
      }
    } else if (piece.t == 'n' || piece.t == 'k') {
      const offsets = [
        [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
      ];
      const king8 = [
        [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
      ];
      for (final d in piece.t == 'n' ? offsets : king8) {
        final tr = from[0] + d[0];
        final tc = from[1] + d[1];
        if (!_in(tr, tc)) continue;
        final target = view.cells[tr][tc];
        if (target == null) {
          add(tr, tc);
        } else if (target.s != widget.mySeat) {
          add(tr, tc, capture: true);
        }
      }
    } else {
      const rookDirs = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
      ];
      const bishopDirs = [
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ];
      final dirs = piece.t == 'r'
          ? rookDirs
          : piece.t == 'b'
              ? bishopDirs
              : [...rookDirs, ...bishopDirs];
      for (final d in dirs) {
        var tr = from[0] + d[0];
        var tc = from[1] + d[1];
        while (_in(tr, tc)) {
          final target = view.cells[tr][tc];
          if (target == null) {
            add(tr, tc);
          } else {
            if (target.s != widget.mySeat) add(tr, tc, capture: true);
            break;
          }
          tr += d[0];
          tc += d[1];
        }
      }
    }

    // Castling: rights intact, path empty, not out of / through / into check.
    if (piece.t == 'k' && from[0] == _homeRank && from[1] == 4) {
      final hr = _homeRank;
      final enemy = 1 - widget.mySeat;
      final kRight = view.castlingK?[widget.mySeat] == true;
      final qRight = view.castlingQ?[widget.mySeat] == true;
      if (kRight &&
          view.cells[hr][5] == null &&
          view.cells[hr][6] == null &&
          view.cells[hr][7]?.t == 'r' &&
          view.cells[hr][7]!.s == widget.mySeat &&
          !_isAttacked(view, hr, 4, enemy) &&
          !_isAttacked(view, hr, 5, enemy) &&
          !_isAttacked(view, hr, 6, enemy)) {
        out.add(_Target(hr, 6, castle: true));
      }
      if (qRight &&
          view.cells[hr][1] == null &&
          view.cells[hr][2] == null &&
          view.cells[hr][3] == null &&
          view.cells[hr][0]?.t == 'r' &&
          view.cells[hr][0]!.s == widget.mySeat &&
          !_isAttacked(view, hr, 4, enemy) &&
          !_isAttacked(view, hr, 3, enemy) &&
          !_isAttacked(view, hr, 2, enemy)) {
        out.add(_Target(hr, 2, castle: true));
      }
    }

    // King-safety filter: simulate and reject moves that leave my king attacked.
    return out
        .where((t) => !_leavesKingInCheck(view, from, [t.r, t.c]))
        .toList();
  }

  int get _homeRank => widget.mySeat == 0 ? 7 : 0;

  bool _isAttacked(_ChessView view, int r, int c, int bySeat) {
    final cells = view.cells;
    final pr = r + (bySeat == 0 ? 1 : -1);
    for (final dc in [-1, 1]) {
      if (_in(pr, c + dc)) {
        final p = cells[pr][c + dc];
        if (p != null && p.s == bySeat && p.t == 'p') return true;
      }
    }
    const knight = [
      [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
    ];
    for (final d in knight) {
      final tr = r + d[0];
      final tc = c + d[1];
      if (!_in(tr, tc)) continue;
      final p = cells[tr][tc];
      if (p != null && p.s == bySeat && p.t == 'n') return true;
    }
    const king8 = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (final d in king8) {
      final tr = r + d[0];
      final tc = c + d[1];
      if (!_in(tr, tc)) continue;
      final p = cells[tr][tc];
      if (p != null && p.s == bySeat && p.t == 'k') return true;
    }
    const rookDirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    const bishopDirs = [
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (final d in rookDirs) {
      var tr = r + d[0];
      var tc = c + d[1];
      while (_in(tr, tc)) {
        final p = cells[tr][tc];
        if (p != null) {
          if (p.s == bySeat && (p.t == 'r' || p.t == 'q')) return true;
          break;
        }
        tr += d[0];
        tc += d[1];
      }
    }
    for (final d in bishopDirs) {
      var tr = r + d[0];
      var tc = c + d[1];
      while (_in(tr, tc)) {
        final p = cells[tr][tc];
        if (p != null) {
          if (p.s == bySeat && (p.t == 'b' || p.t == 'q')) return true;
          break;
        }
        tr += d[0];
        tc += d[1];
      }
    }
    return false;
  }

  /// Plays from→to on a scratch copy and reports whether my king ends up attacked.
  bool _leavesKingInCheck(_ChessView view, List<int> from, List<int> to) {
    final cells = view.cells.map((row) => row.toList()).toList();
    final piece = cells[from[0]][from[1]];
    if (piece == null) return false;

    // En passant: the captured pawn is NOT on the destination square.
    final isPawn = piece.t == 'p';
    if (isPawn && view.ep != null && to[0] == view.ep![0] && to[1] == view.ep![1]) {
      cells[to[0] + (widget.mySeat == 0 ? 1 : -1)][to[1]] = null;
    }
    cells[from[0]][from[1]] = null;
    cells[to[0]][to[1]] = piece;

    // Castling drags the rook along.
    if (piece.t == 'k' && (to[1] - from[1]).abs() == 2) {
      final hr = from[0];
      if (to[1] == 6) {
        cells[hr][5] = cells[hr][7];
        cells[hr][7] = null;
      } else {
        cells[hr][3] = cells[hr][0];
        cells[hr][0] = null;
      }
    }

    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        final p = cells[r][c];
        if (p != null && p.s == widget.mySeat && p.t == 'k') {
          // Quick re-attack scan on the scratch board.
          return _scratchAttacked(cells, r, c, 1 - widget.mySeat);
        }
      }
    }
    return false;
  }

  bool _scratchAttacked(List<List<_ChessPiece?>> cells, int r, int c, int bySeat) {
    final pr = r + (bySeat == 0 ? 1 : -1);
    for (final dc in [-1, 1]) {
      if (_in(pr, c + dc)) {
        final p = cells[pr][c + dc];
        if (p != null && p.s == bySeat && p.t == 'p') return true;
      }
    }
    const knight = [
      [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
    ];
    for (final d in knight) {
      final tr = r + d[0];
      final tc = c + d[1];
      if (!_in(tr, tc)) continue;
      final p = cells[tr][tc];
      if (p != null && p.s == bySeat && p.t == 'n') return true;
    }
    const king8 = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (final d in king8) {
      final tr = r + d[0];
      final tc = c + d[1];
      if (!_in(tr, tc)) continue;
      final p = cells[tr][tc];
      if (p != null && p.s == bySeat && p.t == 'k') return true;
    }
    const rookDirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];
    const bishopDirs = [
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (final d in rookDirs) {
      var tr = r + d[0];
      var tc = c + d[1];
      while (_in(tr, tc)) {
        final p = cells[tr][tc];
        if (p != null) {
          if (p.s == bySeat && (p.t == 'r' || p.t == 'q')) return true;
          break;
        }
        tr += d[0];
        tc += d[1];
      }
    }
    for (final d in bishopDirs) {
      var tr = r + d[0];
      var tc = c + d[1];
      while (_in(tr, tc)) {
        final p = cells[tr][tc];
        if (p != null) {
          if (p.s == bySeat && (p.t == 'b' || p.t == 'q')) return true;
          break;
        }
        tr += d[0];
        tc += d[1];
      }
    }
    return false;
  }

  // ── interaction ───────────────────────────────────────────────────────────

  void _tapCell(int r, int c) {
    if (!_myTurn) return;
    final view = _view;
    final piece = view.cells[r][c];

    if (piece != null && piece.s == widget.mySeat) {
      GameFeedback.tap();
      setState(() => _selected = [r, c]);
      return;
    }

    final selected = _selected;
    if (selected == null) return;
    final targets = _targetsFor(selected);
    final target = targets.where((t) => t.r == r && t.c == c).toList();
    if (target.isEmpty) {
      GameFeedback.error();
      return;
    }
    if (target[0].promotion) {
      _pickPromotion(selected, [r, c]);
      return;
    }
    GameFeedback.move();
    widget.onAction('move', {
      'from': [selected[0], selected[1]],
      'to': [r, c],
    });
    setState(() => _selected = null);
  }

  Future<void> _pickPromotion(List<int> from, List<int> to) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _PromotionSheet(palette: _paletteFor(widget.mySeat)),
    );
    if (choice == null || !mounted) return;
    GameFeedback.move();
    await widget.onAction('move', {
      'from': [from[0], from[1]],
      'to': [to[0], to[1]],
      'promotion': choice,
    });
    if (mounted) setState(() => _selected = null);
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.flag_rounded,
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
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _Tray(
                    palette: _paletteFor(0),
                    label: _seatLabel(0),
                    points: view.materialCapturedBy(0),
                  ),
                  _Tray(
                    palette: _paletteFor(1),
                    label: _seatLabel(1),
                    points: view.materialCapturedBy(1),
                  ),
                ],
              ),
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
                        blurRadius: 18,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Column(
                      children: [
                        for (var r = 0; r < 8; r++)
                          Expanded(
                            child: Row(
                              children: [
                                for (var c = 0; c < 8; c++) Expanded(child: _cell(view, r, c)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _statusText(_ChessView view) {
    if (!widget.session.isInProgress) {
      switch (view.status) {
        case 'checkmate':
          return 'Checkmate!';
        case 'stalemate':
          return 'Draw — stalemate';
        case 'fifty':
          return 'Draw — fifty quiet moves';
        case 'repetition':
          return 'Draw — threefold repetition';
        case 'material':
          return 'Draw — insufficient material';
      }
      return 'Game over';
    }
    if (!_myTurn) return 'Waiting for the table…';
    if (view.status == 'check') return 'You are in check — defend the king!';
    if (_selected != null) return 'Tap a highlighted square';
    return 'Your move — pick a piece';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }

  /// The king currently in check (for the pulsing red glow), if any.
  List<int>? _checkedKing(_ChessView view) {
    int? seat;
    if (view.status == 'checkmate') {
      final winner = widget.session.winnerSeat;
      if (winner != null) seat = 1 - winner;
    } else if (view.status == 'check') {
      seat = widget.session.currentSeat;
    }
    if (seat == null) return null;
    return view.kingOf(seat);
  }

  Widget _cell(_ChessView view, int r, int c) {
    final piece = r < view.cells.length && c < view.cells[r].length ? view.cells[r][c] : null;
    final isSelected = _selected != null && _selected![0] == r && _selected![1] == c;
    final targets = _selected != null ? _targetsFor(_selected!) : const <_Target>[];
    final target = targets.where((t) => t.r == r && t.c == c).toList();
    final isTarget = target.isNotEmpty;
    final isLastFrom = view.lastMove != null &&
        view.lastMove!.from[0] == r &&
        view.lastMove!.from[1] == c;
    final isLastTo = view.lastMove != null &&
        view.lastMove!.to[0] == r &&
        view.lastMove!.to[1] == c;
    final checked = _checkedKing(view);
    final isCheckedKing = checked != null && checked[0] == r && checked[1] == c;

    final light = (r + c) % 2 == 0; // a8 (0,0) is a light square
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _tapCell(r, c),
      child: Stack(
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: light
                  ? Color.lerp(skinEdge(), Colors.white, 0.62)
                  : Color.lerp(skinEdge(), Colors.black, 0.42),
            ),
            child: const SizedBox.expand(),
          ),
          if (isLastFrom || isLastTo)
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.softCyan.withValues(alpha: isLastTo ? 0.22 : 0.12),
                ),
              ),
            ),
          // Coordinates: files on the bottom rank, ranks on the a-file.
          if (r == 7)
            Positioned(
              right: 3,
              bottom: 1,
              child: Text(
                _files[c],
                style: TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w800,
                  color: light ? Colors.black38 : Colors.white38,
                ),
              ),
            ),
          if (c == 0)
            Positioned(
              left: 3,
              top: 1,
              child: Text(
                '${8 - r}',
                style: TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w800,
                  color: light ? Colors.black38 : Colors.white38,
                ),
              ),
            ),
          if (isCheckedKing)
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.3),
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.8), width: 1.6),
                ),
              ),
            ),
          if (piece != null)
            Center(
              child: _ChessDisc(
                palette: _paletteFor(piece.s),
                type: piece.t,
                selected: isSelected,
              ),
            ),
          if (isTarget && piece == null)
            Center(
              child: Container(
                width: 13,
                height: 13,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.softCyan.withValues(alpha: 0.6),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.7), width: 1.2),
                ),
              ),
            ),
          if (isTarget && piece != null)
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.danger, width: 2.4),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Color skinEdge() => BoardSkin.byId(_skin).feltTop;
}

// ── pieces ──────────────────────────────────────────────────────────────────

/// A glossy sphere chessman: ivory or charcoal with an embossed glyph; the
/// king carries a gold crown ring. Pulses softly while selected.
class _ChessDisc extends StatefulWidget {
  const _ChessDisc({
    required this.palette,
    required this.type,
    required this.selected,
  });

  final PiecePalette palette;
  final String type;
  final bool selected;

  @override
  State<_ChessDisc> createState() => _ChessDiscState();
}

class _ChessDiscState extends State<_ChessDisc> with SingleTickerProviderStateMixin {
  late final AnimationController _halo = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 800),
  );

  @override
  void initState() {
    super.initState();
    if (widget.selected) _halo.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant _ChessDisc old) {
    super.didUpdateWidget(old);
    if (widget.selected && !_halo.isAnimating) {
      _halo.repeat(reverse: true);
    } else if (!widget.selected && _halo.isAnimating) {
      _halo.stop();
      _halo.value = 0;
    }
  }

  @override
  void dispose() {
    _halo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.palette;
    final glyph = _glyphs[widget.type] ?? '♟';
    final glyphColor = p == PiecePalette.white ? const Color(0xFF3A3428) : const Color(0xFFEDE7DA);
    return SizedBox(
      width: 38,
      height: 38,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned(
            bottom: 1,
            child: Container(
              width: 30,
              height: 6,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.black.withValues(alpha: 0.45),
              ),
            ),
          ),
          if (widget.selected)
            Container(
              width: 38 + 8 * _halo.value,
              height: 38 + 8 * _halo.value,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.softCyan.withValues(alpha: 0.22 + 0.22 * _halo.value),
              ),
            ),
          Container(
            width: 33,
            height: 33,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                center: const Alignment(-0.35, -0.45),
                radius: 1.1,
                colors: [p.light, p.base, p.dark],
                stops: const [0.0, 0.55, 1.0],
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.3), width: 1),
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 4),
              ],
            ),
            child: Center(
              child: Text(
                glyph,
                style: TextStyle(
                  fontSize: 19,
                  height: 1.0,
                  color: glyphColor,
                  fontWeight: FontWeight.w700,
                  shadows: [
                    Shadow(
                      color: glyphColor.withValues(alpha: 0.5),
                      blurRadius: 1,
                      offset: const Offset(0.6, 0.6),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (widget.type == 'k')
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFF5C542), width: 1.6),
              ),
            ),
        ],
      ),
    );
  }
}

/// Material-balance tray chip for one seat.
class _Tray extends StatelessWidget {
  const _Tray({required this.palette, required this.label, required this.points});

  final PiecePalette palette;
  final String label;
  final int points;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 15,
          height: 15,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              center: const Alignment(-0.3, -0.4),
              colors: [palette.light, palette.base, palette.dark],
            ),
          ),
        ),
        const SizedBox(width: 5),
        Text(
          '$label · +$points',
          style: const TextStyle(
            color: AppColors.textSecondary,
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

/// Bottom sheet for choosing a promotion piece.
class _PromotionSheet extends StatelessWidget {
  const _PromotionSheet({required this.palette});

  final PiecePalette palette;

  @override
  Widget build(BuildContext context) {
    final options = <String, String>{'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight'};
    return Container(
      margin: const EdgeInsets.all(14),
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF141B2D),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.35)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Promote your pawn',
              style: TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final entry in options.entries)
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(entry.key),
                    child: Column(
                      children: [
                        Container(
                          width: 54,
                          height: 54,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              center: const Alignment(-0.35, -0.45),
                              colors: [palette.light, palette.base, palette.dark],
                            ),
                            border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.5)),
                          ),
                          child: Center(
                            child: Text(
                              _glyphs[entry.key] ?? '♛',
                              style: const TextStyle(
                                fontSize: 26,
                                color: palette == PiecePalette.white ? Color(0xFF3A3428) : Color(0xFFEDE7DA),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          entry.value,
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

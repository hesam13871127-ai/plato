import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed checkers view (the engine exposes the full board — no hidden info).
class _CheckerPiece {
  const _CheckerPiece(this.seat, this.isKing);
  final int seat;
  final bool isKing;
}

class _CheckersView {
  _CheckersView(Map<String, dynamic> b)
      : cells = _parse(b['cells']),
        mustJumpFrom = _pair(b['mustJumpFrom']),
        lastMove = _lastMove(b['lastMove']);

  final List<List<_CheckerPiece?>> cells;
  final List<int>? mustJumpFrom;
  final _LastMove? lastMove;

  static List<List<_CheckerPiece?>> _parse(Object? raw) => ((raw as List?) ?? const [])
      .whereType<List>()
      .map(
        (row) => row
            .whereType<Map>()
            .map(
              (p) => _CheckerPiece(
                (p['s'] as num?)?.toInt() ?? 0,
                (p['k'] as num?)?.toInt() == 1,
              ),
            )
            .toList(),
      )
      .toList();

  static List<int>? _pair(Object? raw) {
    if (raw is List && raw.length == 2 && raw[0] is num && raw[1] is num) {
      return [(raw[0] as num).toInt(), (raw[1] as num).toInt()];
    }
    return null;
  }

  static _LastMove? _lastMove(Object? raw) {
    final m = raw as Map?;
    if (m == null) return null;
    final from = _pair(m['from']);
    final to = _pair(m['to']);
    if (from == null || to == null) return null;
    return _LastMove(from, to, _pair(m['captured']), m['promoted'] == true);
  }

  int capturedBy(int seat) {
    // Each side starts with 12; captured = 12 - survivors of the OTHER seat.
    var alive = 0;
    for (final row in cells) {
      for (final p in row) {
        if (p != null && p.seat != seat) alive++;
      }
    }
    return 12 - alive;
  }
}

class _LastMove {
  const _LastMove(this.from, this.to, this.captured, this.promoted);
  final List<int> from;
  final List<int> to;
  final List<int>? captured;
  final bool promoted;
}

/// One legal target for the selected piece.
class _Target {
  const _Target(this.r, this.c, this.isJump);
  final int r;
  final int c;
  final bool isJump;
}

/// Checkers (English draughts) — wave-1 3D board.
///
/// A raised wooden-tone chequerboard with bevelled squares; pieces are lit
/// spheres (crowns get a gold ring). Tap a piece to see its legal targets —
/// jumps are mandatory and glow red-hot, multi-jump chains lock the selection
/// to the landing piece, and captured trays show each side's haul.
class CheckersBoard extends StatefulWidget {
  const CheckersBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<CheckersBoard> createState() => _CheckersBoardState();
}

class _CheckersBoardState extends State<CheckersBoard> {
  String _skin = 'wood';
  List<int>? _selected;

  static const _palettes = <PiecePalette>[PiecePalette.red, PiecePalette.white];

  _CheckersView get _view => _CheckersView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  PiecePalette _paletteFor(int seat) => _palettes[seat % _palettes.length];

  // ── Client mirror of the engine's move legality ──────────────────────────

  bool _dark(int r, int c) => (r + c) % 2 == 1;

  List<_Target> _targetsFor(List<int> from) {
    final view = _view;
    if (from.length != 2 ||
        from[0] < 0 ||
        from[0] >= view.cells.length ||
        from[1] < 0 ||
        from[1] >= view.cells.length) {
      return const [];
    }
    final piece = view.cells[from[0]][from[1]];
    if (piece == null || piece.seat != widget.mySeat) return const [];

    final f = widget.mySeat == 0 ? 1 : -1;
    final dirs = piece.isKing
        ? const [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]
        : [
            [f, 1],
            [f, -1],
          ];

    final steps = <_Target>[];
    final jumps = <_Target>[];
    for (final d in dirs) {
      final nr = from[0] + d[0];
      final nc = from[1] + d[1];
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      final target = view.cells[nr][nc];
      if (target == null) {
        steps.add(_Target(nr, nc, false));
      } else if (target.seat != widget.mySeat) {
        final jr = from[0] + 2 * d[0];
        final jc = from[1] + 2 * d[1];
        if (jr >= 0 && jr <= 7 && jc >= 0 && jc <= 7 && view.cells[jr][jc] == null) {
          jumps.add(_Target(jr, jc, true));
        }
      }
    }

    // Captures are mandatory — mirror the engine.
    if (view.mustJumpFrom != null) return jumps;
    if (jumps.isNotEmpty) return jumps;
    return steps;
  }

  bool get _hasAnyJump {
    final view = _view;
    for (var r = 0; r < view.cells.length; r++) {
      for (var c = 0; c < view.cells[r].length; c++) {
        final piece = view.cells[r][c];
        if (piece != null && piece.seat == widget.mySeat) {
          if (_targetsFor([r, c]).any((t) => t.isJump)) return true;
        }
      }
    }
    return false;
  }

  void _tapCell(int r, int c) {
    if (!_myTurn) return;
    final view = _view;
    final piece = view.cells[r][c];

    // Selecting one of my pieces (locked to the chain when jumping).
    if (piece != null && piece.seat == widget.mySeat) {
      if (view.mustJumpFrom != null &&
          (r != view.mustJumpFrom![0] || c != view.mustJumpFrom![1])) {
        GameFeedback.error();
        return;
      }
      GameFeedback.tap();
      setState(() => _selected = [r, c]);
      return;
    }

    // Moving to a target.
    final selected = _selected;
    if (selected == null) return;
    final targets = _targetsFor(selected);
    final target = targets.where((t) => t.r == r && t.c == c).toList();
    if (target.isEmpty) {
      GameFeedback.error();
      return;
    }
    GameFeedback.move();
    widget.onAction('move', {
      'from': [selected[0], selected[1]],
      'to': [r, c],
    });
    setState(() => _selected = null);
  }

  @override
  Widget build(BuildContext context) {
    final view = _view;
    final skin = BoardSkin.byId(_skin);
    final anyJump = _myTurn && view.mustJumpFrom != null;

    return Column(
      children: [
        TurnIndicator(
          text: _statusText(view),
          highlight: _myTurn,
          icon: Icons.grid_view_rounded,
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
                    captured: view.capturedBy(0),
                  ),
                  if (anyJump)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.danger),
                      ),
                      child: const Text(
                        'JUMP CHAIN — keep going!',
                        style: TextStyle(
                          color: AppColors.danger,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ),
                  _Tray(
                    palette: _paletteFor(1),
                    label: _seatLabel(1),
                    captured: view.capturedBy(1),
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

  String _statusText(_CheckersView view) {
    if (!widget.session.isInProgress) {
      return view.lastMove?.promoted == true ? 'Crowned for the win!' : 'Game over';
    }
    if (!_myTurn) return 'Waiting for the table…';
    if (view.mustJumpFrom != null) return 'Chain jump — continue from the glowing piece';
    if (_hasAnyJump) return 'Your jump — captures are mandatory';
    return _selected != null ? 'Tap a highlighted square' : 'Your move — pick a piece';
  }

  String _seatLabel(int seat) {
    if (seat >= widget.session.seats.length) return 'Seat ${seat + 1}';
    return seat == widget.mySeat ? 'You' : widget.session.seats[seat].displayName;
  }

  Widget _cell(_CheckersView view, int r, int c) {
    final piece = r < view.cells.length && c < view.cells[r].length ? view.cells[r][c] : null;
    final isSelected = _selected != null && _selected![0] == r && _selected![1] == c;
    final isChainPiece =
        view.mustJumpFrom != null && view.mustJumpFrom![0] == r && view.mustJumpFrom![1] == c;
    final isLast = view.lastMove != null &&
        view.lastMove!.to[0] == r &&
        view.lastMove!.to[1] == c;
    final targets = _selected != null ? _targetsFor(_selected!) : const <_Target>[];
    final target = targets.where((t) => t.r == r && t.c == c).toList();
    final isTarget = target.isNotEmpty;

    final dark = _dark(r, c);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _tapCell(r, c),
      child: Stack(
        children: [
          // The square: light/dark with bevel light and shadow.
          DecoratedBox(
            decoration: BoxDecoration(
              color: dark
                  ? Color.lerp(skinEdgeColor(), Colors.black, 0.42)
                  : Color.lerp(skinEdgeColor(), Colors.white, 0.55),
              boxShadow: [
                BoxShadow(
                  color: dark ? Colors.black.withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.06),
                  blurRadius: 2,
                  offset: const Offset(0, 1),
                ),
              ],
            ),
            child: const SizedBox.expand(),
          ),
          if (isLast && piece != null)
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.6), width: 1.6),
                ),
              ),
            ),
          if (piece != null)
            Center(
              child: _CheckerDisc(
                palette: _paletteFor(piece.seat),
                isKing: piece.isKing,
                selected: isSelected || isChainPiece,
                chain: isChainPiece,
              ),
            ),
          if (isTarget)
            Center(
              child: Container(
                width: target[0].isJump ? 22 : 14,
                height: target[0].isJump ? 22 : 14,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: target[0].isJump
                      ? AppColors.danger.withValues(alpha: 0.75)
                      : AppColors.softCyan.withValues(alpha: 0.55),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.7), width: 1.4),
                  boxShadow: [
                    BoxShadow(
                      color: (target[0].isJump ? AppColors.danger : AppColors.softCyan)
                          .withValues(alpha: 0.55),
                      blurRadius: 8,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Color skinEdgeColor() {
    final skin = BoardSkin.byId(_skin);
    return skin.feltTop;
  }
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/// A lit checker: sphere body, contact shadow, gold crown ring for kings and
/// a pulsing white halo when selected / mid-chain.
class _CheckerDisc extends StatefulWidget {
  const _CheckerDisc({
    required this.palette,
    required this.isKing,
    required this.selected,
    required this.chain,
  });

  final PiecePalette palette;
  final bool isKing;
  final bool selected;
  final bool chain;

  @override
  State<_CheckerDisc> createState() => _CheckerDiscState();
}

class _CheckerDiscState extends State<_CheckerDisc>
    with SingleTickerProviderStateMixin {
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
  void didUpdateWidget(covariant _CheckerDisc old) {
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
    return SizedBox(
      width: 38,
      height: 38,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Contact shadow.
          Positioned(
            bottom: 1,
            child: Container(
              width: 32,
              height: 6,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.black.withValues(alpha: 0.45),
              ),
            ),
          ),
          // Pulsing halo when selected or mid-chain.
          if (widget.selected)
            Container(
              width: 38 + 8 * _halo.value,
              height: 38 + 8 * _halo.value,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: (widget.chain ? AppColors.danger : AppColors.softCyan)
                    .withValues(alpha: 0.25 + 0.25 * _halo.value),
              ),
            ),
          // The body.
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                center: const Alignment(-0.35, -0.45),
                radius: 1.1,
                colors: [p.light, p.base, p.dark],
                stops: const [0.0, 0.55, 1.0],
              ),
              border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 1),
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 4),
              ],
            ),
            child: widget.isKing
                ? Center(
                    child: Container(
                      width: 18,
                      height: 18,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const RadialGradient(
                          center: Alignment(-0.3, -0.4),
                          colors: [Color(0xFFFFE27A), Color(0xFFFBBF24), Color(0xFFEA580C)],
                        ),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
                      ),
                      child: const Center(
                        child: Icon(Icons.workspace_premium_rounded, size: 11, color: Color(0xFF3A2A05)),
                      ),
                    ),
                  )
                : Center(
                    child: Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: p.dark.withValues(alpha: 0.65), width: 2),
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

/// Captured-pieces tray chip for one seat.
class _Tray extends StatelessWidget {
  const _Tray({required this.palette, required this.label, required this.captured});

  final PiecePalette palette;
  final String label;
  final int captured;

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
          '$label · $captured',
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 11.5, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}

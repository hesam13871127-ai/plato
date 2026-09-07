import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Chess: an 8×8 board. Server rank 0 is Black's back rank; White (seat 0)
/// sits at the bottom and Black sees the board flipped. Tap a piece, then a
/// highlighted target. Legal moves, the last move and check status come from
/// the server, so the board can guide the player without duplicating rules.
/// Pieces are drawn as bevelled 3D-style glyph tiles in each seat's piece set.
class ChessBoard extends StatefulWidget {
  const ChessBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<ChessBoard> createState() => _ChessBoardState();
}

class _ChessBoardState extends State<ChessBoard> {
  List<int>? _selected; // [rank, file]

  Map<String, dynamic> get b => widget.session.board;

  List<List<String>> get _grid {
    final raw = (b['board'] as List?) ?? const [];
    return raw.map((row) => (row as List).map((c) => (c as String?) ?? '').toList()).toList();
  }

  List<List<List<int>>> get _legal {
    final raw = (b['legal'] as List?) ?? const [];
    return raw.whereType<Map>().map((m) {
      final from = (m['from'] as List).map((n) => (n as num).toInt()).toList();
      final to = (m['to'] as List).map((n) => (n as num).toInt()).toList();
      return [from, to];
    }).toList();
  }

  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;
  bool _isWhite(String p) => p.isNotEmpty && p == p.toUpperCase();

  void _tap(int r, int f) {
    if (!_myTurn) return;
    final grid = _grid;
    if (grid.isEmpty) return;
    final piece = grid[r][f];
    final myColorIsWhite = widget.mySeat == 0;
    final legal = _legal;

    if (_selected != null) {
      final sr = _selected![0];
      final sf = _selected![1];
      if (sr == r && sf == f) {
        setState(() => _selected = null);
        return;
      }
      final isLegal = legal.isEmpty || legal.any((m) => m[0][0] == sr && m[0][1] == sf && m[1][0] == r && m[1][1] == f);
      if (isLegal) {
        GameFeedback.move();
        widget.onAction('move', {
          'from': [sr, sf],
          'to': [r, f],
        });
        setState(() => _selected = null);
        return;
      }
    }
    if (piece.isNotEmpty && _isWhite(piece) == myColorIsWhite) {
      GameFeedback.tap();
      setState(() => _selected = [r, f]);
    } else {
      setState(() => _selected = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final grid = _grid;
    final turnColor = (b['turnColor'] as String?) ?? 'w';
    final captured = b['captured'] as Map?;
    final inCheck = (b['inCheck'] as bool?) ?? false;
    final last = b['lastMove'] as Map?;
    final lastFrom = (last?['from'] as List?)?.map((n) => (n as num).toInt()).toList();
    final lastTo = (last?['to'] as List?)?.map((n) => (n as num).toInt()).toList();
    final legal = _legal;
    final targets = <String>{
      if (_selected != null)
        for (final m in legal.where((m) => m[0][0] == _selected![0] && m[0][1] == _selected![1])) '${m[1][0]}:${m[1][1]}',
    };
    final playground = TableSkins.playgroundFor(widget.session, widget.mySeat);
    final flip = widget.mySeat == 1;
    final whiteSkin = TableSkins.pieceSkin(widget.session.cosmeticsOf(0).piece);
    final blackSkin = TableSkins.pieceSkin(widget.session.cosmeticsOf(1).piece);

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? (_myTurn
                  ? (inCheck ? 'Check! Protect your king' : 'Your move (${turnColor == 'w' ? 'White' : 'Black'})')
                  : (inCheck ? 'Opponent is in check…' : 'Opponent thinking…'))
              : 'Game over',
          highlight: _myTurn,
          icon: Icons.shield_outlined,
        ),
        const SizedBox(height: 6),
        if (captured != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _CapturedRow(
                  pieces: (captured[flip ? 'b' : 'w'] as List?)?.cast<String>() ?? const [],
                  label: widget.mySeat < 0 ? 'White' : 'You',
                  capturerIsWhite: !flip,
                ),
                _CapturedRow(
                  pieces: (captured[flip ? 'w' : 'b'] as List?)?.cast<String>() ?? const [],
                  label: widget.mySeat < 0 ? 'Black' : 'Foe',
                  capturerIsWhite: flip,
                ),
              ],
            ),
          ),
        Playground(
          skin: playground,
          padding: const EdgeInsets.all(8),
          child: grid.isEmpty
              ? const SizedBox(height: 300, child: Center(child: Text('Setting up…', style: TextStyle(color: AppColors.textMuted))))
              : AspectRatio(
                  aspectRatio: 1,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final cell = constraints.maxWidth / 8;
                      return ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Column(
                          children: List.generate(8, (displayRow) {
                            final r = flip ? 7 - displayRow : displayRow;
                            return Expanded(
                              child: Row(
                                children: List.generate(8, (displayCol) {
                                  final f = flip ? 7 - displayCol : displayCol;
                                  final piece = grid[r][f];
                                  final dark = (r + f) % 2 == 1;
                                  final selected = _selected != null && _selected![0] == r && _selected![1] == f;
                                  final isTarget = targets.contains('$r:$f');
                                  final isLast = (lastFrom != null && lastFrom[0] == r && lastFrom[1] == f) ||
                                      (lastTo != null && lastTo[0] == r && lastTo[1] == f);
                                  final kingInCheck = inCheck &&
                                      piece.isNotEmpty &&
                                      piece.toLowerCase() == 'k' &&
                                      (_isWhite(piece) ? 'w' : 'b') == turnColor;
                                  return Expanded(
                                    child: GestureDetector(
                                      behavior: HitTestBehavior.opaque,
                                      onTap: () => _tap(r, f),
                                      child: Stack(
                                        alignment: Alignment.center,
                                        children: [
                                          AnimatedContainer(
                                            duration: const Duration(milliseconds: 140),
                                            decoration: BoxDecoration(
                                              color: selected
                                                  ? playground.accent.withValues(alpha: 0.55)
                                                  : kingInCheck
                                                      ? AppColors.danger.withValues(alpha: 0.65)
                                                      : isLast
                                                          ? Color.lerp(dark ? playground.darkSquare : playground.lightSquare, playground.glow, 0.35)
                                                          : dark
                                                              ? playground.darkSquare
                                                              : playground.lightSquare,
                                            ),
                                          ),
                                          if (isTarget && piece.isEmpty)
                                            Container(
                                              width: cell * 0.3,
                                              height: cell * 0.3,
                                              decoration: BoxDecoration(
                                                shape: BoxShape.circle,
                                                color: playground.accent.withValues(alpha: 0.85),
                                                boxShadow: [BoxShadow(color: playground.accent.withValues(alpha: 0.7), blurRadius: 8)],
                                              ),
                                            ),
                                          if (isTarget && piece.isNotEmpty)
                                            Container(
                                              decoration: BoxDecoration(
                                                border: Border.all(color: playground.accent, width: 3),
                                                borderRadius: BorderRadius.circular(6),
                                              ),
                                            ),
                                          if (piece.isNotEmpty)
                                            AnimatedScale(
                                              duration: const Duration(milliseconds: 140),
                                              scale: selected ? 1.15 : 1,
                                              child: _ChessPiece(
                                                piece: piece,
                                                size: cell,
                                                skin: _isWhite(piece) ? whiteSkin : blackSkin,
                                                seat: _isWhite(piece) ? 0 : 1,
                                              ),
                                            ),
                                          // File/rank labels on edges.
                                          if (displayCol == 0)
                                            Positioned(
                                              left: 2,
                                              top: 1,
                                              child: Text('${8 - r}', style: TextStyle(fontSize: cell * 0.2, color: Colors.white.withValues(alpha: 0.35), fontWeight: FontWeight.w700)),
                                            ),
                                          if (displayRow == 7)
                                            Positioned(
                                              right: 2,
                                              bottom: 0,
                                              child: Text(String.fromCharCode(97 + f), style: TextStyle(fontSize: cell * 0.2, color: Colors.white.withValues(alpha: 0.35), fontWeight: FontWeight.w700)),
                                            ),
                                        ],
                                      ),
                                    ),
                                  );
                                }),
                              ),
                            );
                          }),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}

/// A chess piece drawn as a glyph with a bevelled 3D disc base in the seat's
/// piece-set material colours (so purchased sets restyle chess too).
class _ChessPiece extends StatelessWidget {
  const _ChessPiece({required this.piece, required this.size, required this.skin, required this.seat});
  final String piece;
  final double size;
  final PieceSkin skin;
  final int seat;

  static const _glyphs = {
    'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
  };

  @override
  Widget build(BuildContext context) {
    final isWhite = piece == piece.toUpperCase();
    // Default classic set keeps the traditional ivory/charcoal look; other
    // sets tint the pieces in their seat colours.
    final palette = skin.palette(seat);
    final useClassic = skin.id == 'classic' || skin.id == 'marble';
    final fill = useClassic ? (isWhite ? const Color(0xFFF7F3E8) : const Color(0xFF1B1E33)) : palette.light;
    final edge = useClassic ? (isWhite ? const Color(0xFFB9B1A0) : const Color(0xFF05060F)) : palette.dark;
    final glow = useClassic ? (isWhite ? const Color(0x66FFFFFF) : const Color(0x66000000)) : palette.glow.withValues(alpha: 0.5);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Base disc shadow for a "standing piece" feel.
          Positioned(
            bottom: size * 0.1,
            child: Container(
              width: size * 0.5,
              height: size * 0.16,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.all(Radius.elliptical(size * 0.25, size * 0.08)),
                color: Colors.black.withValues(alpha: 0.4),
                boxShadow: [BoxShadow(color: glow, blurRadius: 8, spreadRadius: 1)],
              ),
            ),
          ),
          Text(
            _glyphs[piece] ?? '',
            style: TextStyle(
              fontSize: size * 0.74,
              height: 1,
              color: fill,
              shadows: [
                Shadow(color: edge, offset: const Offset(0, 1.5), blurRadius: 0),
                Shadow(color: Colors.black.withValues(alpha: 0.55), offset: const Offset(0, 3), blurRadius: 4),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CapturedRow extends StatelessWidget {
  const _CapturedRow({required this.pieces, required this.label, required this.capturerIsWhite});
  final List<String> pieces;
  final String label;

  /// Pieces captured BY White are Black pieces (drawn dark) and vice versa.
  final bool capturerIsWhite;

  @override
  Widget build(BuildContext context) {
    const glyphs = {
      'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟',
      'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
    };
    return Row(
      children: [
        Text('$label ', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        for (final p in pieces.take(10))
          Text(
            glyphs[p] ?? '',
            style: TextStyle(
              fontSize: 15,
              color: capturerIsWhite ? const Color(0xFF1B1E33) : const Color(0xFFF7F3E8),
              shadows: const [Shadow(color: Colors.black54, blurRadius: 2)],
            ),
          ),
        if (pieces.length > 10) Text(' +${pieces.length - 10}', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
      ],
    );
  }
}

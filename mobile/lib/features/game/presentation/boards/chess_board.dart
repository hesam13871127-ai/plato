import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Chess — fully rebuilt 3D edition. 8×8 wooden board with beveled squares,
/// marble 3D piece tokens, last-move trail, check pulse and captured tray.
/// Supports the shop's wood/emerald/midnight board skins.
class ChessBoard extends StatefulWidget {
  const ChessBoard({super.key, required this.session, required this.mySeat, required this.onAction});
  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;
  @override
  State<ChessBoard> createState() => _ChessBoardState();
}

class _ChessBoardState extends State<ChessBoard> {
  List<int>? _selected;
  String _boardSkin = 'wood';

  Map<String, dynamic> get b => widget.session.board;
  List<List<String>> get _grid {
    final raw = (b['board'] as List?) ?? const [];
    return raw.map((row) => (row as List).map((c) => (c as String?) ?? '').toList()).toList();
  }

  bool get _myTurn => widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;
  bool _isWhite(String p) => p.isNotEmpty && p == p.toUpperCase();

  void _tap(int r, int f) {
    if (!_myTurn) return;
    final grid = _grid;
    if (grid.isEmpty) return;
    final piece = grid[r][f];
    final myIsWhite = widget.mySeat == 0;
    if (_selected != null) {
      final [sr, sf] = _selected!;
      if (sr == r && sf == f) { setState(() => _selected = null); return; }
      GameFeedback.move();
      widget.onAction('move', {'from': [sr, sf], 'to': [r, f]});
      setState(() => _selected = null);
      return;
    }
    if (piece.isNotEmpty && _isWhite(piece) == myIsWhite) {
      GameFeedback.tap();
      setState(() => _selected = [r, f]);
    }
  }

  @override
  Widget build(BuildContext context) {
    final grid = _grid;
    final turnColor = (b['turnColor'] as String?) ?? 'w';
    final captured = b['captured'] as Map?;
    final skin = BoardSkin.byId(_boardSkin);
    final lastMove = (b['lastMove'] as List?)?.cast<List>() ?? const [];
    final inCheck = b['inCheck'] as bool? ?? false;

    return Column(
      children: [
        TurnIndicator(
          text: widget.session.isInProgress
              ? (_myTurn ? 'Your move — ${turnColor == 'w' ? 'White' : 'Black'} to play' : 'Opponent thinking…')
              : 'Game over',
          highlight: _myTurn,
          icon: Icons.chess_outlined,
        ),
        const SizedBox(height: 6),
        // skin selector (free preview of shop skins)
        SizedBox(
          height: 28,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: BoardSkin.all.length,
            separatorBuilder: (_, __) => const SizedBox(width: 6),
            itemBuilder: (_, i) {
              final s = BoardSkin.all[i];
              final sel = s.id == _boardSkin;
              return GestureDetector(
                onTap: () { GameFeedback.tap(); setState(() => _boardSkin = s.id); },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    color: sel ? s.accent.withOpacity(0.9) : AppColors.glassFill,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: sel ? Colors.white70 : AppColors.glassStroke),
                  ),
                  alignment: Alignment.center,
                  child: Text(s.name, style: TextStyle(color: sel ? Colors.white : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        // Beveled outer frame
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: LinearGradient(colors: [Color.lerp(skin.edge, Colors.white, 0.12)!, skin.edge, Color.lerp(skin.edge, Colors.black, 0.4)!], begin: Alignment.topLeft, end: Alignment.bottomRight),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 22, offset: const Offset(0, 10)), BoxShadow(color: skin.accent.withOpacity(0.18), blurRadius: 30)],
            border: Border.all(color: Colors.white.withOpacity(0.14)),
          ),
          child: AspectRatio(
            aspectRatio: 1,
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 12, offset: const Offset(0, 6))],
              ),
              clipBehavior: Clip.antiAlias,
              child: grid.isEmpty
                  ? const Center(child: Text('Waiting for board…', style: TextStyle(color: AppColors.textMuted)))
                  : Column(
                      children: List.generate(8, (dr) {
                        final sr = dr;
                        return Expanded(
                          child: Row(
                            children: List.generate(8, (f) {
                              final piece = grid[sr][f];
                              final dark = (sr + f) % 2 == 1;
                              final sel = _selected != null && _selected![0] == sr && _selected![1] == f;
                              final isLast = lastMove.any((m) => (m[0] == sr && m[1] == f) || (m.length > 2 && m[2] == sr && m[3] == f));
                              // map board theme to square colors
                              final lightSq = Color.lerp(skin.feltTop, Colors.white, 0.55)!;
                              final darkSq = skin.feltTop;
                              return Expanded(
                                child: GestureDetector(
                                  onTap: () => _tap(sr, f),
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 180),
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                                        colors: sel
                                            ? [AppColors.softCyan, AppColors.electricPurple]
                                            : isLast
                                                ? [AppColors.cosmicGold.withOpacity(0.55), AppColors.cosmicGold.withOpacity(0.25)]
                                                : dark
                                                    ? [darkSq, Color.lerp(darkSq, Colors.black, 0.18)!]
                                                    : [lightSq, Color.lerp(lightSq, Colors.black, 0.08)!],
                                      ),
                                      border: sel ? Border.all(color: Colors.white, width: 1.6) : null,
                                      boxShadow: sel ? [BoxShadow(color: AppColors.softCyan.withOpacity(0.5), blurRadius: 10)] : null,
                                    ),
                                    child: Stack(
                                      children: [
                                        if (piece.isNotEmpty)
                                          Center(child: _ChessPieceToken(piece: piece, selected: sel, inCheck: inCheck && piece.toLowerCase() == 'k' && _isWhite(piece) == (turnColor == 'w'))),
                                        if (isLast)
                                          Positioned.fill(child: Container(color: AppColors.cosmicGold.withOpacity(0.12))),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            }),
                          ),
                        );
                      }),
                    ),
            ),
          ),
        ),
        if (captured != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.glassStroke)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _CapturedRow(pieces: (captured['w'] as List?)?.cast<String>() ?? const [], label: 'Captured by you'),
                  _CapturedRow(pieces: (captured['b'] as List?)?.cast<String>() ?? const [], label: 'Captured by foe'),
                ],
              ),
            ),
          ),
        const SizedBox(height: 6),
        Text('Tap a piece, then a destination. Shop → Board Themes to keep skins forever.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 11), textAlign: TextAlign.center),
      ],
    );
  }
}

class _ChessPieceToken extends StatelessWidget {
  const _ChessPieceToken({required this.piece, required this.selected, required this.inCheck});
  final String piece;
  final bool selected;
  final bool inCheck;
  @override
  Widget build(BuildContext context) {
    final isWhite = piece == piece.toUpperCase();
    final glyph = _glyph(piece);
    final base = isWhite ? const Color(0xFFF8FAFF) : const Color(0xFF1A2340);
    final rim = isWhite ? const Color(0xFFD6DEEE) : const Color(0xFF0B1020);
    return Container(
      margin: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(center: const Alignment(-0.3, -0.4), colors: [Color.lerp(base, Colors.white, 0.35)!, base, rim]),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.45), blurRadius: 6, offset: const Offset(0, 3)),
          if (selected) BoxShadow(color: AppColors.softCyan.withOpacity(0.7), blurRadius: 12),
          if (inCheck) BoxShadow(color: AppColors.danger.withOpacity(0.7), blurRadius: 14),
        ],
        border: Border.all(color: Colors.white.withOpacity(isWhite ? 0.9 : 0.18), width: 1.2),
      ),
      child: Center(
        child: Text(glyph, style: TextStyle(fontSize: 22, color: isWhite ? const Color(0xFF1A2340) : Colors.white, fontWeight: FontWeight.w900, shadows: [Shadow(color: Colors.black.withOpacity(0.4), blurRadius: 3)])),
      ),
    );
  }

  String _glyph(String p) {
    const m = {'K':'♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙','k':'♚','q':'♛','r':'♜','b':'♝','n':'♞','p':'♟'};
    return m[p] ?? '';
  }
}

class _CapturedRow extends StatelessWidget {
  const _CapturedRow({required this.pieces, required this.label});
  final List<String> pieces;
  final String label;
  @override
  Widget build(BuildContext context) {
    const glyphs = {'K':'♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙','k':'♚','q':'♛','r':'♜','b':'♝','n':'♞','p':'♟'};
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 10, fontWeight: FontWeight.w700)),
      const SizedBox(height: 2),
      Row(children: [for (final p in pieces.take(8)) Text(glyphs[p] ?? '', style: const TextStyle(fontSize: 14, color: AppColors.textSecondary)), if (pieces.length > 8) Text(' +${pieces.length-8}', style: const TextStyle(color: AppColors.textMuted, fontSize: 11))]),
    ]);
  }
}

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/game_entities.dart';
import '../skins/skinned_pieces.dart';
import '../skins/table_skins.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Dominoes. Ivory bone tiles with real pip layouts snake across the felt;
/// the two open ends glow so you always know what you need. Opponents sit
/// around the table with face-down tiles, the boneyard is a stack in the
/// corner. Tap a playable tile in your rack — if it fits both ends you pick
/// the end — and it slides onto the line. Draw or pass when stuck.
class DominoesBoard extends StatefulWidget {
  const DominoesBoard({super.key, required this.session, required this.mySeat, required this.onAction});

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<DominoesBoard> createState() => _DominoesBoardState();
}

class _DominoesBoardState extends State<DominoesBoard> {
  List<int>? _selected;
  bool _busy = false;
  final ScrollController _chainScroll = ScrollController();
  int _chainLength = 0;

  GameSessionView get session => widget.session;
  int get mySeat => widget.mySeat;

  List<List<int>> get _chain {
    final out = <List<int>>[];
    for (final link in session.dominoBoard?.chain ?? const <Map<String, dynamic>>[]) {
      final raw = link['tile'];
      if (raw is List && raw.length == 2) out.add([(raw[0] as num).toInt(), (raw[1] as num).toInt()]);
    }
    return out;
  }

  List<List<int>> get _hand => session.dominoBoard?.myHand ?? const <List<int>>[];
  List<int>? get _ends => session.dominoBoard?.ends;
  int get _boneyard => session.dominoBoard?.boneyard ?? 0;
  List<int> get _handSizes => session.dominoBoard?.handSizes ?? const <int>[];
  bool get _myTurn => session.isInProgress && session.currentSeat == mySeat;

  bool _fitsLeft(List<int> t) => _ends == null || t.contains(_ends![0]);
  bool _fitsRight(List<int> t) => _ends == null || t.contains(_ends![1]);
  bool _playable(List<int> t) => _fitsLeft(t) || _fitsRight(t);
  bool get _haveMove => _hand.any(_playable);

  @override
  void didUpdateWidget(covariant DominoesBoard old) {
    super.didUpdateWidget(old);
    final n = _chain.length;
    if (n != _chainLength) {
      _chainLength = n;
      if (n > 0) GameFeedback.move();
      // Keep the end that just grew in view.
      final grewLeft = _chain.isNotEmpty && !_sameTile(_chain.first, _firstTile(old.session));
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_chainScroll.hasClients) return;
        final target = grewLeft ? 0.0 : _chainScroll.position.maxScrollExtent;
        _chainScroll.animateTo(target, duration: const Duration(milliseconds: 380), curve: Curves.easeOut);
      });
    }
    if (_selected != null && !_hand.any((t) => _sameTile(t, _selected!))) _selected = null;
  }

  List<int>? _firstTile(GameSessionView s) {
    final c = s.dominoBoard?.chain;
    if (c == null || c.isEmpty) return null;
    final raw = c.first['tile'];
    if (raw is List && raw.length == 2) return [(raw[0] as num).toInt(), (raw[1] as num).toInt()];
    return null;
  }

  bool _sameTile(List<int>? a, List<int>? b) {
    if (a == null || b == null) return false;
    return (a[0] == b[0] && a[1] == b[1]) || (a[0] == b[1] && a[1] == b[0]);
  }

  @override
  void dispose() {
    _chainScroll.dispose();
    super.dispose();
  }

  Future<void> _play(List<int> tile, String? side) async {
    if (!_myTurn || _busy) return;
    setState(() {
      _busy = true;
      _selected = null;
    });
    GameFeedback.move();
    await widget.onAction('play_tile', {'tile': tile, if (side != null) 'side': side});
    if (mounted) setState(() => _busy = false);
  }

  void _tapTile(List<int> tile) {
    if (!_myTurn || _busy || !_playable(tile)) return;
    GameFeedback.tap();
    final both = _ends != null && _fitsLeft(tile) && _fitsRight(tile) && _ends![0] != _ends![1];
    if (!both) {
      _play(tile, _ends == null ? null : (_fitsLeft(tile) ? 'left' : 'right'));
      return;
    }
    setState(() => _selected = _sameTile(_selected, tile) ? null : tile);
  }

  Future<void> _draw() async {
    if (!_myTurn || _busy) return;
    setState(() => _busy = true);
    GameFeedback.roll();
    await widget.onAction('draw', {});
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _pass() async {
    if (!_myTurn || _busy) return;
    setState(() => _busy = true);
    GameFeedback.tap();
    await widget.onAction('pass', {});
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final chain = _chain;
    final hand = _hand;
    final ends = _ends;
    final sizes = _handSizes;
    final playground = TableSkins.playgroundFor(session, mySeat);
    final current = session.currentSeat;
    final seats = session.seats;
    final opponents = <int>[for (var i = 0; i < seats.length; i++) if (i != mySeat) i];

    String status;
    if (!session.isInProgress) {
      status = 'Game over';
    } else if (_myTurn) {
      if (_selected != null) {
        status = 'Which end? Tap the glowing ${ends![0]} or ${ends[1]}';
      } else if (_haveMove) {
        status = ends == null ? 'You lead — play any tile' : 'Your turn — match a ${ends[0]} or a ${ends[1]}';
      } else {
        status = _boneyard > 0 ? 'No match — draw from the boneyard' : 'No match and the boneyard is empty — pass';
      }
    } else {
      final name = current >= 0 && current < seats.length ? seats[current].displayName : 'Opponent';
      status = '$name is playing…';
    }

    return Column(
      children: [
        TurnIndicator(text: status, highlight: _myTurn, icon: Icons.casino_rounded),
        const SizedBox(height: 8),
        Playground(
          skin: playground,
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 8),
          child: Column(
            children: [
              // Opponents + boneyard.
              Row(
                children: [
                  for (final seat in opponents)
                    Expanded(
                      child: _OpponentRack(
                        session: session,
                        seat: seat,
                        tiles: seat < sizes.length ? sizes[seat] : 0,
                        active: session.isInProgress && current == seat,
                      ),
                    ),
                  _Boneyard(count: _boneyard, accent: playground.accent, canDraw: _myTurn && !_haveMove && _boneyard > 0 && !_busy, onTap: _draw),
                ],
              ),
              const SizedBox(height: 12),
              // The line.
              Container(
                height: 132,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  color: Colors.black.withValues(alpha: 0.18),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: chain.isEmpty
                    ? Center(
                        child: Text(
                          ends == null && _myTurn ? 'Play your first tile' : 'Waiting for the first tile…',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontWeight: FontWeight.w600),
                        ),
                      )
                    : ListView.builder(
                        controller: _chainScroll,
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        itemCount: chain.length,
                        itemBuilder: (context, i) {
                          final tile = chain[i];
                          final isDouble = tile[0] == tile[1];
                          final leftEnd = i == 0;
                          final rightEnd = i == chain.length - 1;
                          final glowLeft = leftEnd && _myTurn && _selected != null && _fitsLeft(_selected!);
                          final glowRight = rightEnd && _myTurn && _selected != null && _fitsRight(_selected!);
                          return Center(
                            child: GestureDetector(
                              onTap: glowLeft ? () => _play(_selected!, 'left') : (glowRight ? () => _play(_selected!, 'right') : null),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 2),
                                child: _EndHighlight(
                                  active: glowLeft || glowRight,
                                  accent: playground.accent,
                                  child: _DominoTile(
                                    a: tile[0],
                                    b: tile[1],
                                    horizontal: !isDouble,
                                    size: 30,
                                    openLeft: leftEnd && ends != null,
                                    openRight: rightEnd && ends != null,
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
              const SizedBox(height: 8),
              // Open ends legend.
              if (ends != null)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _EndBadge(label: 'Left end', value: ends[0], accent: playground.accent),
                    const SizedBox(width: 12),
                    _EndBadge(label: 'Right end', value: ends[1], accent: playground.accent),
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // My rack.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Column(
            children: [
              Row(
                children: [
                  const SizedBox(width: 8),
                  Text('Your tiles · ${hand.length}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
                  const Spacer(),
                  if (_myTurn && !_haveMove)
                    _boneyard > 0
                        ? ActionButton(label: 'Draw', icon: Icons.download_rounded, expanded: false, onPressed: _busy ? null : _draw)
                        : ActionButton(label: 'Pass', icon: Icons.skip_next_rounded, expanded: false, color: AppColors.surfaceElevated, onPressed: _busy ? null : _pass),
                  const SizedBox(width: 8),
                ],
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 96,
                child: hand.isEmpty
                    ? Center(child: Text(session.isInProgress ? 'No tiles' : '—', style: const TextStyle(color: AppColors.textMuted)))
                    : ListView.separated(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        itemCount: hand.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (context, i) {
                          final tile = hand[i];
                          final playable = _myTurn && _playable(tile);
                          final selected = _sameTile(_selected, tile);
                          return GestureDetector(
                            onTap: () => _tapTile(tile),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 160),
                              transform: Matrix4.translationValues(0, selected ? -10 : 0, 0),
                              child: Opacity(
                                opacity: !_myTurn ? 0.85 : (playable ? 1 : 0.4),
                                child: _EndHighlight(
                                  active: selected || (playable && _selected == null),
                                  accent: selected ? AppColors.gold : playground.accent,
                                  subtle: !selected,
                                  child: _DominoTile(a: tile[0], b: tile[1], horizontal: false, size: 40),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _OpponentRack extends StatelessWidget {
  const _OpponentRack({required this.session, required this.seat, required this.tiles, required this.active});
  final GameSessionView session;
  final int seat;
  final int tiles;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final palette = TableSkins.paletteFor(session, seat);
    final name = seat < session.seats.length ? session.seats[seat].displayName : 'Seat $seat';
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: active ? palette.base.withValues(alpha: 0.22) : Colors.black.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: active ? palette.light : Colors.white.withValues(alpha: 0.12), width: active ? 1.6 : 1),
        boxShadow: active ? [BoxShadow(color: palette.glow.withValues(alpha: 0.35), blurRadius: 12)] : null,
      ),
      child: Column(
        children: [
          SizedBox(
            height: 26,
            child: Stack(
              alignment: Alignment.centerLeft,
              children: [
                for (var i = 0; i < (tiles > 9 ? 9 : tiles); i++)
                  Positioned(
                    left: i * 9.0,
                    child: Container(
                      width: 14,
                      height: 26,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(3),
                        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [palette.light, palette.dark]),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 0.8),
                        boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 2, offset: Offset(0, 1))],
                      ),
                    ),
                  ),
                if (tiles == 0) const Text('✓', style: TextStyle(color: AppColors.gold, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
          Text('$tiles tile${tiles == 1 ? '' : 's'}', style: TextStyle(color: tiles <= 2 && tiles > 0 ? AppColors.gold : Colors.white70, fontSize: 10, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _Boneyard extends StatelessWidget {
  const _Boneyard({required this.count, required this.accent, required this.canDraw, required this.onTap});
  final int count;
  final Color accent;
  final bool canDraw;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: canDraw ? onTap : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 64,
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: canDraw ? accent : Colors.white.withValues(alpha: 0.12), width: canDraw ? 1.6 : 1),
          boxShadow: canDraw ? [BoxShadow(color: accent.withValues(alpha: 0.4), blurRadius: 12)] : null,
        ),
        child: Column(
          children: [
            SizedBox(
              height: 30,
              width: 40,
              child: Stack(
                children: [
                  for (var i = 0; i < (count > 4 ? 4 : count); i++)
                    Positioned(
                      left: i * 3.0,
                      top: (3 - i) * 2.0,
                      child: Container(
                        width: 26,
                        height: 16,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(3),
                          gradient: const LinearGradient(colors: [Color(0xFFFFFBF0), Color(0xFFD9D0B8)]),
                          border: Border.all(color: Colors.black26, width: 0.8),
                        ),
                      ),
                    ),
                  if (count == 0) Center(child: Icon(Icons.block_rounded, size: 18, color: Colors.white.withValues(alpha: 0.4))),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Text('$count', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
            Text(canDraw ? 'draw' : 'boneyard', style: TextStyle(color: canDraw ? accent : Colors.white54, fontSize: 9, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _EndBadge extends StatelessWidget {
  const _EndBadge({required this.label, required this.value, required this.accent});
  final String label;
  final int value;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 10, fontWeight: FontWeight.w600)),
        const SizedBox(width: 6),
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: accent.withValues(alpha: 0.2), border: Border.all(color: accent)),
          child: Text('$value', style: TextStyle(color: accent, fontWeight: FontWeight.w900, fontSize: 13)),
        ),
      ],
    );
  }
}

/// Glow wrapper for selectable/targetable tiles.
class _EndHighlight extends StatelessWidget {
  const _EndHighlight({required this.active, required this.accent, required this.child, this.subtle = false});
  final bool active;
  final Color accent;
  final Widget child;
  final bool subtle;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(9),
        boxShadow: active ? [BoxShadow(color: accent.withValues(alpha: subtle ? 0.35 : 0.75), blurRadius: subtle ? 8 : 16, spreadRadius: subtle ? 0 : 1)] : null,
      ),
      child: child,
    );
  }
}

/// A bone-coloured domino with bevelled edge, divider bar and pip layout.
class _DominoTile extends StatelessWidget {
  const _DominoTile({
    required this.a,
    required this.b,
    required this.horizontal,
    required this.size,
    this.openLeft = false,
    this.openRight = false,
  });
  final int a;
  final int b;
  final bool horizontal;
  final double size; // half-length (each square face is size×size)
  final bool openLeft;
  final bool openRight;

  @override
  Widget build(BuildContext context) {
    final faceA = _Face(pips: a, size: size);
    final faceB = _Face(pips: b, size: size);
    final divider = Container(
      width: horizontal ? 1.4 : size * 0.7,
      height: horizontal ? size * 0.7 : 1.4,
      decoration: BoxDecoration(color: const Color(0xFF9A8F78), borderRadius: BorderRadius.circular(1)),
    );
    return Container(
      width: horizontal ? size * 2 : size,
      height: horizontal ? size : size * 2,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(size * 0.18),
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFFDF6), Color(0xFFF1EBDC), Color(0xFFD8CFB6)]),
        border: Border.all(color: const Color(0xFF8C8268).withValues(alpha: 0.7), width: 0.8),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 5, offset: const Offset(0, 3)),
          const BoxShadow(color: Colors.white70, blurRadius: 1, offset: Offset(-0.5, -0.5)),
        ],
      ),
      child: horizontal
          ? Row(children: [faceA, divider, faceB])
          : Column(children: [faceA, divider, faceB]),
    );
  }
}

class _Face extends StatelessWidget {
  const _Face({required this.pips, required this.size});
  final int pips;
  final double size;

  // Pip positions on a 3×3 grid for 0–6.
  static const Map<int, List<int>> _layout = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  @override
  Widget build(BuildContext context) {
    final cells = _layout[pips.clamp(0, 6)] ?? const <int>[];
    final pip = size * 0.16;
    return SizedBox(
      width: size,
      height: size,
      child: Padding(
        padding: EdgeInsets.all(size * 0.14),
        child: LayoutBuilder(
          builder: (context, c) {
            final cell = c.maxWidth / 3;
            return Stack(
              children: [
                for (final i in cells)
                  Positioned(
                    left: (i % 3) * cell + cell / 2 - pip / 2,
                    top: (i ~/ 3) * cell + cell / 2 - pip / 2,
                    child: Container(
                      width: pip,
                      height: pip,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const RadialGradient(center: Alignment(-0.3, -0.3), colors: [Color(0xFF3B3F5C), Color(0xFF14162A)]),
                        boxShadow: const [BoxShadow(color: Colors.white70, blurRadius: 1, offset: Offset(0.5, 0.5))],
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

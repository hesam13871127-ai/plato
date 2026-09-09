import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// One tile placed on the chain (values oriented left→right by the server).
class _ChainLink {
  const _ChainLink(this.a, this.b, this.isDouble);
  final int a;
  final int b;
  final bool isDouble;
}

/// Dominoes — wave-1 3D board.
///
/// Glossy ivory tiles with pip inlays lie on a skin-tinted felt table. The
/// chain scrolls horizontally (doubles sit crosswise), the open ends are shown
/// as glass pills and — when a tile fits both ends with different values — an
/// inline picker lets the player choose the side before playing. Supports the
/// full 2–4 player table; each seat's remaining tiles are shown as chips.
class DominoesBoard extends StatefulWidget {
  const DominoesBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<DominoesBoard> createState() => _DominoesBoardState();
}

class _DominoesBoardState extends State<DominoesBoard> {
  String _skin = 'midnight';
  List<int>? _pendingTile; // tile awaiting a left/right end choice
  final ScrollController _chainScroll = ScrollController();
  int _lastChainLength = 0;

  // ── Parsed server view (redacted per seat) ───────────────────────────────

  List<_ChainLink> get _chain {
    final raw = (widget.session.board['chain'] as List?) ?? const [];
    return raw
        .whereType<Map>()
        .map((link) {
          final tile = link['tile'];
          final isDouble = link['double'] == true;
          if (tile is List && tile.length == 2 && tile[0] is num && tile[1] is num) {
            return _ChainLink((tile[0] as num).toInt(), (tile[1] as num).toInt(), isDouble);
          }
          return null;
        })
        .whereType<_ChainLink>()
        .toList();
  }

  /// Open end values `[left, right]`, or null while the chain is empty.
  List<int>? get _ends {
    final raw = widget.session.board['ends'];
    if (raw is List && raw.length == 2 && raw[0] is num && raw[1] is num) {
      return [(raw[0] as num).toInt(), (raw[1] as num).toInt()];
    }
    return null;
  }

  int get _boneyard => (widget.session.board['boneyard'] as num?)?.toInt() ?? 0;

  List<int> get _handSizes =>
      ((widget.session.board['handSizes'] as List?) ?? const [])
          .whereType<num>()
          .map((n) => n.toInt())
          .toList();

  List<List<int>> get _hand =>
      ((widget.session.board['hand'] as List?) ?? const [])
          .whereType<List>()
          .map((t) => t
              .whereType<num>()
              .map((n) => n.toInt())
              .toList())
          .where((t) => t.length == 2)
          .toList();

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  bool get _noPlayable => _hand.every((t) => !_fits(t));

  // ── Rules helpers (mirror the server engine) ────────────────────────────

  bool _fits(List<int> tile) {
    final ends = _ends;
    if (ends == null) return true; // opening lead — anything goes
    return tile[0] == ends[0] || tile[1] == ends[0] || tile[0] == ends[1] || tile[1] == ends[1];
  }

  bool _needsEndChoice(List<int> tile) {
    final ends = _ends;
    if (ends == null || ends[0] == ends[1]) return false;
    final fitsLeft = tile[0] == ends[0] || tile[1] == ends[0];
    final fitsRight = tile[0] == ends[1] || tile[1] == ends[1];
    return fitsLeft && fitsRight;
  }

  void _play(List<int> tile, {String? end}) {
    GameFeedback.move();
    widget.onAction('play_tile', {'tile': tile, if (end != null) 'end': end});
    setState(() => _pendingTile = null);
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  void didUpdateWidget(covariant DominoesBoard oldWidget) {
    super.didUpdateWidget(oldWidget);
    final length = _chain.length;
    if (length != _lastChainLength) {
      _lastChainLength = length;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_chainScroll.hasClients) {
          _chainScroll.jumpTo(_chainScroll.position.maxScrollExtent);
        }
      });
    }
    // Clear a pending end-choice that is no longer legal (state moved on).
    if (_pendingTile != null && !_fits(_pendingTile as List<int>)) {
      _pendingTile = null;
    }
  }

  @override
  void dispose() {
    _chainScroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final skin = BoardSkin.byId(_skin);
    final chain = _chain;
    final ends = _ends;

    return Column(
      children: [
        TurnIndicator(
          text: !widget.session.isInProgress
              ? 'Game over'
              : _myTurn
                  ? (_noPlayable
                      ? (_boneyard > 0 ? 'No tile fits — draw from the boneyard' : 'No tile fits — pass')
                      : 'Your turn — play a tile')
                  : 'Waiting for the table…',
          highlight: _myTurn,
          icon: Icons.view_module_rounded,
        ),
        const SizedBox(height: 8),
        _SkinRow(
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
              _StatusRow(
                boneyard: _boneyard,
                handSizes: _handSizes,
                currentSeat: widget.session.currentSeat,
                seatCount: widget.session.seats.length,
              ),
              const SizedBox(height: 10),
              Container(
                height: 104,
                decoration: BoxDecoration(
                  color: Color.lerp(skin.feltTop, Colors.black, 0.25),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: chain.isEmpty
                    ? Center(
                        child: Text(
                          _myTurn ? 'The table is empty — lead any tile!' : 'Waiting for the lead…',
                          style: const TextStyle(color: AppColors.textMuted, fontSize: 12.5),
                        ),
                      )
                    : ListView.separated(
                        controller: _chainScroll,
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        itemCount: chain.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 6),
                        itemBuilder: (context, i) => _DominoTile(
                          a: chain[i].a,
                          b: chain[i].b,
                          horizontal: !chain[i].isDouble,
                          glow: i == chain.length - 1,
                        ),
                      ),
              ),
              if (ends != null && ends.length == 2) ...[
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _EndPill(label: 'LEFT', value: ends[0]),
                    const SizedBox(width: 10),
                    _EndPill(label: 'RIGHT', value: ends[1]),
                  ],
                ),
              ],
            ],
          ),
        ),
        if (_pendingTile != null) ...[
          const SizedBox(height: 10),
          _EndPicker(
            tile: _pendingTile as List<int>,
            ends: _ends ?? const [0, 0],
            onPick: (end) => _play(_pendingTile as List<int>, end: end),
            onCancel: () => setState(() => _pendingTile = null),
          ),
        ],
        if (widget.session.isInProgress) ...[
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _myTurn && _noPlayable && _boneyard > 0
                      ? () {
                          GameFeedback.roll();
                          widget.onAction('draw', {});
                        }
                      : null,
                  icon: const Icon(Icons.download_rounded, size: 18),
                  label: Text('Draw ($_boneyard)'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.softCyan,
                    side: const BorderSide(color: AppColors.glassStroke),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _myTurn && _noPlayable && _boneyard == 0
                      ? () {
                          GameFeedback.tap();
                          widget.onAction('pass', {});
                        }
                      : null,
                  icon: const Icon(Icons.skip_next_rounded, size: 18),
                  label: const Text('Pass'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.warning,
                    side: const BorderSide(color: AppColors.glassStroke),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 6),
            child: Text(
              _hand.isEmpty ? 'Spectating' : 'Your hand — tap a tile to play',
              style: TextStyle(
                color: _myTurn ? AppColors.softCyan : AppColors.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        SizedBox(
          height: 112,
          child: _hand.isEmpty
              ? const Center(
                  child: Text('No tiles to show.', style: TextStyle(color: AppColors.textMuted)),
                )
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  itemCount: _hand.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final tile = _hand[i];
                    final playable = _fits(tile);
                    return GestureDetector(
                      onTap: _myTurn
                          ? () {
                              if (!playable) {
                                GameFeedback.error();
                                return;
                              }
                              if (_needsEndChoice(tile)) {
                                GameFeedback.tap();
                                setState(() => _pendingTile = tile);
                              } else {
                                _play(tile);
                              }
                            }
                          : null,
                      child: _DominoTile(
                        a: tile[0],
                        b: tile[1],
                        horizontal: false,
                        glow: _myTurn && playable,
                        dimmed: !playable,
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/// A glossy ivory domino. Horizontal tiles lie along the chain; doubles are
/// rendered upright (crosswise), exactly like on a real table.
class _DominoTile extends StatelessWidget {
  const _DominoTile({
    required this.a,
    required this.b,
    required this.horizontal,
    this.glow = false,
    this.dimmed = false,
  });

  final int a;
  final int b;
  final bool horizontal;
  final bool glow;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final width = horizontal ? 62.0 : 46.0;
    final height = horizontal ? 46.0 : 88.0;
    return Opacity(
      opacity: dimmed ? 0.45 : 1,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFFFFEF7), Color(0xFFEDEFF6), Color(0xFFD3D9E8)],
          ),
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 1.1),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.38),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
            if (glow)
              BoxShadow(color: AppColors.softCyan.withValues(alpha: 0.42), blurRadius: 13),
          ],
        ),
        child: horizontal
            ? Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _Pips(value: a),
                  Container(width: 1, height: 28, color: const Color(0xFF9AA7C7).withValues(alpha: 0.5)),
                  _Pips(value: b),
                ],
              )
            : Column(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _Pips(value: a),
                  Container(height: 1, width: 32, color: const Color(0xFF9AA7C7).withValues(alpha: 0.5)),
                  _Pips(value: b),
                ],
              ),
      ),
    );
  }
}

/// Classic domino pip layout on a tight 3×3 grid.
class _Pips extends StatelessWidget {
  const _Pips({required this.value});

  final int value;

  static const Map<int, List<List<int>>> _layout = {
    0: <List<int>>[],
    1: [
      [1, 1]
    ],
    2: [
      [0, 0],
      [2, 2]
    ],
    3: [
      [0, 0],
      [1, 1],
      [2, 2]
    ],
    4: [
      [0, 0],
      [0, 2],
      [2, 0],
      [2, 2]
    ],
    5: [
      [0, 0],
      [0, 2],
      [1, 1],
      [2, 0],
      [2, 2]
    ],
    6: [
      [0, 0],
      [0, 2],
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 2]
    ],
  };

  @override
  Widget build(BuildContext context) {
    final cell = value >= 4 ? 7.5 : 8.5;
    return SizedBox(
      width: 27,
      height: 27,
      child: Stack(
        children: [
          for (final p in _layout[value] ?? const <List<int>>[])
            Positioned(
              left: p[1] * cell + 1.5,
              top: p[0] * cell + 1.5,
              child: Container(
                width: 5.5,
                height: 5.5,
                decoration: BoxDecoration(
                  color: const Color(0xFF101A33),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 1.5),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Chrome ──────────────────────────────────────────────────────────────────

/// Felt skin quick-switcher above the table.
class _SkinRow extends StatelessWidget {
  const _SkinRow({required this.selected, required this.onPick});

  final String selected;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 26,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: BoardSkin.all.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (context, i) {
          final skin = BoardSkin.all[i];
          final isSel = skin.id == selected;
          return GestureDetector(
            onTap: () => onPick(skin.id),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                color: isSel ? skin.accent.withValues(alpha: 0.9) : AppColors.glassFill,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isSel ? Colors.white70 : AppColors.glassStroke,
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                skin.name,
                style: TextStyle(
                  color: isSel ? Colors.white : AppColors.textSecondary,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Boneyard count + one chip per seat showing their remaining tiles.
class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.boneyard,
    required this.handSizes,
    required this.currentSeat,
    required this.seatCount,
  });

  final int boneyard;
  final List<int> handSizes;
  final int currentSeat;
  final int seatCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(Icons.inventory_2_rounded, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Text(
                'Boneyard $boneyard',
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 10),
              Text(
                '$seatCount players',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
              ),
            ],
          ),
          Row(
            children: [
              for (var i = 0; i < seatCount; i++)
                Container(
                  margin: const EdgeInsets.only(left: 4),
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: i == currentSeat ? AppColors.electricPurple : AppColors.glassFill,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: i == currentSeat ? Colors.white : AppColors.glassStroke,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      i < handSizes.length ? '${handSizes[i]}' : '–',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Glass pill showing one open end of the chain.
class _EndPill extends StatelessWidget {
  const _EndPill({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.glassFill,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textMuted,
              fontSize: 9.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(width: 7),
          Text(
            '$value',
            style: const TextStyle(
              color: AppColors.softCyan,
              fontSize: 14,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

/// Inline chooser shown when the selected tile fits both ends.
class _EndPicker extends StatelessWidget {
  const _EndPicker({
    required this.tile,
    required this.ends,
    required this.onPick,
    required this.onCancel,
  });

  final List<int> tile;
  final List<int> ends;
  final ValueChanged<String> onPick;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [
          AppColors.electricPurple.withValues(alpha: 0.25),
          AppColors.softCyan.withValues(alpha: 0.12),
        ]),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.softCyan.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          _DominoTile(a: tile[0], b: tile[1], horizontal: false, glow: true),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Fits both ends — pick a side:',
                  style: TextStyle(color: AppColors.textPrimary, fontSize: 12.5, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.tonal(
                        onPressed: () => onPick('l'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.glassFill,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                        ),
                        child: Text('◀ ${ends[0]}', style: const TextStyle(fontSize: 12.5)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton.tonal(
                        onPressed: () => onPick('r'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.glassFill,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                        ),
                        child: Text('${ends[1]} ▶', style: const TextStyle(fontSize: 12.5)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      onPressed: onCancel,
                      icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

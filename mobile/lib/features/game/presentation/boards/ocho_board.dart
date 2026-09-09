import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/board_skins.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';
import '../utils/game_feedback.dart';
import '../widgets/table_widgets.dart';

/// Parsed ocho view (redacted server-side: own hand + hand sizes only).
class _OchoView {
  _OchoView(Map<String, dynamic> b)
      : topColor = (b['top'] as Map?)?['color'] as String? ?? 'wild',
        topValue = (b['top'] as Map?)?['value'] as String? ?? '',
        activeColor = b['activeColor'] as String? ?? 'wild',
        isWildTop = b['isWildTop'] == true,
        deck = (b['deck'] as num?)?.toInt() ?? 0,
        dir = (b['dir'] as num?)?.toInt() ?? 1,
        turnMode = (b['turnMode'] as String?) ?? 'play',
        drawnCardId = b['drawnCardId'] as String?,
        unoSeat = (b['unoSeat'] as num?)?.toInt(),
        handSizes = ((b['handSizes'] as List?) ?? const [])
            .whereType<num>()
            .map((n) => n.toInt())
            .toList(),
        hand = ((b['hand'] as List?) ?? const [])
            .whereType<Map>()
            .map((c) => _OchoCard(
                  c['id'] as String? ?? '',
                  c['color'] as String? ?? 'wild',
                  c['value'] as String? ?? '',
                ))
            .toList();

  final String topColor;
  final String topValue;
  final String activeColor;
  final bool isWildTop;
  final int deck;
  final int dir;
  final String turnMode;
  final String? drawnCardId;
  final int? unoSeat;
  final List<int> handSizes;
  final List<_OchoCard> hand;

  bool get iDrew => turnMode == 'drawn';
}

class _OchoCard {
  const _OchoCard(this.id, this.color, this.value);
  final String id;
  final String color;
  final String value;
}

const _kCardColors = <String, Color>{
  'red': Color(0xFFE5486B),
  'yellow': Color(0xFFF5B82E),
  'green': Color(0xFF23C98F),
  'blue': Color(0xFF3B82F6),
  'wild': Color(0xFF2A2F66),
};

Color _cardColor(String color) => _kCardColors[color] ?? _kCardColors['wild']!;

String _cardFace(String value) {
  switch (value) {
    case 'skip':
      return '⊘';
    case 'rev':
      return '⇄';
    case 'd2':
      return '+2';
    case 'd4':
      return '+4';
    case 'wild':
      return '✦';
    default:
      return value;
  }
}

/// Ocho — wave-1 3D board.
///
/// A glossy tilted top card floats over the discard pile, the deck stack
/// breathes beside it, and your hand is a fanned row of 3D cards — legal plays
/// glow, illegal ones sink into shadow. Wilds open a colour-picker with four
/// lit orbs; after drawing you may drop exactly that card or pass. Fully
/// generic for 2–4 players with a live direction indicator.
class OchoBoard extends StatefulWidget {
  const OchoBoard({
    super.key,
    required this.session,
    required this.mySeat,
    required this.onAction,
  });

  final GameSessionView session;
  final int mySeat;
  final Future<void> Function(String type, Map<String, dynamic> payload) onAction;

  @override
  State<OchoBoard> createState() => _OchoBoardState();
}

class _OchoBoardState extends State<OchoBoard> with SingleTickerProviderStateMixin {
  String _skin = 'midnight';
  late final AnimationController _breathe = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1300),
  )..repeat(reverse: true);

  _OchoView get _view => _OchoView(widget.session.board);

  bool get _myTurn =>
      widget.session.isInProgress && widget.session.currentSeat == widget.mySeat;

  bool _playable(_OchoCard card) {
    final view = _view;
    if (card.color == 'wild') return true;
    return card.color == view.activeColor || card.value == view.topValue;
  }

  @override
  void dispose() {
    _breathe.dispose();
    super.dispose();
  }

  void _tryPlay(_OchoCard card) {
    if (!_myTurn) return;
    final view = _view;
    if (view.iDrew && card.id != view.drawnCardId) {
      GameFeedback.error();
      return;
    }
    if (!_playable(card)) {
      GameFeedback.error();
      return;
    }
    if (card.color == 'wild') {
      GameFeedback.tap();
      _pickColor(card);
      return;
    }
    GameFeedback.move();
    widget.onAction('play', {'cardId': card.id});
  }

  Future<void> _pickColor(_OchoCard card) async {
    final color = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => _ColorPickerSheet(cardFace: _cardFace(card.value)),
    );
    if (color != null && mounted) {
      GameFeedback.move();
      widget.onAction('play', {'cardId': card.id, 'color': color});
    }
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
          icon: Icons.style_rounded,
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
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _PileChip(
                    icon: Icons.layers_rounded,
                    label: 'Deck ${view.deck}',
                    tint: AppColors.softCyan,
                  ),
                  const SizedBox(width: 10),
                  _PileChip(
                    icon: view.dir == 1
                        ? Icons.rotate_right_rounded
                        : Icons.rotate_left_rounded,
                    label: view.dir == 1 ? 'Clockwise' : 'Reverse',
                    tint: AppColors.electricPurple,
                  ),
                  const SizedBox(width: 10),
                  _PileChip(
                    icon: Icons.campaign_rounded,
                    label: view.unoSeat == null
                        ? 'No Ocho yet'
                        : 'OCHO! Seat ${view.unoSeat! + 1}',
                    tint: AppColors.neonPink,
                    alert: view.unoSeat != null,
                  ),
                ],
              ),
              const SizedBox(height: 18),
              SizedBox(
                height: 150,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // The deck stack (three stacked card backs).
                    if (view.deck > 0) ...[
                      Transform.translate(
                        offset: const Offset(46, 8),
                        child: Card3D(width: 62, height: 90, faceUp: false),
                      ),
                      Transform.translate(
                        offset: const Offset(52, 4),
                        child: Card3D(width: 62, height: 90, faceUp: false),
                      ),
                    ],
                    // The discard pile + the live top card.
                    Transform.translate(
                      offset: const Offset(-40, 3),
                      child: Opacity(
                        opacity: 0.4,
                        child: Card3D(
                          width: 62,
                          height: 90,
                          color: Color.lerp(_cardColor(view.topColor), Colors.black, 0.5)!,
                          child: const SizedBox.shrink(),
                        ),
                      ),
                    ),
                    AnimatedScale(
                      scale: 1.08,
                      duration: const Duration(milliseconds: 220),
                      child: _TopCard(view: view, breathe: _breathe.value),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (widget.session.isInProgress) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _myTurn && !view.iDrew && view.deck > 0
                      ? () {
                          GameFeedback.roll();
                          widget.onAction('draw', {});
                        }
                      : null,
                  icon: const Icon(Icons.download_rounded, size: 18),
                  label: const Text('Draw a card'),
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
                  onPressed: _myTurn && view.iDrew
                      ? () {
                          GameFeedback.tap();
                          widget.onAction('pass', {});
                        }
                      : null,
                  icon: const Icon(Icons.skip_next_rounded, size: 18),
                  label: const Text('Keep it & pass'),
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
              view.hand.isEmpty
                  ? 'Spectating'
                  : view.iDrew
                      ? 'Play the drawn card — or keep it and pass'
                      : 'Your hand — tap a card to play',
              style: TextStyle(
                color: _myTurn ? AppColors.softCyan : AppColors.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        SizedBox(
          height: 116,
          child: view.hand.isEmpty
              ? const Center(
                  child: Text('No cards to show.', style: TextStyle(color: AppColors.textMuted)),
                )
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  itemCount: view.hand.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (context, i) {
                    final card = view.hand[i];
                    final playable = _myTurn && _playable(card);
                    final isDrawn = view.iDrew && card.id == view.drawnCardId;
                    final dimmed = _myTurn && !playable;
                    return Opacity(
                      opacity: dimmed ? 0.45 : 1,
                      child: Card3D(
                        width: 62,
                        height: 92,
                        color: _cardColor(card.color),
                        glowColor: isDrawn ? AppColors.neonPink : AppColors.softCyan,
                        onTap: () => _tryPlay(card),
                        child: _CardFace(card: card, big: playable),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  String _statusText(_OchoView view) {
    if (!widget.session.isInProgress) return 'Game over';
    if (!_myTurn) return 'Waiting for the table…';
    if (view.iDrew) return 'You drew — play it or pass';
    return 'Your turn — match the colour or the value';
  }
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/// The big live top card with a wild-colour aura when active.
class _TopCard extends StatelessWidget {
  const _TopCard({required this.view, required this.breathe});

  final _OchoView view;
  final double breathe;

  @override
  Widget build(BuildContext context) {
    final color = _cardColor(view.topColor);
    final aura = view.isWildTop ? _cardColor(view.activeColor) : color;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: aura.withValues(alpha: 0.35 + 0.2 * breathe),
            blurRadius: 26,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Card3D(
        width: 84,
        height: 118,
        color: color,
        glowColor: aura,
        child: _CardFace(
          card: _OchoCard('', view.topColor, view.topValue),
          big: true,
          showWildRing: view.isWildTop,
          activeColor: view.activeColor,
        ),
      ),
    );
  }
}

/// Card face: big centre glyph + two corner mini-glyphs, wild ring optional.
class _CardFace extends StatelessWidget {
  const _CardFace({required this.card, required this.big, this.showWildRing = false, this.activeColor});

  final _OchoCard card;
  final bool big;
  final bool showWildRing;
  final String? activeColor;

  @override
  Widget build(BuildContext context) {
    final color = _cardColor(card.color);
    final face = _cardFace(card.value);
    final isWild = card.color == 'wild';
    return Stack(
      children: [
        if (isWild)
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(11),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFFE5486B),
                    Color(0xFFF5B82E),
                    Color(0xFF23C98F),
                    Color(0xFF3B82F6),
                  ],
                ),
              ),
            ),
          ),
        if (isWild)
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: const Color(0xFF161B3C),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ),
        if (showWildRing && activeColor != null)
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.all(6),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: _cardColor(activeColor!), width: 3),
                ),
              ),
            ),
          ),
        Center(
          child: Text(
            face,
            style: TextStyle(
              color: isWild ? Colors.white : Colors.white,
              fontSize: big ? 40 : 24,
              fontWeight: FontWeight.w900,
              shadows: const [Shadow(color: Colors.black45, blurRadius: 6)],
            ),
          ),
        ),
        Positioned(
          left: 5,
          top: 4,
          child: Text(
            face,
            style: TextStyle(
              color: color.withValues(alpha: 0.9),
              fontSize: big ? 13 : 10,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        Positioned(
          right: 5,
          bottom: 4,
          child: Text(
            face,
            style: TextStyle(
              color: color.withValues(alpha: 0.9),
              fontSize: big ? 13 : 10,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

/// Small glass status chip above the pile.
class _PileChip extends StatelessWidget {
  const _PileChip({
    required this.icon,
    required this.label,
    required this.tint,
    this.alert = false,
  });

  final IconData icon;
  final String label;
  final Color tint;
  final bool alert;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: alert ? tint.withValues(alpha: 0.18) : AppColors.glassFill,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: alert ? tint : AppColors.glassStroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: tint),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: alert ? tint : AppColors.textSecondary,
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

/// Wild colour picker: four lit orbs on glass.
class _ColorPickerSheet extends StatelessWidget {
  const _ColorPickerSheet({required this.cardFace});

  final String cardFace;

  static const _picks = <String, Color>{
    'red': Color(0xFFE5486B),
    'yellow': Color(0xFFF5B82E),
    'green': Color(0xFF23C98F),
    'blue': Color(0xFF3B82F6),
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(14),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 26),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Wild $cardFace — choose a colour',
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 18),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              for (final entry in _picks.entries)
                GestureDetector(
                  onTap: () => Navigator.of(context).pop(entry.key),
                  child: Container(
                    width: 58,
                    height: 58,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        center: const Alignment(-0.3, -0.4),
                        colors: [
                          Color.lerp(entry.value, Colors.white, 0.45)!,
                          entry.value,
                          Color.lerp(entry.value, Colors.black, 0.45)!,
                        ],
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: entry.value.withValues(alpha: 0.5),
                          blurRadius: 16,
                        ),
                      ],
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

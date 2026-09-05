import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../data/datasources/game_socket_service.dart';
import '../../domain/entities/game_entities.dart';
import '../providers/game_providers.dart';
import '../utils/game_feedback.dart';

/// Animated opponent/seat strip across the top of a table: avatars, names,
/// scores and a glowing turn/active indicator.
class SeatStrip extends StatelessWidget {
  const SeatStrip({super.key, required this.session, required this.mySeat, this.activeSeats});

  final GameSessionView session;
  final int mySeat;

  /// Seats currently "active" (their turn/phase). Falls back to currentSeat.
  final Set<int>? activeSeats;

  @override
  Widget build(BuildContext context) {
    final seats = <Widget>[];
    for (var i = 0; i < session.seats.length; i++) {
      final seat = session.seats[i];
      final isMe = i == mySeat;
      final active = (activeSeats ?? <int>{session.currentSeat}).contains(i) && session.isInProgress;
      seats.add(
        Expanded(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            margin: const EdgeInsets.symmetric(horizontal: 5),
            padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
            decoration: BoxDecoration(
              color: active ? AppColors.electricPurple.withOpacity(0.30) : AppColors.glassFill,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: active ? AppColors.softCyan : AppColors.glassStroke,
                width: active ? 1.8 : 1,
              ),
              boxShadow: active
                  ? [BoxShadow(color: AppColors.softCyan.withOpacity(0.25), blurRadius: 12)]
                  : null,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _AvatarDot(name: seat.displayName, connected: seat.connected),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        isMe ? 'You' : seat.displayName,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: AppColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 12),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '${session.scores.length > i ? session.scores[i] : 0} pts',
                  style: const TextStyle(color: AppColors.softCyan, fontSize: 11, fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return Padding(padding: const EdgeInsets.fromLTRB(10, 8, 10, 2), child: Row(children: seats));
  }
}

class _AvatarDot extends StatelessWidget {
  const _AvatarDot({required this.name, required this.connected});
  final String name;
  final bool connected;

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isNotEmpty ? name.trim().substring(0, 1).toUpperCase() : '?';
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(colors: [AppColors.electricPurple, AppColors.softCyan]),
        boxShadow: connected
            ? null
            : [BoxShadow(color: AppColors.textMuted.withOpacity(0.5), blurRadius: 4)],
      ),
      alignment: Alignment.center,
      child: Text(initial,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
    );
  }
}

/// Glass container for the playing surface with a felt-like gradient.
class TableSurface extends StatelessWidget {
  const TableSurface({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(10),
      padding: padding ?? const EdgeInsets.all(10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF0F1B33), Color(0xFF0B1426)],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.glassStroke),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.35), blurRadius: 18, offset: const Offset(0, 8))],
      ),
      child: child,
    );
  }
}

/// A pill status line showing whose turn it is / a custom message.
class TurnIndicator extends StatelessWidget {
  const TurnIndicator({super.key, required this.text, required this.highlight, this.icon});

  final String text;
  final bool highlight;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon ?? (highlight ? Icons.touch_app : Icons.hourglass_top),
            size: 15, color: highlight ? AppColors.softCyan : AppColors.textMuted),
        const SizedBox(width: 6),
        Text(
          text,
          style: TextStyle(
            color: highlight ? AppColors.softCyan : AppColors.textMuted,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  );
}

/// Brand-styled primary action button used by boards.
class ActionButton extends StatelessWidget {
  const ActionButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.color = AppColors.electricPurple,
    this.expanded = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Color color;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final btn = FilledButton.icon(
      onPressed: onPressed == null
          ? null
          : () {
              GameFeedback.move();
              onPressed!();
            },
      icon: Icon(icon ?? Icons.play_arrow, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: color,
        disabledBackgroundColor: AppColors.surfaceElevated,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 18),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
    return expanded ? Expanded(child: btn) : btn;
  }
}

/// End-of-game banner with win/draw title and a lobby button.
class FinishBanner extends StatelessWidget {
  const FinishBanner({super.key, required this.session, required this.mySeat});

  final GameSessionView session;
  final int mySeat;

  @override
  Widget build(BuildContext context) {
    final winnerSeats = _winnerSeats(session);
    final iWon = winnerSeats.contains(mySeat);
    final isDraw = winnerSeats.isEmpty;
    final title = isDraw
        ? "It's a draw!"
        : iWon
            ? 'You won! 🎉'
            : winnerSeats.length > 1
                ? 'The winners prevail!'
                : '${session.seats[winnerSeats.first].displayName} won';
    if (iWon) GameFeedback.win();
    return GlassCard(
      margin: const EdgeInsets.all(12),
      gradient: LinearGradient(
        colors: iWon
            ? [AppColors.softCyan.withOpacity(0.28), AppColors.electricPurple.withOpacity(0.22)]
            : [AppColors.surfaceElevated, AppColors.surfaceDark],
      ),
      child: Column(
        children: [
          Text(title,
              style: TextStyle(
                  color: iWon ? AppColors.softCyan : AppColors.textPrimary,
                  fontSize: 22,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          const Text('Rating, XP and coins have been added to your profile.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.of(context).maybePop(),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.electricPurple,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: const Text('Back to lobby'),
            ),
          ),
        ],
      ),
    );
  }

  /// Winner seats are not in the wire frame; we infer them from the top score
  /// unless the engine signalled a single explicit winner seat.
  List<int> _winnerSeats(GameSessionView s) {
    if (s.winnerSeat != null && s.winnerSeat! >= 0 && s.winnerSeat! < s.seats.length) {
      return [s.winnerSeat!];
    }
    return [];
  }
}

/// ── In-game chat ──────────────────────────────────────────────────────────

class _ChatLine {
  const _ChatLine({required this.seat, required this.sender, required this.text, required this.me});
  final int seat;
  final String sender;
  final String text;
  final bool me;
}

/// A slide-up in-table chat panel reusing the game Socket.IO channel.
class GameChatPanel extends ConsumerStatefulWidget {
  const GameChatPanel({super.key, required this.sessionId, required this.mySeat});

  final String sessionId;
  final int mySeat;

  @override
  ConsumerState<GameChatPanel> createState() => _GameChatPanelState();
}

class _GameChatPanelState extends ConsumerState<GameChatPanel> {
  final List<_ChatLine> _lines = [];
  final TextEditingController _controller = TextEditingController();
  StreamSubscription<dynamic>? _sub;
  bool _open = false;

  @override
  void initState() {
    super.initState();
    final socket = ref.read(gameSocketServiceProvider);
    _sub = socket.gameChat.listen((d) {
      final seat = (d['seat'] as num?)?.toInt() ?? -1;
      final sender = d['sender']?.toString() ?? 'Player';
      final text = d['text']?.toString() ?? '';
      setState(() {
        _lines.add(_ChatLine(seat: seat, sender: sender, text: text, me: seat == widget.mySeat));
        if (_lines.length > 60) _lines.removeAt(0);
      });
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _controller.clear();
    GameFeedback.tap();
    final socket = ref.read(gameSocketServiceProvider);
    await socket.sendGameChat(sessionId: widget.sessionId, text: text);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: () => setState(() => _open = !_open),
            icon: Icon(_open ? Icons.close : Icons.chat_bubble_outline,
                size: 18, color: AppColors.softCyan),
            label: Text(_open ? 'Close chat' : 'Table chat',
                style: const TextStyle(color: AppColors.softCyan, fontSize: 13)),
          ),
        ),
        AnimatedCrossFade(
          firstChild: const SizedBox(width: double.infinity),
          secondChild: GlassCard(
            margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: SizedBox(
              height: 180,
              child: Column(
                children: [
                  Expanded(
                    child: _lines.isEmpty
                        ? const Center(
                            child: Text('Say hi to your table 👋',
                                style: TextStyle(color: AppColors.textMuted, fontSize: 13)))
                        : ListView.builder(
                            reverse: true,
                            itemCount: _lines.length,
                            itemBuilder: (context, i) {
                              final line = _lines[_lines.length - 1 - i];
                              return Padding(
                                padding: const EdgeInsets.symmetric(vertical: 2),
                                child: Align(
                                  alignment:
                                      line.me ? Alignment.centerRight : Alignment.centerLeft,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: line.me
                                          ? AppColors.electricPurple.withOpacity(0.35)
                                          : AppColors.glassFill,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Text.rich(
                                      TextSpan(children: [
                                        TextSpan(
                                          text: '${line.me ? 'You' : line.sender}: ',
                                          style: const TextStyle(
                                              color: AppColors.softCyan,
                                              fontSize: 12,
                                              fontWeight: FontWeight.w700),
                                        ),
                                        TextSpan(
                                          text: line.text,
                                          style: const TextStyle(
                                              color: AppColors.textPrimary, fontSize: 13),
                                        ),
                                      ]),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                          onSubmitted: (_) => _send(),
                          decoration: InputDecoration(
                            hintText: 'Message…',
                            hintStyle: const TextStyle(color: AppColors.textMuted),
                            isDense: true,
                            filled: true,
                            fillColor: AppColors.glassFill,
                            contentPadding:
                                const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        onPressed: _send,
                        icon: const Icon(Icons.send_rounded, color: AppColors.softCyan),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          crossFadeState: _open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 200),
        ),
      ],
    );
  }
}

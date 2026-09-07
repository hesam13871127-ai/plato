import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Reusable, dependency-free "3D" game pieces. Each widget fakes depth with a
/// radial highlight, a darker bottom rim and a soft contact shadow so boards
/// look glossy and physical without native 3D engines. Brand-lit in the
/// VibeTable palette; customisable per game via [PiecePalette].

class PiecePalette {
  const PiecePalette(this.light, this.base, this.dark, this.glow);
  final Color light;
  final Color base;
  final Color dark;
  final Color glow;

  static const purple = PiecePalette(Color(0xFFB7A6FF), AppColors.electricPurple, Color(0xFF3D2E99), AppColors.softCyan);
  static const cyan = PiecePalette(Color(0xFF9FF4FF), Color(0xFF18B8D6), Color(0xFF0B5E78), AppColors.softCyan);
  static const red = PiecePalette(Color(0xFFFFB0C0), Color(0xFFE5486B), Color(0xFF8A1F39), Color(0xFFFF8FA6));
  static const yellow = PiecePalette(Color(0xFFFFE89F), Color(0xFFF5B82E), Color(0xFF9A6B12), Color(0xFFFFD46B));
  static const green = PiecePalette(Color(0xFFA8F5D8), Color(0xFF23C98F), Color(0xFF106B52), Color(0xFF5CFFC0));
  static const white = PiecePalette(Color(0xFFFFFFFF), Color(0xFFDDE6F8), Color(0xFF93A1C4), Color(0xFFFFFFFF));
  static const black = PiecePalette(Color(0xFF6B7691), Color(0xFF222B45), Color(0xFF0B0F1E), Color(0xFF5C6A8F));
}

/// A glossy round game token / chip / coin with depth.
class Piece3D extends StatelessWidget {
  const Piece3D({
    super.key,
    required this.palette,
    this.size = 44,
    this.label,
    this.emoji,
    this.ring = false,
  });

  final PiecePalette palette;
  final double size;
  final String? label;
  final String? emoji;
  final bool ring;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 8, offset: const Offset(0, 4)),
          BoxShadow(color: palette.glow.withValues(alpha: 0.35), blurRadius: 12, spreadRadius: -2),
        ],
      ),
      child: CustomPaint(
        painter: _SpherePainter(palette),
        child: Center(
          child: emoji != null
              ? Text(emoji!, style: TextStyle(fontSize: size * 0.52))
              : label != null
                  ? Text(
                      label!,
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: size * 0.34,
                        shadows: const [Shadow(color: Colors.black54, blurRadius: 4)],
                      ),
                    )
                  : null,
        ),
      ),
    );
  }
}

class _SpherePainter extends CustomPainter {
  _SpherePainter(this.p);
  final PiecePalette p;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2;

    // Body sphere with vertical lighting.
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.35, -0.45),
        radius: 1.05,
        colors: [p.light, p.base, p.dark],
        stops: const [0.0, 0.55, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);

    // Glossy top-left specular.
    final spec = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: 0.85), Colors.white.withValues(alpha: 0.0)],
      ).createShader(Rect.fromCircle(center: c + Offset(-r * 0.32, -r * 0.36), radius: r * 0.55));
    canvas.drawCircle(c + Offset(-r * 0.3, -r * 0.34), r * 0.42, spec);

    // Bottom rim light.
    final rim = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.04
      ..color = p.dark.withValues(alpha: 0.6);
    canvas.drawCircle(c, r * 0.97, rim);
  }

  @override
  bool shouldRepaint(covariant _SpherePainter old) => old.p != p;
}

/// A tilted, glossy playing card (used for Ocho/memory/charades boards).
class Card3D extends StatelessWidget {
  const Card3D({
    super.key,
    this.width = 58,
    this.height = 84,
    this.color = AppColors.electricPurple,
    this.glowColor = AppColors.softCyan,
    this.child,
    this.faceUp = true,
    this.onTap,
  });

  final double width;
  final double height;
  final Color color;
  final Color glowColor;
  final Widget? child;
  final bool faceUp;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Transform(
      alignment: Alignment.center,
      transform: Matrix4.identity()
        ..setEntry(3, 2, 0.0015)
        ..rotateX(-0.12),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: faceUp
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color.lerp(color, Colors.white, 0.25)!,
                      color,
                      Color.lerp(color, Colors.black, 0.25)!,
                    ],
                  )
                : const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF2A2F66), Color(0xFF121A3A)],
                  ),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 10, offset: const Offset(0, 5)),
              BoxShadow(color: glowColor.withValues(alpha: 0.35), blurRadius: 14, spreadRadius: -3),
            ],
            border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
          ),
          child: faceUp
              ? Center(child: child)
              : const Center(
                  child: Text('✦', style: TextStyle(color: AppColors.softCyan, fontSize: 26)),
                ),
        ),
      ),
    );
  }
}

/// A glossy 3D die face showing [value] pips.
class Dice3D extends StatelessWidget {
  const Dice3D({super.key, this.size = 52, this.value = 6, this.rolling = false});

  final double size;
  final int value;
  final bool rolling;

  @override
  Widget build(BuildContext context) {
    return Transform(
      alignment: Alignment.center,
      transform: Matrix4.identity()
        ..setEntry(3, 2, 0.002)
        ..rotateX(rolling ? -0.5 : -0.18)
        ..rotateZ(rolling ? 0.2 : 0.0),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(size * 0.22),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Colors.white, Color(0xFFD5DEF5), Color(0xFFA9B6D8)],
          ),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 10, offset: const Offset(0, 5)),
            BoxShadow(color: AppColors.softCyan.withValues(alpha: 0.3), blurRadius: 14),
          ],
          border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
        ),
        child: CustomPaint(painter: _DiceFacePainter(value, size)),
      ),
    );
  }
}

class _DiceFacePainter extends CustomPainter {
  _DiceFacePainter(this.value, this.size);
  final int value;
  final double size;

  @override
  void paint(Canvas canvas, Size s) {
    final pip = Paint()..color = const Color(0xFF1B2350);
    final r = size * 0.085;
    final o = size * 0.28;
    final m = size / 2;
    final spots = switch (value) {
      1 => [Offset(m, m)],
      2 => [Offset(m - o, m - o), Offset(m + o, m + o)],
      3 => [Offset(m - o, m - o), Offset(m, m), Offset(m + o, m + o)],
      4 => [Offset(m - o, m - o), Offset(m + o, m - o), Offset(m - o, m + o), Offset(m + o, m + o)],
      5 => [Offset(m - o, m - o), Offset(m + o, m - o), Offset(m, m), Offset(m - o, m + o), Offset(m + o, m + o)],
      _ => [
          Offset(m - o, m - o), Offset(m + o, m - o),
          Offset(m - o, m), Offset(m + o, m),
          Offset(m - o, m + o), Offset(m + o, m + o),
        ],
    };
    for (final spot in spots) {
      canvas.drawCircle(spot, r, pip);
    }
  }

  @override
  bool shouldRepaint(covariant _DiceFacePainter old) => old.value != value;
}

/// A small animated glow ring used to mark selectable / active pieces.
class GlowPulse extends StatefulWidget {
  const GlowPulse({super.key, required this.child, this.color = AppColors.softCyan});
  final Widget child;
  final Color color;

  @override
  State<GlowPulse> createState() => _GlowPulseState();
}

class _GlowPulseState extends State<GlowPulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1200),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) {
        final t = _c.value;
        return Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: widget.color.withValues(alpha: 0.25 + 0.35 * t),
                blurRadius: 10 + 14 * t,
                spreadRadius: 1 + 3 * t,
              ),
            ],
          ),
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

/// Convenience: a soft angled table "edge" decoration used behind board surfaces.
class TableEdge extends StatelessWidget {
  const TableEdge({super.key, required this.child, this.tint = const Color(0xFF0E2A33)});
  final Widget child;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    return Transform(
      alignment: Alignment.center,
      transform: Matrix4.identity()
        ..setEntry(3, 2, 0.0008)
        ..rotateX(0.06),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(26),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Color.lerp(tint, Colors.white, 0.06)!,
              tint,
              Color.lerp(tint, Colors.black, 0.35)!,
            ],
          ),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 30, offset: const Offset(0, 16)),
            BoxShadow(color: AppColors.electricPurple.withValues(alpha: 0.12), blurRadius: 40, spreadRadius: -8),
          ],
          border: Border.all(color: AppColors.glassStroke),
        ),
        child: child,
      ),
    );
  }
}

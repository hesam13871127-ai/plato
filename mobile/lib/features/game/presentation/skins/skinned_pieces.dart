import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/widgets/piece_3d.dart';
import 'table_skins.dart';

/// A round game piece rendered in the material of its [PieceSkin]: glossy
/// (default), neon rim-lit, candy, matte wood/marble, brushed metal, glass or
/// galaxy. Every board uses this for checkers men, Ludo tokens, Reversi discs,
/// 4-in-a-row discs and backgammon checkers so a purchased set restyles them
/// all at once.
class SkinnedPiece extends StatelessWidget {
  const SkinnedPiece({
    super.key,
    required this.skin,
    required this.seat,
    this.size = 40,
    this.crown = false,
    this.label,
    this.highlight = false,
    this.dim = false,
  });

  final PieceSkin skin;
  final int seat;
  final double size;

  /// Draws a king/crown marker (checkers kings, Ludo finished tokens).
  final bool crown;
  final String? label;

  /// Selectable / just-moved emphasis ring.
  final bool highlight;

  /// Faded (e.g. captured preview).
  final bool dim;

  @override
  Widget build(BuildContext context) {
    final palette = skin.palette(seat);
    final piece = SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _SkinnedPiecePainter(palette: palette, style: skin.style, highlight: highlight),
        child: Center(
          child: crown
              ? Icon(Icons.workspace_premium_rounded, size: size * 0.5, color: _crownColor(palette))
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
    return Opacity(opacity: dim ? 0.45 : 1, child: piece);
  }

  Color _crownColor(PiecePalette p) {
    switch (skin.style) {
      case PieceStyle.matte:
        return Color.lerp(p.light, Colors.white, 0.5)!;
      case PieceStyle.metal:
        return const Color(0xFFFFF6D6);
      case PieceStyle.gloss:
      case PieceStyle.neon:
      case PieceStyle.candy:
      case PieceStyle.glass:
      case PieceStyle.galaxy:
      case PieceStyle.lava:
        return Colors.white;
    }
  }
}

class _SkinnedPiecePainter extends CustomPainter {
  _SkinnedPiecePainter({required this.palette, required this.style, required this.highlight});

  final PiecePalette palette;
  final PieceStyle style;
  final bool highlight;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width / 2, size.height / 2);
    final r = size.width / 2 * 0.92;

    // Contact shadow + skin glow.
    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: 0.45)
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * 0.25);
    canvas.drawCircle(c + Offset(0, r * 0.18), r * 0.95, shadow);
    if (highlight || style == PieceStyle.neon || style == PieceStyle.galaxy || style == PieceStyle.lava) {
      final glow = Paint()
        ..color = palette.glow.withValues(alpha: highlight ? 0.85 : 0.45)
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * (highlight ? 0.55 : 0.35));
      canvas.drawCircle(c, r * 1.02, glow);
    }

    switch (style) {
      case PieceStyle.gloss:
      case PieceStyle.candy:
        _paintGloss(canvas, c, r, candy: style == PieceStyle.candy);
        break;
      case PieceStyle.neon:
        _paintNeon(canvas, c, r);
        break;
      case PieceStyle.matte:
        _paintMatte(canvas, c, r);
        break;
      case PieceStyle.metal:
        _paintMetal(canvas, c, r);
        break;
      case PieceStyle.glass:
        _paintGlass(canvas, c, r);
        break;
      case PieceStyle.galaxy:
        _paintGalaxy(canvas, c, r);
        break;
      case PieceStyle.lava:
        _paintLava(canvas, c, r);
        break;
    }

    if (highlight) {
      final ring = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(1.5, r * 0.09)
        ..color = Colors.white.withValues(alpha: 0.9);
      canvas.drawCircle(c, r * 1.02, ring);
    }
  }

  void _paintGloss(Canvas canvas, Offset c, double r, {required bool candy}) {
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.35, -0.45),
        radius: 1.05,
        colors: [palette.light, palette.base, palette.dark],
        stops: candy ? const [0.0, 0.62, 1.0] : const [0.0, 0.55, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);
    // Inner bevel ring gives a chip-like edge.
    final bevel = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.12
      ..shader = SweepGradient(
        colors: [
          Colors.white.withValues(alpha: 0.35),
          Colors.transparent,
          palette.dark.withValues(alpha: 0.6),
          Colors.transparent,
          Colors.white.withValues(alpha: 0.35),
        ],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r * 0.8, bevel);
    // Specular.
    final spec = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: candy ? 0.95 : 0.85), Colors.white.withValues(alpha: 0)],
      ).createShader(Rect.fromCircle(center: c + Offset(-r * 0.32, -r * 0.36), radius: r * 0.55));
    canvas.drawCircle(c + Offset(-r * 0.3, -r * 0.34), r * 0.42, spec);
    final rim = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.06
      ..color = palette.dark.withValues(alpha: 0.65);
    canvas.drawCircle(c, r * 0.97, rim);
  }

  void _paintNeon(Canvas canvas, Offset c, double r) {
    final body = Paint()
      ..shader = RadialGradient(
        colors: [palette.dark.withValues(alpha: 0.9), const Color(0xFF05070F)],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.16
      ..color = palette.base;
    canvas.drawCircle(c, r * 0.8, ring);
    final ringGlow = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.16
      ..color = palette.glow.withValues(alpha: 0.7)
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * 0.18);
    canvas.drawCircle(c, r * 0.8, ringGlow);
    final core = Paint()..color = palette.light.withValues(alpha: 0.9);
    canvas.drawCircle(c, r * 0.22, core);
  }

  void _paintMatte(Canvas canvas, Offset c, double r) {
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.3, -0.4),
        radius: 1.1,
        colors: [palette.light, palette.base, palette.dark],
        stops: const [0.0, 0.5, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);
    // Turned-wood / carved rings.
    final groove = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1, r * 0.05)
      ..color = palette.dark.withValues(alpha: 0.55);
    canvas.drawCircle(c, r * 0.72, groove);
    canvas.drawCircle(c, r * 0.5, groove..color = palette.dark.withValues(alpha: 0.35));
    final soft = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: 0.35), Colors.white.withValues(alpha: 0)],
      ).createShader(Rect.fromCircle(center: c + Offset(-r * 0.3, -r * 0.3), radius: r * 0.7));
    canvas.drawCircle(c, r, soft);
  }

  void _paintMetal(Canvas canvas, Offset c, double r) {
    final body = Paint()
      ..shader = SweepGradient(
        colors: [palette.light, palette.base, palette.dark, palette.base, palette.light, palette.dark, palette.light],
        stops: const [0.0, 0.18, 0.35, 0.5, 0.68, 0.85, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);
    final inner = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.3, -0.4),
        colors: [palette.light, palette.base, palette.dark],
        stops: const [0.0, 0.6, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r * 0.7));
    canvas.drawCircle(c, r * 0.7, inner);
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.05
      ..color = palette.dark.withValues(alpha: 0.7);
    canvas.drawCircle(c, r * 0.7, ring);
    final spec = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: 0.9), Colors.white.withValues(alpha: 0)],
      ).createShader(Rect.fromCircle(center: c + Offset(-r * 0.35, -r * 0.4), radius: r * 0.45));
    canvas.drawCircle(c + Offset(-r * 0.32, -r * 0.36), r * 0.35, spec);
  }

  void _paintGlass(Canvas canvas, Offset c, double r) {
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(0.2, 0.3),
        radius: 1.0,
        colors: [palette.base.withValues(alpha: 0.55), palette.dark.withValues(alpha: 0.85)],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);
    final facets = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1, r * 0.04)
      ..color = Colors.white.withValues(alpha: 0.45);
    for (var i = 0; i < 6; i++) {
      final a = i * math.pi / 3;
      canvas.drawLine(c, c + Offset(math.cos(a), math.sin(a)) * r * 0.95, facets);
    }
    canvas.drawCircle(c, r * 0.55, facets);
    final spec = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: 0.95), Colors.white.withValues(alpha: 0)],
      ).createShader(Rect.fromCircle(center: c + Offset(-r * 0.3, -r * 0.35), radius: r * 0.5));
    canvas.drawCircle(c + Offset(-r * 0.28, -r * 0.32), r * 0.38, spec);
    final rim = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.07
      ..color = palette.light.withValues(alpha: 0.9);
    canvas.drawCircle(c, r * 0.96, rim);
  }

  void _paintGalaxy(Canvas canvas, Offset c, double r) {
    final body = Paint()
      ..shader = RadialGradient(
        center: const Alignment(-0.2, -0.2),
        radius: 1.05,
        colors: [palette.base, palette.dark, const Color(0xFF03030C)],
        stops: const [0.0, 0.55, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, body);
    // Nebula swirl.
    final swirl = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.16
      ..shader = SweepGradient(
        colors: [palette.glow.withValues(alpha: 0), palette.glow.withValues(alpha: 0.8), palette.light.withValues(alpha: 0), palette.glow.withValues(alpha: 0.5), palette.glow.withValues(alpha: 0)],
        stops: const [0.0, 0.25, 0.5, 0.75, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r * 0.55, swirl);
    // Stars (deterministic).
    final star = Paint()..color = Colors.white;
    final rnd = math.Random(7);
    for (var i = 0; i < 9; i++) {
      final a = rnd.nextDouble() * math.pi * 2;
      final d = rnd.nextDouble() * r * 0.8;
      canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * d, r * (0.03 + rnd.nextDouble() * 0.04), star);
    }
    final rim = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.06
      ..color = palette.glow.withValues(alpha: 0.9);
    canvas.drawCircle(c, r * 0.96, rim);
  }

  void _paintLava(Canvas canvas, Offset c, double r) {
    // Molten core under a cracked obsidian crust.
    final core = Paint()
      ..shader = RadialGradient(
        colors: [palette.light, palette.base, palette.dark],
        stops: const [0.0, 0.45, 1.0],
      ).createShader(Rect.fromCircle(center: c, radius: r));
    canvas.drawCircle(c, r, core);
    final crust = Paint()..color = const Color(0xFF14090C).withValues(alpha: 0.88);
    // Crust plates: wedges separated by glowing cracks.
    final rnd = math.Random(11);
    var a = 0.0;
    while (a < math.pi * 2) {
      final span = 0.5 + rnd.nextDouble() * 0.6;
      final inner = r * (0.28 + rnd.nextDouble() * 0.15);
      final path = Path()
        ..moveTo(c.dx + math.cos(a + 0.06) * inner, c.dy + math.sin(a + 0.06) * inner)
        ..arcTo(Rect.fromCircle(center: c, radius: r * 0.9), a + 0.06, span - 0.12, false)
        ..lineTo(c.dx + math.cos(a + span - 0.06) * inner, c.dy + math.sin(a + span - 0.06) * inner)
        ..close();
      canvas.drawPath(path, crust);
      a += span;
    }
    final glowRing = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = r * 0.08
      ..color = palette.glow.withValues(alpha: 0.85)
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, r * 0.12);
    canvas.drawCircle(c, r * 0.93, glowRing);
    final spec = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: 0.35), Colors.white.withValues(alpha: 0)],
      ).createShader(Rect.fromCircle(center: c + Offset(-r * 0.3, -r * 0.35), radius: r * 0.5));
    canvas.drawCircle(c + Offset(-r * 0.28, -r * 0.32), r * 0.4, spec);
  }

  @override
  bool shouldRepaint(covariant _SkinnedPiecePainter old) =>
      old.palette != palette || old.style != style || old.highlight != highlight;
}

/// A glossy 3D die in the colours of a [DiceSkin].
class SkinnedDie extends StatelessWidget {
  const SkinnedDie({super.key, required this.skin, this.value = 6, this.size = 52, this.rolling = false, this.dim = false});

  final DiceSkin skin;
  final int value;
  final double size;
  final bool rolling;
  final bool dim;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: dim ? 0.4 : 1,
      child: Transform(
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
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [skin.faceTop, Color.lerp(skin.faceTop, skin.faceBottom, 0.5)!, skin.faceBottom],
            ),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 10, offset: const Offset(0, 5)),
              BoxShadow(color: skin.glow.withValues(alpha: 0.35), blurRadius: 14),
            ],
            border: Border.all(color: Colors.white.withValues(alpha: 0.45)),
          ),
          child: CustomPaint(painter: _PipPainter(value, size, skin.pip)),
        ),
      ),
    );
  }
}

class _PipPainter extends CustomPainter {
  _PipPainter(this.value, this.size, this.color);
  final int value;
  final double size;
  final Color color;

  @override
  void paint(Canvas canvas, Size s) {
    final pip = Paint()..color = color;
    final r = size * 0.085;
    final o = size * 0.28;
    final m = size / 2;
    final spots = <Offset>[];
    if (value == 1 || value == 3 || value == 5) spots.add(Offset(m, m));
    if (value >= 2) {
      spots.add(Offset(m - o, m - o));
      spots.add(Offset(m + o, m + o));
    }
    if (value >= 4) {
      spots.add(Offset(m + o, m - o));
      spots.add(Offset(m - o, m + o));
    }
    if (value >= 6) {
      spots.add(Offset(m - o, m));
      spots.add(Offset(m + o, m));
    }
    for (final spot in spots) {
      canvas.drawCircle(spot, r, pip);
      canvas.drawCircle(spot + Offset(-r * 0.3, -r * 0.3), r * 0.35, Paint()..color = Colors.white.withValues(alpha: 0.35));
    }
  }

  @override
  bool shouldRepaint(covariant _PipPainter old) => old.value != value || old.color != color;
}

/// The board surface: felt gradient, rails, sheen and the viewer's playground
/// glow. Boards put their grid inside it.
class Playground extends StatelessWidget {
  const Playground({super.key, required this.skin, required this.child, this.padding, this.radius = 26});

  final PlaygroundSkin skin;
  final Widget child;
  final EdgeInsets? padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      child: Transform(
        alignment: Alignment.center,
        transform: Matrix4.identity()
          ..setEntry(3, 2, 0.0008)
          ..rotateX(0.04),
        child: Container(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius + 6),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color.lerp(skin.rail, Colors.white, 0.12)!, skin.rail, Color.lerp(skin.rail, Colors.black, 0.45)!],
            ),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.55), blurRadius: 30, offset: const Offset(0, 16)),
              BoxShadow(color: skin.glow.withValues(alpha: 0.22), blurRadius: 46, spreadRadius: -8),
            ],
          ),
          child: Container(
            padding: padding ?? const EdgeInsets.all(10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              gradient: skin.felt,
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
              boxShadow: [
                BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 14, spreadRadius: -4),
              ],
            ),
            child: Stack(
              children: [
                Positioned.fill(
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(radius),
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: const Alignment(0, 0.4),
                          colors: [Colors.white.withValues(alpha: 0.09), Colors.white.withValues(alpha: 0)],
                        ),
                      ),
                    ),
                  ),
                ),
                child,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A compact preview of a piece set (four seats) — used by the shop and inventory.
class PieceSetPreview extends StatelessWidget {
  const PieceSetPreview({super.key, required this.skin, this.size = 26});
  final PieceSkin skin;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 4; i++)
          Padding(
            padding: EdgeInsets.only(right: i == 3 ? 0 : size * 0.18),
            child: SkinnedPiece(skin: skin, seat: i, size: size),
          ),
      ],
    );
  }
}

/// A compact preview of a playground (mini felt swatch with two squares).
class PlaygroundPreview extends StatelessWidget {
  const PlaygroundPreview({super.key, required this.skin, this.width = 72, this.height = 46});
  final PlaygroundSkin skin;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        color: skin.rail,
        boxShadow: [BoxShadow(color: skin.glow.withValues(alpha: 0.35), blurRadius: 10)],
      ),
      child: Container(
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), gradient: skin.felt),
        child: Row(
          children: [
            for (var i = 0; i < 4; i++)
              Expanded(
                child: Column(
                  children: [
                    for (var j = 0; j < 2; j++)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.all(1.5),
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: (i + j).isEven ? skin.lightSquare : skin.darkSquare,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

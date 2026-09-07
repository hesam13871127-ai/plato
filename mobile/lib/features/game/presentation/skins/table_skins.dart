import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/piece_3d.dart';
import '../../domain/entities/game_entities.dart';

/// Cosmetic system for every table.
///
/// * A **piece set** ([PieceSkin]) describes how the four seat colours look in
///   a particular material — the default `classic` set is the polished
///   "Aurora gloss" set; the other sets are sold in the shop as `game_piece`
///   items and are rendered from the `cosmetics.piece` id the server stamps on
///   each seat, so opponents see your pieces exactly as you do.
/// * A **playground** ([PlaygroundSkin]) describes the table felt, rails,
///   grid lines and glow for the whole board. It comes from the *viewer's* own
///   equipped `board_theme` (your table, your mood), defaulting to `classic`.
/// * A **dice set** ([DiceSkin]) colours the 3D dice.
///
/// All skins are pure data + painters (no assets), so new ones are one entry.
class TableSkins {
  TableSkins._();

  static const String defaultId = 'classic';

  static const Map<String, PieceSkin> pieces = {
    'classic': PieceSkin(
      id: 'classic',
      name: 'Aurora Gloss',
      style: PieceStyle.gloss,
      seats: [_auroraViolet, _auroraCoral, _auroraMint, _auroraGold],
    ),
    'neon': PieceSkin(
      id: 'neon',
      name: 'Neon',
      style: PieceStyle.neon,
      seats: [_neonCyan, _neonPink, _neonLime, _neonAmber],
    ),
    'candy': PieceSkin(
      id: 'candy',
      name: 'Candy',
      style: PieceStyle.candy,
      seats: [_candyBlue, _candyPink, _candyMint, _candyLemon],
    ),
    'wooden': PieceSkin(
      id: 'wooden',
      name: 'Wooden',
      style: PieceStyle.matte,
      seats: [_walnut, _cherry, _olive, _maple],
    ),
    'gold': PieceSkin(
      id: 'gold',
      name: 'Royal Gold',
      style: PieceStyle.metal,
      seats: [_royalGold, _rubyGold, _emeraldGold, _pearlGold],
    ),
    'crystal': PieceSkin(
      id: 'crystal',
      name: 'Crystal',
      style: PieceStyle.glass,
      seats: [_crystalBlue, _crystalRose, _crystalGreen, _crystalAmber],
    ),
    'galaxy': PieceSkin(
      id: 'galaxy',
      name: 'Galaxy',
      style: PieceStyle.galaxy,
      seats: [_galaxyIndigo, _galaxyMagenta, _galaxyTeal, _galaxySolar],
    ),
    'marble': PieceSkin(
      id: 'marble',
      name: 'Marble',
      style: PieceStyle.matte,
      seats: [_marbleWhite, _marbleBlack, _marbleGreen, _marbleRose],
    ),
    'hologram': PieceSkin(
      id: 'hologram',
      name: 'Hologram',
      style: PieceStyle.glass,
      seats: [_neonCyan, _neonPink, _neonLime, _neonAmber],
    ),
    'lava': PieceSkin(
      id: 'lava',
      name: 'Lava',
      style: PieceStyle.lava,
      seats: [_lavaViolet, _lavaRed, _lavaTeal, _lavaAmber],
    ),
  };

  static const Map<String, PlaygroundSkin> playgrounds = {
    'classic': PlaygroundSkin(
      id: 'classic',
      name: 'Aurora Table',
      feltTop: Color(0xFF1B1E4A),
      feltBottom: Color(0xFF0C0E26),
      rail: Color(0xFF2A2657),
      line: Color(0x4DFFFFFF),
      glow: AppColors.electricPurple,
      accent: AppColors.softCyan,
      lightSquare: Color(0xFF3B3F7A),
      darkSquare: Color(0xFF232652),
    ),
    'midnight': PlaygroundSkin(
      id: 'midnight',
      name: 'Midnight Velvet',
      feltTop: Color(0xFF181C3F),
      feltBottom: Color(0xFF07091A),
      rail: Color(0xFF3B2A6E),
      line: Color(0x40C9B8FF),
      glow: Color(0xFF9B7BFF),
      accent: Color(0xFFC9B8FF),
      lightSquare: Color(0xFF34366E),
      darkSquare: Color(0xFF1B1C45),
    ),
    'gold_casino': PlaygroundSkin(
      id: 'gold_casino',
      name: 'Gold Casino',
      feltTop: Color(0xFF1E5A3A),
      feltBottom: Color(0xFF0B2A1B),
      rail: Color(0xFF8A6A1E),
      line: Color(0x66FFD26B),
      glow: Color(0xFFFFC857),
      accent: Color(0xFFFFE08A),
      lightSquare: Color(0xFF3B7A55),
      darkSquare: Color(0xFF1E4A33),
    ),
    'forest': PlaygroundSkin(
      id: 'forest',
      name: 'Emerald Forest',
      feltTop: Color(0xFF1F4F3A),
      feltBottom: Color(0xFF0C2419),
      rail: Color(0xFF5E4024),
      line: Color(0x55D8F5E2),
      glow: Color(0xFF3DF2C4),
      accent: Color(0xFFB9F5DB),
      lightSquare: Color(0xFF3F7A5A),
      darkSquare: Color(0xFF244B38),
    ),
    'sakura': PlaygroundSkin(
      id: 'sakura',
      name: 'Sakura',
      feltTop: Color(0xFF4B1E3D),
      feltBottom: Color(0xFF1E0B19),
      rail: Color(0xFF7A2E5C),
      line: Color(0x66FFC6DE),
      glow: Color(0xFFFF8BB5),
      accent: Color(0xFFFFD1E3),
      lightSquare: Color(0xFF7A3C64),
      darkSquare: Color(0xFF4A2040),
    ),
    'cyber': PlaygroundSkin(
      id: 'cyber',
      name: 'Cyber Grid',
      feltTop: Color(0xFF0B1220),
      feltBottom: Color(0xFF02050C),
      rail: Color(0xFF0E2A3A),
      line: Color(0x8800E5FF),
      glow: Color(0xFF00E5FF),
      accent: Color(0xFF7DF9FF),
      lightSquare: Color(0xFF12304A),
      darkSquare: Color(0xFF071A2A),
    ),
    'sunset': PlaygroundSkin(
      id: 'sunset',
      name: 'Sunset Dunes',
      feltTop: Color(0xFF5A2A4A),
      feltBottom: Color(0xFF241026),
      rail: Color(0xFF8A4A2A),
      line: Color(0x66FFD9A8),
      glow: Color(0xFFFF9A5C),
      accent: Color(0xFFFFD9A8),
      lightSquare: Color(0xFF8A4A5A),
      darkSquare: Color(0xFF4F2A44),
    ),
    'ice': PlaygroundSkin(
      id: 'ice',
      name: 'Aurora Ice',
      feltTop: Color(0xFF1E3A5F),
      feltBottom: Color(0xFF0A1830),
      rail: Color(0xFF9FD3F0),
      line: Color(0x88DFF6FF),
      glow: Color(0xFF7FE3FF),
      accent: Color(0xFFDFF6FF),
      lightSquare: Color(0xFF4B7FB3),
      darkSquare: Color(0xFF244B7A),
    ),
    'lava': PlaygroundSkin(
      id: 'lava',
      name: 'Lava',
      feltTop: Color(0xFF2A1416),
      feltBottom: Color(0xFF0E0506),
      rail: Color(0xFF3A1A14),
      line: Color(0x88FF7A3D),
      glow: Color(0xFFFF5A1F),
      accent: Color(0xFFFFB347),
      lightSquare: Color(0xFF5A2A22),
      darkSquare: Color(0xFF2E1412),
    ),
    'walnut': PlaygroundSkin(
      id: 'walnut',
      name: 'Royal Walnut',
      feltTop: Color(0xFF244A3A),
      feltBottom: Color(0xFF0F2A1F),
      rail: Color(0xFF5A3A22),
      line: Color(0x66F2D9A8),
      glow: Color(0xFFE8B923),
      accent: Color(0xFFF2D9A8),
      lightSquare: Color(0xFFC9A46A),
      darkSquare: Color(0xFF6E4527),
    ),
    'arcade': PlaygroundSkin(
      id: 'arcade',
      name: 'Neon Arcade',
      feltTop: Color(0xFF1A0B3A),
      feltBottom: Color(0xFF07031A),
      rail: Color(0xFF2A1160),
      line: Color(0x99FF2DAA),
      glow: Color(0xFFFF2DAA),
      accent: Color(0xFF00F0FF),
      lightSquare: Color(0xFF3A1A78),
      darkSquare: Color(0xFF1B0B44),
    ),
    'ocean': PlaygroundSkin(
      id: 'ocean',
      name: 'Deep Ocean',
      feltTop: Color(0xFF0B3A5C),
      feltBottom: Color(0xFF041A2E),
      rail: Color(0xFF0E2A44),
      line: Color(0x8878E0FF),
      glow: Color(0xFF3DC8FF),
      accent: Color(0xFF7FF4E0),
      lightSquare: Color(0xFF2C6E96),
      darkSquare: Color(0xFF123B5C),
    ),
  };

  static const Map<String, DiceSkin> dice = {
    'classic': DiceSkin(id: 'classic', name: 'Aurora Dice', faceTop: Color(0xFFFFFFFF), faceBottom: Color(0xFFCFD3F5), pip: Color(0xFF2A2657), glow: AppColors.electricPurple),
    'ivory': DiceSkin(id: 'ivory', name: 'Ivory', faceTop: Color(0xFFFFF9EA), faceBottom: Color(0xFFE6D8B8), pip: Color(0xFF0B1426), glow: Color(0xFFFFE9B8)),
    'gold': DiceSkin(id: 'gold', name: 'Golden', faceTop: Color(0xFFFFE28A), faceBottom: Color(0xFFB8860B), pip: Color(0xFF3A2500), glow: Color(0xFFFFC857)),
    'neon': DiceSkin(id: 'neon', name: 'Neon', faceTop: Color(0xFF1C2B5A), faceBottom: Color(0xFF0B1230), pip: Color(0xFF00E5FF), glow: Color(0xFF00E5FF)),
  };

  static PieceSkin pieceSkin(String? id) => pieces[id] ?? pieces[defaultId]!;
  static PlaygroundSkin playground(String? id) => playgrounds[id] ?? playgrounds[defaultId]!;
  static DiceSkin diceSkin(String? id) => dice[id] ?? dice[defaultId]!;

  /// Palette for a seat, honouring that seat's equipped piece set.
  static PiecePalette paletteFor(GameSessionView session, int seat) {
    final skin = pieceSkin(session.cosmeticsOf(seat).piece);
    return skin.palette(seat);
  }

  /// The playground to draw for the viewer (their own equipped theme).
  static PlaygroundSkin playgroundFor(GameSessionView session, int mySeat) {
    return playground(session.cosmeticsOf(mySeat).board);
  }

  /// The dice to draw. Turn-based dice games show the *roller's* dice.
  static DiceSkin diceFor(GameSessionView session, int seat) {
    return diceSkin(session.cosmeticsOf(seat).dice);
  }
}

enum PieceStyle { gloss, neon, candy, matte, metal, glass, galaxy, lava }

class PieceSkin {
  const PieceSkin({required this.id, required this.name, required this.style, required this.seats});
  final String id;
  final String name;
  final PieceStyle style;

  /// Four seat palettes (seat index mod 4).
  final List<PiecePalette> seats;

  PiecePalette palette(int seat) => seats[seat < 0 ? 0 : seat % seats.length];
}

class PlaygroundSkin {
  const PlaygroundSkin({
    required this.id,
    required this.name,
    required this.feltTop,
    required this.feltBottom,
    required this.rail,
    required this.line,
    required this.glow,
    required this.accent,
    required this.lightSquare,
    required this.darkSquare,
  });

  final String id;
  final String name;
  final Color feltTop;
  final Color feltBottom;
  final Color rail;
  final Color line;
  final Color glow;
  final Color accent;
  final Color lightSquare;
  final Color darkSquare;

  LinearGradient get felt => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color.lerp(feltTop, Colors.white, 0.06)!, feltTop, feltBottom],
        stops: const [0.0, 0.35, 1.0],
      );
}

class DiceSkin {
  const DiceSkin({
    required this.id,
    required this.name,
    required this.faceTop,
    required this.faceBottom,
    required this.pip,
    required this.glow,
  });
  final String id;
  final String name;
  final Color faceTop;
  final Color faceBottom;
  final Color pip;
  final Color glow;
}

// ── Piece palettes (light, base, dark, glow) ────────────────────────────────

// Aurora gloss (default — the showcase set).
const _auroraViolet = PiecePalette(Color(0xFFCFC2FF), Color(0xFF8A6CFF), Color(0xFF3B2A9E), Color(0xFFB9A6FF));
const _auroraCoral = PiecePalette(Color(0xFFFFC2D0), Color(0xFFFF6B8B), Color(0xFF9E2A48), Color(0xFFFF9DB4));
const _auroraMint = PiecePalette(Color(0xFFC8FFF0), Color(0xFF3DF2C4), Color(0xFF13806A), Color(0xFF8FFFE2));
const _auroraGold = PiecePalette(Color(0xFFFFEDB8), Color(0xFFFFC857), Color(0xFF9E6A0B), Color(0xFFFFE08A));

// Neon.
const _neonCyan = PiecePalette(Color(0xFFB8FBFF), Color(0xFF00E5FF), Color(0xFF006E80), Color(0xFF00E5FF));
const _neonPink = PiecePalette(Color(0xFFFFC2F4), Color(0xFFFF3DCE), Color(0xFF7A0E60), Color(0xFFFF3DCE));
const _neonLime = PiecePalette(Color(0xFFE4FFB8), Color(0xFFA6FF3D), Color(0xFF4C7A0E), Color(0xFFA6FF3D));
const _neonAmber = PiecePalette(Color(0xFFFFE6B8), Color(0xFFFFB13D), Color(0xFF7A4E0E), Color(0xFFFFB13D));

// Candy.
const _candyBlue = PiecePalette(Color(0xFFE6F3FF), Color(0xFF7CC4FF), Color(0xFF2E6FB0), Color(0xFFB9DDFF));
const _candyPink = PiecePalette(Color(0xFFFFE8F2), Color(0xFFFF9BC7), Color(0xFFB04A7C), Color(0xFFFFC2DE));
const _candyMint = PiecePalette(Color(0xFFE9FFF6), Color(0xFF8DF0C6), Color(0xFF3E9A78), Color(0xFFBDF7DF));
const _candyLemon = PiecePalette(Color(0xFFFFFCE0), Color(0xFFFFE680), Color(0xFFB09A2E), Color(0xFFFFF1B0));

// Wooden.
const _walnut = PiecePalette(Color(0xFFB8875A), Color(0xFF7A4B24), Color(0xFF3A1F0B), Color(0xFFD9A46A));
const _cherry = PiecePalette(Color(0xFFD98A7A), Color(0xFF9A3B2E), Color(0xFF4A160F), Color(0xFFE8A090));
const _olive = PiecePalette(Color(0xFFB8B27A), Color(0xFF6F6A2E), Color(0xFF34310F), Color(0xFFD1CB8A));
const _maple = PiecePalette(Color(0xFFF6E2BC), Color(0xFFD9B77A), Color(0xFF8A6A3A), Color(0xFFFFF0CC));

// Royal gold.
const _royalGold = PiecePalette(Color(0xFFFFF3C4), Color(0xFFE8B923), Color(0xFF7A5A05), Color(0xFFFFE08A));
const _rubyGold = PiecePalette(Color(0xFFFFC9C9), Color(0xFFD8323C), Color(0xFF6E0A12), Color(0xFFFF8A8A));
const _emeraldGold = PiecePalette(Color(0xFFC9FFE0), Color(0xFF1FA868), Color(0xFF0A4A2C), Color(0xFF8AFFC2));
const _pearlGold = PiecePalette(Color(0xFFFFFFFF), Color(0xFFE8E4F0), Color(0xFF8E8AA0), Color(0xFFFFFFFF));

// Crystal.
const _crystalBlue = PiecePalette(Color(0xFFEAF8FF), Color(0xFF76D4FF), Color(0xFF1B6EA0), Color(0xFFB6EBFF));
const _crystalRose = PiecePalette(Color(0xFFFFEEF5), Color(0xFFFF9FCB), Color(0xFFA0356F), Color(0xFFFFC8E1));
const _crystalGreen = PiecePalette(Color(0xFFEEFFF6), Color(0xFF9CF2C9), Color(0xFF2B8F62), Color(0xFFC8FFE6));
const _crystalAmber = PiecePalette(Color(0xFFFFF7E6), Color(0xFFFFD27A), Color(0xFFA0721B), Color(0xFFFFE6B0));

// Galaxy.
const _galaxyIndigo = PiecePalette(Color(0xFF9FB4FF), Color(0xFF3D3BB5), Color(0xFF0A0830), Color(0xFF8A8CFF));
const _galaxyMagenta = PiecePalette(Color(0xFFFFA6E6), Color(0xFFB0289A), Color(0xFF2E0426), Color(0xFFFF6BD6));
const _galaxyTeal = PiecePalette(Color(0xFFA8FFF1), Color(0xFF1D9E9A), Color(0xFF042827), Color(0xFF63FFE8));
const _galaxySolar = PiecePalette(Color(0xFFFFE4A3), Color(0xFFE07A1F), Color(0xFF3A1A03), Color(0xFFFFB35C));

// Marble.
const _marbleWhite = PiecePalette(Color(0xFFFFFFFF), Color(0xFFE9E7EF), Color(0xFF9C98AA), Color(0xFFFFFFFF));
const _marbleBlack = PiecePalette(Color(0xFF6E6E80), Color(0xFF2A2A38), Color(0xFF0A0A12), Color(0xFF7C7C96));
const _marbleGreen = PiecePalette(Color(0xFFBFE3CF), Color(0xFF4E8F6C), Color(0xFF1F4633), Color(0xFF9AD8B4));
const _marbleRose = PiecePalette(Color(0xFFF8D9DC), Color(0xFFC98A93), Color(0xFF6E3C44), Color(0xFFF0B8BE));

// Lava (cracked obsidian, molten core).
const _lavaViolet = PiecePalette(Color(0xFFD9A6FF), Color(0xFF8A3DFF), Color(0xFF1A0A2E), Color(0xFFB56BFF));
const _lavaRed = PiecePalette(Color(0xFFFFC28A), Color(0xFFFF5A1F), Color(0xFF2E0A06), Color(0xFFFF8A3D));
const _lavaTeal = PiecePalette(Color(0xFFA8FFF0), Color(0xFF1FC9A8), Color(0xFF062420), Color(0xFF63FFE0));
const _lavaAmber = PiecePalette(Color(0xFFFFF0B0), Color(0xFFFFB347), Color(0xFF2E1A04), Color(0xFFFFD27A));

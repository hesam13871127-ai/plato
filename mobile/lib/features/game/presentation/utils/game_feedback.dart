import 'package:flutter/services.dart';

/// Lightweight, dependency-free tactile/audio feedback for game events.
///
/// Uses the built-in [HapticFeedback] and [SystemSound] APIs so no native
/// plugins are required (important for offline CI). Boards call these on key
/// moments — a piece landing, a win, an error — to make tables feel alive.
class GameFeedback {
  GameFeedback._();

  static bool _muted = false;
  static bool get isMuted => _muted;

  /// Toggle sound/haptics globally (wired to the in-table mute control).
  static bool toggleMute() {
    _muted = !_muted;
    return _muted;
  }

  /// Soft tap for selection / UI.
  static void tap() {
    if (_muted) return;
    HapticFeedback.selectionClick();
  }

  /// Medium impact for a move / card played / piece placed.
  static void move() {
    if (_muted) return;
    HapticFeedback.mediumImpact();
    SystemSound.play(SystemSoundType.click);
  }

  /// Strong impact for captures, pots, claims and other high-impact events.
  static void hit() {
    if (_muted) return;
    HapticFeedback.heavyImpact();
  }

  /// Light bounce for dice rolls, draws and ticks.
  static void roll() {
    if (_muted) return;
    HapticFeedback.lightImpact();
  }

  /// Success — win, bingo, checkmate.
  static void win() {
    if (_muted) return;
    HapticFeedback.heavyImpact();
    SystemSound.play(SystemSoundType.alert);
  }

  /// Failure — illegal move, scratch, foul.
  static void error() {
    if (_muted) return;
    HapticFeedback.vibrate();
  }
}

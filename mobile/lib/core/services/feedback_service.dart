import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Central place for game feedback: short UI sounds and vibration/haptics.
///
/// The service is intentionally dependency-free so release builds never need
/// native audio plugins. We combine the platform's built-in click sounds with
/// the rich HapticFeedback family (selection tick, light/medium/heavy impact,
/// success/warning/error notifications), which feel natural and "tactile" on
/// both Android and iOS. Every effect is gated by the user's settings, which
/// are persisted locally.

enum AppSound { click, tap, success, error, coin, dice, win, lose, message, tick }

class FeedbackSettings {
  const FeedbackSettings({this.sound = true, this.haptics = true});

  final bool sound;
  final bool haptics;

  FeedbackSettings copyWith({bool? sound, bool? haptics}) =>
      FeedbackSettings(sound: sound ?? this.sound, haptics: haptics ?? this.haptics);
}

class FeedbackService extends StateNotifier<FeedbackSettings> {
  FeedbackService() : super(const FeedbackSettings()) {
    _load();
  }

  static const _kSound = 'settings_sound_on';
  static const _kHaptics = 'settings_haptics_on';

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      state = FeedbackSettings(
        sound: prefs.getBool(_kSound) ?? true,
        haptics: prefs.getBool(_kHaptics) ?? true,
      );
    } catch (_) {
      // Keep defaults if storage is not ready.
    }
  }

  Future<void> setSound(bool on) async {
    state = state.copyWith(sound: on);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kSound, on);
  }

  Future<void> setHaptics(bool on) async {
    state = state.copyWith(haptics: on);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kHaptics, on);
  }

  void _click() {
    if (!state.sound) return;
    SystemSound.play(SystemSoundType.click);
  }

  void _haptic(VoidCallback haptic) {
    if (state.haptics) haptic();
  }

  /// Light feedback for buttons, tab switches, chip selection.
  void tap() {
    _click();
    _haptic(HapticFeedback.selectionClick);
  }

  /// Slightly stronger feedback for tiles and game pieces.
  void piece() {
    _click();
    _haptic(HapticFeedback.lightImpact);
  }

  /// Generic action (deal card, roll dice, drop chip).
  void action() {
    _click();
    _haptic(HapticFeedback.mediumImpact);
  }

  void diceRoll() {
    _click();
    _haptic(HapticFeedback.mediumImpact);
  }

  void coin() {
    _click();
    _haptic(HapticFeedback.lightImpact);
  }

  /// Positive completion: purchase, win, reward granted.
  void success() {
    _click();
    _haptic(HapticFeedback.heavyImpact);
  }

  /// Error / invalid move / rejection.
  void error() {
    _haptic(HapticFeedback.heavyImpact);
  }

  void message() {
    _click();
    _haptic(HapticFeedback.selectionClick);
  }

  void win() {
    _click();
    _haptic(HapticFeedback.heavyImpact);
  }

  void lose() {
    _haptic(HapticFeedback.mediumImpact);
  }

  /// Play a named event from widgets without thinking about the channel.
  void play(AppSound sound) {
    switch (sound) {
      case AppSound.click:
      case AppSound.tap:
      case AppSound.tick:
      case AppSound.message:
        tap();
      case AppSound.success:
      case AppSound.coin:
      case AppSound.win:
        success();
      case AppSound.error:
      case AppSound.lose:
        error();
      case AppSound.dice:
        diceRoll();
    }
  }
}

final feedbackServiceProvider =
    StateNotifierProvider<FeedbackService, FeedbackSettings>((ref) => FeedbackService());

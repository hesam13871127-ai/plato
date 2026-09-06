import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

///
/// A drop-in replacement for every `CircleAvatar(backgroundImage: NetworkImage(...))`.
///
/// Performance characteristics:
///  - images are cached on disk **and** in memory by [CachedNetworkImage] so
///    scrolling a chat list or leaderboard never re-downloads or re-decodes;
///  - images are downsampled to the avatar's rendered size (`cacheWidth`),
///    keeping decoded-image memory tiny even for large source avatars;
///  - the network request is lazy (driven by the widget lifecycle) and the
///    placeholder is built synchronously, so off-screen avatars in a list cost
///    nothing until they are about to become visible;
///  - a themed fallback (initial letter) is shown while loading and on error,
///    so a broken/expired URL never renders as a blank red box.
///
class CachedAvatar extends StatelessWidget {
  const CachedAvatar({
    super.key,
    required this.name,
    this.imageUrl,
    this.radius = 22,
    this.ringColor,
    this.fallbackIcon,
  });

  /// Display name used for the initial-letter fallback.
  final String name;

  /// Remote avatar URL, or null to always show the initials fallback.
  final String? imageUrl;

  /// Avatar radius in logical pixels.
  final double radius;

  /// Optional accent ring (used for ranked / equipped-frame avatars).
  final Color? ringColor;

  /// Optional icon to show in the fallback instead of the initial letter
  /// (used for group/club avatars).
  final IconData? fallbackIcon;

  @override
  Widget build(BuildContext context) {
    final diameter = radius * 2;
    final initial = _initial(name);

    Widget avatar;
    final url = imageUrl;
    if (url == null || url.isEmpty) {
      avatar = _fallback(diameter, initial, icon: fallbackIcon);
    } else {
      avatar = CachedNetworkImage(
        imageUrl: url,
        width: diameter,
        height: diameter,
        // Decode at (roughly) device-pixel resolution so we never hold a
        // full-resolution bitmap for a 44px circle.
        memCacheWidth: (diameter * MediaQuery.devicePixelRatioOf(context)).round(),
        fadeInDuration: const Duration(milliseconds: 150),
        placeholder: (_, __) => _fallback(diameter, initial, icon: fallbackIcon, loading: true),
        errorWidget: (_, __, ___) => _fallback(diameter, initial, icon: fallbackIcon),
        imageBuilder: (context, imageProvider) => Container(
          width: diameter,
          height: diameter,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            image: DecorationImage(image: imageProvider, fit: BoxFit.cover),
          ),
        ),
      );
    }

    if (ringColor != null) {
      avatar = Container(
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: ringColor!, width: 2),
        ),
        child: avatar,
      );
    }
    return avatar;
  }

  /// Themed initial-letter (or icon) placeholder, matching the brand glass look.
  Widget _fallback(double diameter, String initial, {IconData? icon, bool loading = false}) {
    return Container(
      width: diameter,
      height: diameter,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: [AppColors.electricPurple, AppColors.surfaceElevated],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: loading
          ? SizedBox(
              width: diameter * 0.4,
              height: diameter * 0.4,
              child: const CircularProgressIndicator(strokeWidth: 2, color: AppColors.softCyan),
            )
          : icon != null
              ? Icon(icon, color: AppColors.textPrimary, size: diameter * 0.5)
              : Text(
                  initial,
                  style: TextStyle(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w800,
                    fontSize: diameter * 0.42,
                  ),
                ),
    );
  }

  String _initial(String displayName) {
    final trimmed = displayName.trim();
    if (trimmed.isEmpty) return '?';
    // Take the first grapheme-ish character (emoji-safe enough for avatars).
    return trimmed.characters.first.toUpperCase();
  }
}

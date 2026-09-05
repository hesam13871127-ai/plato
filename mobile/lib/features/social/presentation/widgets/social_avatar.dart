import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/social_entities.dart';

/// Circular avatar with a green presence dot for online users.
class SocialAvatar extends StatelessWidget {
  const SocialAvatar({super.key, required this.user, this.radius = 22});

  final SocialUser user;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: radius * 2,
      height: radius * 2,
      child: Stack(
        children: [
          CircleAvatar(
            radius: radius,
            backgroundColor: AppColors.surfaceElevated,
            backgroundImage: user.avatarUrl != null ? NetworkImage(user.avatarUrl!) : null,
            child: user.avatarUrl == null
                ? Text(
                    user.displayName.isNotEmpty ? user.displayName[0].toUpperCase() : '?',
                    style: TextStyle(fontSize: radius * 0.8, fontWeight: FontWeight.w800),
                  )
                : null,
          ),
          if (user.online)
            Positioned(
              right: 1,
              bottom: 1,
              child: Container(
                width: radius * 0.55,
                height: radius * 0.55,
                decoration: BoxDecoration(
                  color: AppColors.success,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.deepNavy, width: 2),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

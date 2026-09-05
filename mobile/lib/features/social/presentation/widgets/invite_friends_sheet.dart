import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/social_entities.dart';
import '../providers/social_providers.dart';
import 'social_avatar.dart';

/// Bottom sheet that lets a host pick online (or any) friends and sends them a
/// real-time game invite to [roomId]. Returns the number of friends invited.
class InviteFriendsSheet extends ConsumerStatefulWidget {
  const InviteFriendsSheet({super.key, required this.roomId});

  final String roomId;

  /// Opens the sheet and returns once invitations have been sent.
  static Future<void> open(BuildContext context, String roomId) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surfaceDark,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => InviteFriendsSheet(roomId: roomId),
    );
  }

  @override
  ConsumerState<InviteFriendsSheet> createState() => _InviteFriendsSheetState();
}

class _InviteFriendsSheetState extends ConsumerState<InviteFriendsSheet> {
  final Set<String> _selected = {};
  bool _sending = false;

  @override
  Widget build(BuildContext context) {
    final overview = ref.watch(friendsOverviewProvider);

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Invite friends',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
          const SizedBox(height: 4),
          const Text('Send a game invite — friends get a notification instantly.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 14),
          SizedBox(
            height: 320,
            child: overview.when(
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
              error: (e, _) => Center(
                child: Text(e.toString().replaceFirst('Bad state: ', ''),
                    style: const TextStyle(color: AppColors.textSecondary)),
              ),
              data: (o) {
                final friends = [...o.onlineFriends, ...o.friends.where((f) => !f.online)];
                if (friends.isEmpty) {
                  return const Center(
                    child: Text('No friends yet. Add friends to invite them.',
                        style: TextStyle(color: AppColors.textSecondary)),
                  );
                }
                return ListView(
                  children: friends.map((f) => _friendTile(f)).toList(),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.electricPurple,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              icon: _sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.send, size: 18),
              label: Text(_selected.isEmpty ? 'Select friends' : 'Send invites (${_selected.length})'),
              onPressed: _selected.isEmpty || _sending ? null : _send,
            ),
          ),
        ],
      ),
    );
  }

  Widget _friendTile(SocialUser f) {
    final checked = _selected.contains(f.id);
    return CheckboxListTile(
      value: checked,
      activeColor: AppColors.electricPurple,
      onChanged: (v) => setState(() {
        if (v == true) {
          _selected.add(f.id);
        } else {
          _selected.remove(f.id);
        }
      }),
      secondary: SocialAvatar(user: f, radius: 20),
      title: Text(f.displayName, style: const TextStyle(color: AppColors.textPrimary)),
      subtitle: Text(f.online ? 'Online' : 'Offline',
          style: TextStyle(fontSize: 12, color: f.online ? AppColors.success : AppColors.textMuted)),
    );
  }

  Future<void> _send() async {
    setState(() => _sending = true);
    final result = await ref
        .read(socialRepositoryProvider)
        .inviteToRoom(roomId: widget.roomId, userIds: _selected.toList());
    if (!mounted) return;
    setState(() => _sending = false);
    result.fold(
      (failure) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failure.message))),
      (count) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Invite sent to $count friend${count == 1 ? '' : 's'}.')),
        );
        Navigator.of(context).pop();
      },
    );
  }
}

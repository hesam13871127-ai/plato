import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../chat/presentation/screens/chat_thread_screen.dart';
import '../../../chat/presentation/providers/chat_providers.dart';
import '../../domain/entities/social_entities.dart';
import 'groups_screen.dart';
import '../providers/social_providers.dart';
import '../widgets/social_avatar.dart';

/// Friends hub: online friends, full friend list, incoming/outgoing requests,
/// blocked users and an add-by-username action.
class FriendsScreen extends ConsumerWidget {
  const FriendsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(friendsOverviewProvider);

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: AppColors.deepNavy,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          title: const Text('Friends'),
            actions: [
            IconButton(
              tooltip: 'Add friend',
              icon: const Icon(Icons.person_add_alt_1, color: AppColors.softCyan),
              onPressed: () => _showAddFriend(context, ref),
            ),
            IconButton(
              tooltip: 'Groups',
              icon: const Icon(Icons.groups_2, color: AppColors.softCyan),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const GroupsScreen()),
              ),
            ),
            IconButton(
              tooltip: 'Refresh',
              icon: const Icon(Icons.refresh, color: AppColors.textSecondary),
              onPressed: () => ref.invalidate(friendsOverviewProvider),
            ),
          ],
          bottom: TabBar(
            indicatorColor: AppColors.softCyan,
            labelColor: AppColors.softCyan,
            unselectedLabelColor: AppColors.textSecondary,
            tabs: [
              const Tab(text: 'Friends'),
              Tab(
                child: overview.maybeWhen(
                  data: (o) => _TabLabel('Requests', o.incoming.length),
                  orElse: () => const Text('Requests'),
                ),
              ),
              Tab(
                child: overview.maybeWhen(
                  data: (o) => _TabLabel('Blocked', o.blocked.length),
                  orElse: () => const Text('Blocked'),
                ),
              ),
            ],
          ),
        ),
        body: overview.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.softCyan),
          ),
          error: (e, _) => _ErrorState(
            message: e.toString().replaceFirst('Bad state: ', ''),
            onRetry: () => ref.invalidate(friendsOverviewProvider),
          ),
          data: (o) => TabBarView(
            children: [
              _FriendsTab(overview: o),
              _RequestsTab(overview: o),
              _BlockedTab(overview: o),
            ],
          ),
        ),
      ),
    );
  }

  void _showAddFriend(BuildContext context, WidgetRef ref) {
    final controller = TextEditingController();
    showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.surfaceDark,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Add a friend',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
              const SizedBox(height: 4),
              const Text('Enter their username to send a friend request.',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              const SizedBox(height: 16),
              TextField(
                controller: controller,
                autofocus: true,
                textInputAction: TextInputAction.done,
                style: const TextStyle(color: AppColors.textPrimary),
                decoration: InputDecoration(
                  hintText: 'username',
                  prefixText: '@',
                  filled: true,
                  fillColor: AppColors.surfaceElevated,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                ),
                onSubmitted: (value) => Navigator.of(sheetContext).pop(value.trim()),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.electricPurple,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  icon: const Icon(Icons.send, size: 18),
                  label: const Text('Send request'),
                  onPressed: () => Navigator.of(sheetContext).pop(controller.text.trim()),
                ),
              ),
            ],
          ),
        );
      },
    ).then((value) async {
      if (value == null || value.isEmpty) return;
      final actions = ref.read(socialActionsProvider);
      final error = await actions.sendRequest(username: value.replaceAll('@', ''));
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error ?? 'Friend request sent to @$value.')),
      );
    });
  }
}

class _TabLabel extends StatelessWidget {
  const _TabLabel(this.text, this.count);
  final String text;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(text),
        if (count > 0) ...[
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: AppColors.electricPurple,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text('$count',
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
        ],
      ],
    );
  }
}

class _FriendsTab extends StatelessWidget {
  const _FriendsTab({required this.overview});
  final FriendsOverview overview;

  @override
  Widget build(BuildContext context) {
    final online = overview.onlineFriends;
    final offline = overview.friends.where((f) => !f.online).toList();

    if (overview.friends.isEmpty) {
      return const _EmptyState(
        icon: Icons.people_alt_outlined,
        title: 'No friends yet',
        subtitle: 'Add friends by their username to play and chat together.',
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (online.isNotEmpty) ...[
          const _SectionHeader('Online now'),
          SizedBox(
            height: 92,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: online.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, i) => _OnlineFriendChip(user: online[i]),
            ),
          ),
          const SizedBox(height: 16),
        ],
        const _SectionHeader('All friends'),
        ...offline.map((u) => _FriendTile(user: u)),
        // online friends also appear in the full list below the chips
        ...online.map((u) => _FriendTile(user: u)),
      ],
    );
  }
}

class _OnlineFriendChip extends StatelessWidget {
  const _OnlineFriendChip({required this.user});
  final SocialUser user;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 72,
      child: Column(
        children: [
          SocialAvatar(user: user, radius: 26),
          const SizedBox(height: 6),
          Text(
            user.displayName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, color: AppColors.textPrimary, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _FriendTile extends ConsumerWidget {
  const _FriendTile({required this.user});
  final SocialUser user;

  Future<void> _openDirectChat(BuildContext context, WidgetRef ref) async {
    final result = await ref.read(chatRepositoryProvider).openDirectChat(userId: user.id);
    if (!context.mounted) return;
    result.fold(
      (failure) => ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(failure.message))),
      (conversation) {
        Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => ChatThreadScreen(
            chatId: conversation.id,
            title: user.displayName,
            isDirect: true,
            otherUserId: user.id,
            otherOnline: user.online,
          ),
        ));
      },
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            SocialAvatar(user: user),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(user.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                  Text(
                    user.online ? 'Online' : 'Offline',
                    style: TextStyle(
                      fontSize: 12,
                      color: user.online ? AppColors.success : AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Message',
              icon: const Icon(Icons.chat_bubble_outline, color: AppColors.softCyan, size: 20),
              onPressed: () => _openDirectChat(context, ref),
            ),
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, color: AppColors.textSecondary),
              color: AppColors.surfaceElevated,
              onSelected: (value) async {
                final actions = ref.read(socialActionsProvider);
                String? error;
                if (value == 'remove') error = await actions.remove(user.id);
                if (value == 'block') error = await actions.block(userId: user.id);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(error ?? 'Done.')),
                  );
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'remove', child: Text('Remove friend')),
                PopupMenuItem(value: 'block', child: Text('Block')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RequestsTab extends ConsumerWidget {
  const _RequestsTab({required this.overview});
  final FriendsOverview overview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final incoming = overview.incoming;
    final outgoing = overview.outgoing;

    if (incoming.isEmpty && outgoing.isEmpty) {
      return const _EmptyState(
        icon: Icons.mark_email_read_outlined,
        title: 'No pending requests',
        subtitle: 'Friend requests you send or receive will appear here.',
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (incoming.isNotEmpty) ...[
          const _SectionHeader('Incoming'),
          ...incoming.map((r) => _IncomingTile(request: r)),
        ],
        if (outgoing.isNotEmpty) ...[
          const SizedBox(height: 8),
          const _SectionHeader('Sent'),
          ...outgoing.map((r) => _OutgoingTile(request: r)),
        ],
      ],
    );
  }
}

class _IncomingTile extends ConsumerWidget {
  const _IncomingTile({required this.request});
  final FriendRequest request;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            SocialAvatar(user: request.user),
            const SizedBox(width: 12),
            Expanded(
              child: Text(request.user.displayName,
                  style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
            ),
            IconButton(
              tooltip: 'Accept',
              icon: const Icon(Icons.check_circle, color: AppColors.success),
              onPressed: () async {
                final error = await ref.read(socialActionsProvider).accept(request.id);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error ?? 'Friend added.')));
                }
              },
            ),
            IconButton(
              tooltip: 'Reject',
              icon: const Icon(Icons.cancel, color: AppColors.danger),
              onPressed: () async {
                final error = await ref.read(socialActionsProvider).reject(request.id);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error ?? 'Request rejected.')));
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _OutgoingTile extends ConsumerWidget {
  const _OutgoingTile({required this.request});
  final FriendRequest request;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            SocialAvatar(user: request.user),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(request.user.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                  const Text('Request sent', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                ],
              ),
            ),
            TextButton(
              onPressed: () async {
                final error = await ref.read(socialActionsProvider).cancel(request.id);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error ?? 'Request cancelled.')));
                }
              },
              child: const Text('Cancel', style: TextStyle(color: AppColors.danger)),
            ),
          ],
        ),
      ),
    );
  }
}

class _BlockedTab extends ConsumerWidget {
  const _BlockedTab({required this.overview});
  final FriendsOverview overview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (overview.blocked.isEmpty) {
      return const _EmptyState(
        icon: Icons.block,
        title: 'No blocked users',
        subtitle: 'Blocked players cannot interact with you.',
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: overview.blocked
          .map(
            (u) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: GlassCard(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(
                  children: [
                    SocialAvatar(user: u),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(u.displayName,
                          style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    ),
                    TextButton(
                      onPressed: () async {
                        final error = await ref.read(socialActionsProvider).unblock(u.id);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context)
                              .showSnackBar(SnackBar(content: Text(error ?? 'User unblocked.')));
                        }
                      },
                      child: const Text('Unblock', style: TextStyle(color: AppColors.softCyan)),
                    ),
                  ],
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Text(text,
          style: const TextStyle(
              color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: AppColors.textMuted),
            const SizedBox(height: 16),
            Text(title,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
            const SizedBox(height: 8),
            Text(subtitle,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 52, color: AppColors.danger),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary)),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

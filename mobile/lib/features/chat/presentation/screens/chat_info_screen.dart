import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../domain/entities/chat_entities.dart';
import '../providers/chat_providers.dart';
import '../widgets/chat_theme.dart';

/// Group/room details: member roster, role management, theme picker and
/// moderation actions (mute / kick / ban / report).
class ChatInfoScreen extends ConsumerWidget {
  const ChatInfoScreen({
    super.key,
    required this.chatId,
    required this.title,
    this.themeKey,
  });

  final String chatId;
  final String title;
  final String? themeKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final members = ref.watch(chatMembersProvider(chatId));
    final currentUserId = ref.watch(authNotifierProvider.select((s) => s.user.id));
    final theme = ChatThemeData.forKey(themeKey);

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: members.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Text('Could not load members.\n$error',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textSecondary)),
          ),
          data: (list) {
            ChatMember? me;
            for (final m in list) {
              if (m.userId == currentUserId) {
                me = m;
                break;
              }
            }
            final canModerate = me?.role.canModerate ?? false;
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                GlassCard(
                  child: Row(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          gradient: AppColors.brandGradient,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Icon(Icons.groups_rounded, color: Colors.white, size: 30),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title,
                                style: const TextStyle(
                                    fontSize: 18, fontWeight: FontWeight.w800)),
                            Text('${list.length} members',
                                style: const TextStyle(color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                _SectionHeader('Chat theme'),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final t in ChatThemeData.all)
                      GestureDetector(
                        onTap: () => _applyTheme(context, ref, t),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(colors: [t.selfBubble, t.accent]),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: t.key == (themeKey ?? 'neon')
                                  ? Colors.white
                                  : Colors.transparent,
                              width: 2,
                            ),
                          ),
                          child: Text(t.label,
                              style: const TextStyle(
                                  color: Colors.white, fontWeight: FontWeight.w700)),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 24),
                _SectionHeader('Members (${list.length})'),
                const SizedBox(height: 10),
                for (final member in list)
                  _MemberRow(
                    member: member,
                    isMe: member.userId == currentUserId,
                    canModerate: canModerate && member.userId != currentUserId,
                    chatId: chatId,
                    isOwner: member.role == ChatRole.owner,
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _applyTheme(BuildContext context, WidgetRef ref, ChatThemeData t) async {
    final result =
        await ref.read(chatRepositoryProvider).setChatSettings(chatId: chatId, themeKey: t.key);
    if (!context.mounted) return;
    result.fold(
      (failure) => ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(failure.message))),
      (_) {
        ref.invalidate(conversationsProvider);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${t.label} theme applied')));
      },
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(label,
        style: const TextStyle(
            fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.softCyan));
  }
}

class _MemberRow extends ConsumerWidget {
  const _MemberRow({
    required this.member,
    required this.isMe,
    required this.canModerate,
    required this.chatId,
    required this.isOwner,
  });

  final ChatMember member;
  final bool isMe;
  final bool canModerate;
  final String chatId;
  final bool isOwner;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Stack(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: AppColors.electricPurple.withValues(alpha: 0.3),
                  backgroundImage:
                      member.avatarUrl != null ? NetworkImage(member.avatarUrl!) : null,
                  child: member.avatarUrl == null
                      ? Text(
                          member.displayName.isNotEmpty
                              ? member.displayName[0].toUpperCase()
                              : '?',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        )
                      : null,
                ),
                if (member.online)
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 11,
                      height: 11,
                      decoration: BoxDecoration(
                        color: AppColors.success,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.deepNavy, width: 2),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          isMe ? '${member.displayName} (you)' : member.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 6),
                      _RoleBadge(role: member.role),
                    ],
                  ),
                  Text(
                    member.isMuted
                        ? 'muted'
                        : member.online
                            ? 'online'
                            : 'offline',
                    style: TextStyle(
                      fontSize: 12,
                      color: member.isMuted ? AppColors.warning : AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            if (canModerate)
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert_rounded, color: AppColors.textSecondary),
                onSelected: (action) => _handleAction(context, ref, action),
                itemBuilder: (context) => [
                  if (!isOwner)
                    PopupMenuItem(
                      value: member.role == ChatRole.admin ? 'demote' : 'promote',
                      child: Text(member.role == ChatRole.admin ? 'Remove admin' : 'Make admin'),
                    ),
                  PopupMenuItem(
                    value: member.isMuted ? 'unmute' : 'mute',
                    child: Text(member.isMuted ? 'Unmute' : 'Mute'),
                  ),
                  const PopupMenuItem(value: 'report', child: Text('Report')),
                  if (!isOwner) const PopupMenuItem(value: 'kick', child: Text('Kick')),
                  if (!isOwner)
                    const PopupMenuItem(value: 'ban', child: Text('Ban from chat')),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleAction(BuildContext context, WidgetRef ref, String action) async {
    final repo = ref.read(chatRepositoryProvider);

    switch (action) {
      case 'promote':
        await repo.setMemberRole(chatId: chatId, userId: member.userId, role: 'admin');
      case 'demote':
        await repo.setMemberRole(chatId: chatId, userId: member.userId, role: 'member');
      case 'mute':
        await repo.muteMember(chatId: chatId, userId: member.userId);
      case 'unmute':
        await repo.unmuteMember(chatId: chatId, userId: member.userId);
      case 'kick':
        await repo.kickUser(chatId: chatId, userId: member.userId);
      case 'ban':
        final confirmed = await _confirm(context, 'Ban ${member.displayName}?',
            'They will be blocked from this chat.');
        if (confirmed) await repo.banUser(chatId: chatId, userId: member.userId);
      case 'report':
        await repo.reportUser(userId: member.userId, reason: 'abuse');
    }
    ref.invalidate(chatMembersProvider(chatId));
  }

  Future<bool> _confirm(BuildContext context, String title, String message) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Confirm', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    return result ?? false;
  }
}

class _RoleBadge extends StatelessWidget {
  const _RoleBadge({required this.role});
  final ChatRole role;

  @override
  Widget build(BuildContext context) {
    if (role == ChatRole.member) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: (role == ChatRole.owner ? AppColors.warning : AppColors.softCyan)
            .withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        role.name,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: role == ChatRole.owner ? AppColors.warning : AppColors.softCyan,
        ),
      ),
    );
  }
}

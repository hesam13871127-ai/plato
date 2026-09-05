import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../domain/entities/chat_entities.dart';
import '../providers/chat_providers.dart';
import '../widgets/chat_theme.dart';
import 'chat_thread_screen.dart';
import 'create_group_sheet.dart';

/// The chat inbox: Lounge entry, public/group/direct conversations with unread
/// counts, presence and last-message previews.
class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Ensure the real-time connection is up while the inbox is visible.
    ref.watch(chatConnectionProvider);
    final conversations = ref.watch(conversationsProvider);
    final lounge = ref.watch(loungeChatProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Messages'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.add_comment_rounded, color: AppColors.softCyan),
            onSelected: (value) {
              if (value == 'group') _showCreateGroup(context, ref);
            },
            itemBuilder: (context) => const [
              PopupMenuItem(value: 'group', child: Text('New group chat')),
            ],
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.navyGradient),
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(conversationsProvider);
            ref.invalidate(loungeChatProvider);
            await ref.read(conversationsProvider.future);
          },
          child: conversations.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => ListView(
              children: [
                const SizedBox(height: 120),
                Center(
                  child: Text('Could not load chats.\n$error',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.textSecondary)),
                ),
              ],
            ),
            data: (items) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Lounge — public global room, always pinned at the top.
                  lounge.when(
                    data: (loungeChat) => _LoungeTile(chat: loungeChat),
                    loading: () => const GlassCard(
                      child: ListTile(
                        leading: Icon(Icons.public_rounded, color: AppColors.softCyan),
                        title: Text('Lounge'),
                        subtitle: Text('Loading…'),
                      ),
                    ),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                  const SizedBox(height: 8),
                  if (items.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 60),
                      child: Center(
                        child: Text(
                          'No conversations yet.\nJoin the Lounge or start a group!',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
                        ),
                      ),
                    ),
                  for (final chat in items.where((c) => c.type != ChatType.lounge))
                    _ConversationTile(chat: chat),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  void _showCreateGroup(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const CreateGroupSheet(),
    );
  }
}

class _LoungeTile extends StatelessWidget {
  const _LoungeTile({required this.chat});
  final ChatConversation chat;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      gradient: const LinearGradient(
        colors: [Color(0x4000E5FF), Color(0x207B5CFF)],
      ),
      onTap: () => _open(context),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              gradient: AppColors.brandGradient,
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.public_rounded, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Lounge',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                Text('The public room — meet everyone',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
        ],
      ),
    );
  }

  void _open(BuildContext context) {
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => ChatThreadScreen(
        chatId: chat.id,
        title: chat.title,
        themeKey: chat.themeKey,
      ),
    ));
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.chat});
  final ChatConversation chat;

  @override
  Widget build(BuildContext context) {
    final theme = ChatThemeData.forKey(chat.themeKey);
    final online = chat.other?.online ?? false;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassCard(
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => ChatThreadScreen(
            chatId: chat.id,
            title: chat.title,
            themeKey: chat.themeKey,
            isDirect: chat.isDirect,
            otherUserId: chat.other?.id,
            otherOnline: chat.other?.online ?? false,
            otherLastSeenAt: chat.other?.lastSeenAt,
          ),
        )),
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Stack(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: theme.accent.withValues(alpha: 0.25),
                  backgroundImage: chat.avatarUrl != null ? NetworkImage(chat.avatarUrl!) : null,
                  child: chat.avatarUrl == null
                      ? Text(
                          chat.title.isNotEmpty ? chat.title[0].toUpperCase() : '?',
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w700),
                        )
                      : null,
                ),
                if (online)
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 13,
                      height: 13,
                      decoration: BoxDecoration(
                        color: AppColors.success,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.deepNavy, width: 2),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          chat.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                      ),
                      if (chat.lastMessageAt != null)
                        Text(
                          _timeAgo(chat.lastMessageAt!),
                          style: TextStyle(
                            fontSize: 11,
                            color: chat.unread > 0 ? AppColors.softCyan : AppColors.textMuted,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _preview(chat),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: AppColors.textSecondary, fontSize: 13),
                        ),
                      ),
                      if (chat.isMuted)
                        const Icon(Icons.volume_off_rounded,
                            size: 14, color: AppColors.textMuted),
                      if (chat.unread > 0) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            gradient: AppColors.brandGradient,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text('${chat.unread}',
                              style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white)),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _preview(ChatConversation chat) {
    if (chat.lastMessageBody == null || chat.lastMessageBody!.isEmpty) {
      switch (chat.type) {
        case ChatType.lounge:
          return 'Welcome to the Lounge';
        case ChatType.group:
          return '${chat.memberCount} members';
        case ChatType.room:
          return 'In-game chat';
        case ChatType.direct:
          return (chat.other?.online ?? false) ? 'Online' : 'Say hi 👋';
      }
    }
    return chat.lastMessageBody!;
  }

  static String _timeAgo(DateTime time) {
    final diff = DateTime.now().difference(time);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }
}

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/entities/chat_entities.dart';
import 'chat_theme.dart';

/// Renders a single chat message: avatar, bubble (themed per chat), reply
/// preview, reaction chips, edited/deleted state and long-press actions.
class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    required this.isMine,
    required this.theme,
    required this.canModerate,
    this.onLongPress,
    this.onReact,
    this.onReply,
  });

  final ChatMessage message;
  final bool isMine;
  final ChatThemeData theme;
  final bool canModerate;
  final String currentUserId;
  final VoidCallback? onLongPress;
  final ValueChanged<String>? onReact;
  final VoidCallback? onReply;

  static const List<String> quickReactions = ['❤️', '😂', '👍', '🔥', '😮', '🎉'];

  @override
  Widget build(BuildContext context) {
    final deleted = message.isDeleted;
    final bubbleColor = deleted
        ? AppColors.surfaceElevated.withValues(alpha: 0.5)
        : (isMine ? theme.selfBubble : theme.otherBubble);
    final textColor = deleted
        ? AppColors.textMuted
        : (isMine ? Colors.white : AppColors.textPrimary);
    final radius = BorderRadius.only(
      topLeft: const Radius.circular(18),
      topRight: const Radius.circular(18),
      bottomLeft: Radius.circular(isMine ? 18 : 4),
      bottomRight: Radius.circular(isMine ? 4 : 18),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        mainAxisAlignment: isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMine) _avatar(),
          if (!isMine) const SizedBox(width: 8),
          Flexible(
            child: GestureDetector(
              onLongPress: deleted ? null : onLongPress,
              onTap: deleted ? null : onReply,
              child: Column(
                crossAxisAlignment:
                    isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                children: [
                  if (!isMine && message.author != null)
                    Padding(
                      padding: const EdgeInsets.only(left: 12, bottom: 2),
                      child: Text(
                        message.author!.displayName,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: theme.accent,
                        ),
                      ),
                    ),
                  Container(
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width * 0.72,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: bubbleColor,
                      borderRadius: radius,
                      border: Border.all(
                        color: message.isPinned
                            ? theme.accent.withValues(alpha: 0.7)
                            : Colors.white.withValues(alpha: 0.06),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.25),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (message.replyPreview != null)
                          _ReplyQuote(preview: message.replyPreview!, isMine: isMine),
                        if (message.isPinned)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.push_pin_rounded,
                                    size: 12, color: isMine ? Colors.white70 : theme.accent),
                                const SizedBox(width: 4),
                                Text('Pinned',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: isMine ? Colors.white70 : theme.accent,
                                    )),
                              ],
                            ),
                          ),
                        Text(
                          deleted ? 'This message was deleted' : message.body,
                          style: TextStyle(
                            color: textColor,
                            fontSize: 15,
                            height: 1.3,
                            fontStyle: deleted ? FontStyle.italic : FontStyle.normal,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (message.isEdited && !deleted)
                              Text('edited',
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: textColor.withValues(alpha: 0.7),
                                    fontStyle: FontStyle.italic,
                                  )),
                            if (message.isEdited && !deleted) const SizedBox(width: 6),
                            Text(
                              _timeLabel(message.createdAt),
                              style: TextStyle(
                                fontSize: 10,
                                color: textColor.withValues(alpha: 0.65),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (message.reactions.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Wrap(
                        spacing: 4,
                        children: [
                          for (final group in message.reactions)
                            _ReactionChip(
                              group: group,
                              accent: theme.accent,
                              reacted: group.reactedBy(currentUserId),
                              onTap: deleted ? null : () => onReact?.call(group.emoji),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (isMine) const SizedBox(width: 8),
          if (isMine) _avatar(),
        ],
      ),
    );
  }

  Widget _avatar() {
    final url = message.author?.avatarUrl;
    return CircleAvatar(
      radius: 14,
      backgroundColor: theme.accent.withValues(alpha: 0.3),
      backgroundImage: url != null ? NetworkImage(url) : null,
      child: url == null
          ? Text(
              (message.author?.displayName.isNotEmpty ?? false)
                  ? message.author!.displayName[0].toUpperCase()
                  : '?',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            )
          : null,
    );
  }

  static String _timeLabel(DateTime time) {
    final local = time.toLocal();
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }
}

class _ReplyQuote extends StatelessWidget {
  const _ReplyQuote({required this.preview, required this.isMine});
  final ReplyPreview preview;
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: isMine ? 0.18 : 0.25),
        borderRadius: BorderRadius.circular(10),
        border: Border(
          left: BorderSide(color: AppColors.softCyan, width: 3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            preview.senderName,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: isMine ? Colors.white : AppColors.softCyan,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            preview.body,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              color: (isMine ? Colors.white : AppColors.textPrimary)
                  .withValues(alpha: 0.85),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReactionChip extends StatelessWidget {
  const _ReactionChip({
    required this.group,
    required this.accent,
    required this.reacted,
    required this.onTap,
  });
  final ReactionGroup group;
  final Color accent;
  final bool reacted;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: reacted ? accent : Colors.white.withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(group.emoji, style: const TextStyle(fontSize: 13)),
            const SizedBox(width: 3),
            Text('${group.count}',
                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
          ],
        ),
      ),
    );
  }
}

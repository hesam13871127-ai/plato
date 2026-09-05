import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../auth/presentation/providers/auth_notifier.dart';
import '../../data/datasources/chat_socket_service.dart';
import '../../domain/entities/chat_entities.dart';
import '../providers/chat_providers.dart';
import '../providers/chat_thread_notifier.dart';
import '../widgets/chat_theme.dart';
import '../widgets/message_bubble.dart';
import '../widgets/message_composer.dart';
import 'chat_info_screen.dart';

/// Open conversation: real-time message list, typing indicator, voice bar,
/// reactions, reply, edit/delete and moderation entry points.
class ChatThreadScreen extends ConsumerStatefulWidget {
  const ChatThreadScreen({
    super.key,
    required this.chatId,
    required this.title,
    this.themeKey,
    this.isDirect = false,
    this.otherUserId,
    this.otherOnline = false,
    this.otherLastSeenAt,
  });

  final String chatId;
  final String title;
  final String? themeKey;
  final bool isDirect;
  final String? otherUserId;
  final bool otherOnline;
  final DateTime? otherLastSeenAt;

  @override
  ConsumerState<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends ConsumerState<ChatThreadScreen> {
  final ScrollController _scrollController = ScrollController();
  ChatMessage? _replyTo;
  late bool _online = widget.otherOnline;
  DateTime? _lastSeen = widget.otherLastSeenAt;
  StreamSubscription<dynamic>? _presenceSub;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    // Jump to the newest message after the first frame renders.
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
    // Track the other user's live presence in 1:1 chats.
    if (widget.isDirect && widget.otherUserId != null) {
      final socket = ref.read(chatSocketServiceProvider);
      _presenceSub = socket.presence.listen((event) {
        if (event.userId != widget.otherUserId) return;
        setState(() {
          _online = event.presence == Presence.online;
          if (!_online) _lastSeen = DateTime.now();
        });
      });
    }
  }

  @override
  void dispose() {
    _presenceSub?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(chatThreadProvider(widget.chatId).notifier).loadMore();
    }
  }

  void _scrollToBottom() {
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
    );
  }

  void _showReactionSheet(ChatMessage message) {
    final notifier = ref.read(chatThreadProvider(widget.chatId).notifier);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => GlassCard(
        margin: const EdgeInsets.all(12),
        borderRadius: 20,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            for (final emoji in MessageBubble.quickReactions)
              GestureDetector(
                onTap: () {
                  notifier.toggleReaction(message, emoji);
                  Navigator.of(context).pop();
                },
                child: Text(emoji, style: const TextStyle(fontSize: 30)),
              ),
          ],
        ),
      ),
    );
  }

  void _showMessageActions(ChatMessage message, bool isMine, bool canModerate) {
    final notifier = ref.read(chatThreadProvider(widget.chatId).notifier);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => GlassCard(
        margin: const EdgeInsets.all(12),
        borderRadius: 20,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.reply_rounded, color: AppColors.softCyan),
              title: const Text('Reply'),
              onTap: () {
                setState(() => _replyTo = message);
                Navigator.of(context).pop();
              },
            ),
            ListTile(
              leading: const Icon(Icons.emoji_emotions_outlined, color: AppColors.softCyan),
              title: const Text('React'),
              onTap: () {
                Navigator.of(context).pop();
                _showReactionSheet(message);
              },
            ),
            if (canModerate)
              ListTile(
                leading: Icon(
                  message.isPinned ? Icons.push_pin_outlined : Icons.push_pin_rounded,
                  color: AppColors.warning,
                ),
                title: Text(message.isPinned ? 'Unpin message' : 'Pin message'),
                onTap: () async {
                  Navigator.of(context).pop();
                  final error = await notifier.setPinned(message, !message.isPinned);
                  if (error != null && mounted) _showSnack(error);
                },
              ),
            if (isMine && !message.isDeleted)
              ListTile(
                leading: const Icon(Icons.edit_rounded, color: AppColors.softCyan),
                title: const Text('Edit'),
                onTap: () {
                  Navigator.of(context).pop();
                  _showEditDialog(message);
                },
              ),
            if ((isMine || canModerate) && !message.isDeleted)
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                title: const Text('Delete'),
                onTap: () async {
                  Navigator.of(context).pop();
                  final error = await notifier.deleteMessage(message);
                  if (error != null && mounted) _showSnack(error);
                },
              ),
            if (!isMine)
              ListTile(
                leading: const Icon(Icons.flag_outlined, color: AppColors.danger),
                title: const Text('Report'),
                onTap: () {
                  Navigator.of(context).pop();
                  _reportMessage(message);
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _reportMessage(ChatMessage message) async {
    final reason = await _showReportDialog();
    if (reason == null) return;
    final result = await ref
        .read(chatRepositoryProvider)
        .reportMessage(messageId: message.id, reason: reason);
    if (!mounted) return;
    result.fold(
      (failure) => _showSnack(failure.message),
      (_) => _showSnack('Report submitted. Thank you.'),
    );
  }

  Future<String?> _showReportDialog() {
    const reasons = ['spam', 'harassment', 'abuse', 'other'];
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => GlassCard(
        margin: const EdgeInsets.all(12),
        borderRadius: 20,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(8),
              child: Text('Report reason',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
            for (final reason in reasons)
              ListTile(
                title: Text(reason[0].toUpperCase() + reason.substring(1)),
                onTap: () => Navigator.of(context).pop(reason),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _showEditDialog(ChatMessage message) async {
    final controller = TextEditingController(text: message.body);
    final newBody = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        title: const Text('Edit message'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: null,
          style: const TextStyle(color: AppColors.textPrimary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Save', style: TextStyle(color: AppColors.softCyan)),
          ),
        ],
      ),
    );
    if (newBody == null || newBody.isEmpty || newBody == message.body) return;
    final error =
        await ref.read(chatThreadProvider(widget.chatId).notifier).editMessage(message, newBody);
    if (error != null && mounted) _showSnack(error);
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = ChatThemeData.forKey(widget.themeKey);
    final currentUserId = ref.watch(authNotifierProvider.select((s) => s.user.id));
    final thread = ref.watch(chatThreadProvider(widget.chatId));
    final notifier = ref.read(chatThreadProvider(widget.chatId).notifier);

    ref.listen(chatThreadProvider(widget.chatId).select((s) => s.messages.length), (_, __) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
    });

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: GestureDetector(
          onTap: widget.isDirect
              ? null
              : () => Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => ChatInfoScreen(
                      chatId: widget.chatId,
                      title: widget.title,
                      themeKey: widget.themeKey,
                    ),
                  )),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: theme.accent.withValues(alpha: 0.3),
                child: Text(
                  widget.title.isNotEmpty ? widget.title[0].toUpperCase() : '?',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(widget.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    Text(
                      _subtitle(thread),
                      maxLines: 1,
                      style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          if (!widget.isDirect)
            IconButton(
              icon: const Icon(Icons.groups_rounded, color: AppColors.softCyan),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => ChatInfoScreen(
                  chatId: widget.chatId,
                  title: widget.title,
                  themeKey: widget.themeKey,
                ),
              )),
            ),
        ],
      ),
      body: Container(
        decoration: BoxDecoration(gradient: chatBackground(widget.themeKey)),
        child: SafeArea(
          child: Column(
            children: [
              if (thread.voiceParticipants.isNotEmpty)
                _VoiceBar(
                  participants: thread.voiceParticipants,
                  currentUserId: currentUserId,
                  onLeave: notifier.leaveVoice,
                ),
              if (thread.error != null)
                Container(
                  width: double.infinity,
                  color: AppColors.danger.withValues(alpha: 0.15),
                  padding: const EdgeInsets.all(8),
                  child: Text(thread.error!,
                      style: const TextStyle(color: AppColors.danger, fontSize: 13)),
                ),
              Expanded(
                child: thread.loading
                    ? const Center(child: CircularProgressIndicator())
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        itemCount: thread.messages.length,
                        itemBuilder: (context, index) {
                          final message = thread.messages[index];
                          final isMine = message.senderId == currentUserId;
                          return MessageBubble(
                            message: message,
                            isMine: isMine,
                            theme: theme,
                            canModerate: true,
                            currentUserId: currentUserId,
                            onReact: (emoji) => notifier.toggleReaction(message, emoji),
                            onReply: () => setState(() => _replyTo = message),
                            onLongPress: () => _showMessageActions(message, isMine, true),
                          );
                        },
                      ),
              ),
              if (thread.typingUserIds.isNotEmpty)
                _TypingIndicator(accent: theme.accent),
              MessageComposer(
                replyTo: _replyTo,
                onCancelReply: () => setState(() => _replyTo = null),
                onTypingChanged: (isTyping) => notifier.setTyping(isTyping: isTyping),
                onSend: (text) {
                  notifier.sendText(text, replyToId: _replyTo?.id);
                  setState(() => _replyTo = null);
                },
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: _VoiceButton(
        chatId: widget.chatId,
        inVoice: thread.voiceParticipants.any((p) => p.userId == currentUserId),
      ),
    );
  }

  String _subtitle(ChatThreadState thread) {
    if (thread.voiceParticipants.isNotEmpty) {
      return '🔊 ${thread.voiceParticipants.length} in voice';
    }
    if (widget.isDirect) {
      if (_online) return 'online';
      if (_lastSeen != null) return 'last seen ${_lastSeenLabel(_lastSeen!)}';
      return thread.joined ? 'offline' : 'connecting…';
    }
    return 'Group chat';
  }

  static String _lastSeenLabel(DateTime time) {
    final local = time.toLocal();
    final diff = DateTime.now().difference(local);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '${local.day}/${local.month} $hour:$minute';
  }
}

class _TypingIndicator extends StatelessWidget {
  const _TypingIndicator({required this.accent});
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('typing',
                style: TextStyle(fontSize: 12, color: accent, fontStyle: FontStyle.italic)),
            const SizedBox(width: 6),
            const _TypingDots(),
          ],
        ),
      ),
    );
  }
}

class _TypingDots extends StatefulWidget {
  const _TypingDots();

  @override
  State<_TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<_TypingDots> with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (i) {
            final t = (_controller.value - i * 0.2).clamp(0.0, 1.0);
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1.5),
              child: Opacity(
                opacity: 0.4 + 0.6 * (1 - (t - 0.5).abs() * 2).clamp(0.0, 1.0),
                child: const CircleAvatar(radius: 3, backgroundColor: AppColors.softCyan),
              ),
            );
          }),
        );
      },
    );
  }
}

class _VoiceBar extends StatelessWidget {
  const _VoiceBar({
    required this.participants,
    required this.currentUserId,
    required this.onLeave,
  });
  final List<VoiceParticipant> participants;
  final String currentUserId;
  final Future<void> Function() onLeave;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0x407B5CFF), Color(0x2000E5FF)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.glassStroke),
      ),
      child: Row(
        children: [
          const Icon(Icons.graphic_eq_rounded, color: AppColors.softCyan, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: participants.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final p = participants[index];
                  final isMe = p.userId == currentUserId;
                  return Center(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircleAvatar(
                          radius: 12,
                          backgroundColor: p.isSpeaking
                              ? AppColors.success
                              : AppColors.electricPurple,
                          child: Text(
                            p.displayName.isNotEmpty ? p.displayName[0].toUpperCase() : '?',
                            style: const TextStyle(fontSize: 10, color: Colors.white),
                          ),
                        ),
                        if (p.isMuted)
                          const Padding(
                            padding: EdgeInsets.only(left: 2),
                            child: Icon(Icons.mic_off_rounded, size: 12, color: AppColors.danger),
                          ),
                        if (isMe)
                          const Padding(
                            padding: EdgeInsets.only(left: 4),
                            child: Text('You',
                                style: TextStyle(fontSize: 11, color: AppColors.softCyan)),
                          ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
          if (participants.any((p) => p.userId == currentUserId))
            IconButton(
              icon: const Icon(Icons.call_end_rounded, color: AppColors.danger),
              onPressed: onLeave,
            ),
        ],
      ),
    );
  }
}

class _VoiceButton extends ConsumerWidget {
  const _VoiceButton({required this.chatId, required this.inVoice});
  final String chatId;
  final bool inVoice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FloatingActionButton.extended(
      heroTag: 'voice-$chatId',
      backgroundColor: inVoice ? AppColors.danger : AppColors.electricPurple,
      onPressed: () async {
        final notifier = ref.read(chatThreadProvider(chatId).notifier);
        if (inVoice) {
          await notifier.leaveVoice();
        } else {
          final error = await notifier.joinVoice();
          if (error != null && context.mounted) {
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(error)));
          }
        }
      },
      icon: Icon(inVoice ? Icons.call_end_rounded : Icons.mic_rounded),
      label: Text(inVoice ? 'Leave' : 'Voice'),
    );
  }
}

import 'package:flutter/material.dart';
import '../../../core/widgets/cached_avatar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../chat/presentation/screens/chat_thread_screen.dart';
import '../../domain/entities/social_entities.dart';
import '../providers/social_providers.dart';
import '../widgets/social_avatar.dart';

/// Full group/club view: member roster with roles, add-friends, promote/demote,
/// remove, leave, disband and open the linked group chat.
class GroupDetailScreen extends ConsumerWidget {
  const GroupDetailScreen({super.key, required this.groupId});

  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groupAsync = ref.watch(groupDetailProvider(groupId));
    final friendsAsync = ref.watch(friendsOverviewProvider);

    return Scaffold(
      backgroundColor: AppColors.deepNavy,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Group'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.textSecondary),
            onPressed: () => ref.invalidate(groupDetailProvider(groupId)),
          ),
        ],
      ),
      body: groupAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(e.toString().replaceFirst('Bad state: ', ''),
                textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary)),
          ),
        ),
        data: (group) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _Header(group: group),
            const SizedBox(height: 16),
            Row(
              children: [
                if (group.chatId != null)
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(backgroundColor: AppColors.electricPurple),
                      icon: const Icon(Icons.chat_bubble_outline, size: 18),
                      label: const Text('Group chat'),
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => ChatThreadScreen(
                            chatId: group.chatId!,
                            title: group.name,
                          ),
                        ),
                      ),
                    ),
                  ),
                if (group.chatId != null && group.isManager) const SizedBox(width: 10),
                if (group.isManager)
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.softCyan,
                        side: const BorderSide(color: AppColors.softCyan),
                      ),
                      icon: const Icon(Icons.person_add_alt_1, size: 18),
                      label: const Text('Add friends'),
                      onPressed: () => _showAddMembers(context, ref, group, friendsAsync),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 20),
            const Text('Members',
                style: TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 10),
            ...group.members.map((m) => _MemberTile(group: group, member: m)),
            const SizedBox(height: 20),
            if (group.isOwner)
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  icon: const Icon(Icons.delete_forever, color: AppColors.danger),
                  label: const Text('Disband group', style: TextStyle(color: AppColors.danger)),
                  onPressed: () => _confirmDisband(context, ref),
                ),
              )
            else
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  icon: const Icon(Icons.logout, color: AppColors.warning),
                  label: Text('Leave group', style: TextStyle(color: AppColors.warning)),
                  onPressed: () => _confirmLeave(context, ref),
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _showAddMembers(
    BuildContext context,
    WidgetRef ref,
    SocialGroup group,
    AsyncValue<FriendsOverview> friendsAsync,
  ) {
    final friends = friendsAsync.valueOrNull?.friends ?? const <SocialUser>[];
    final existing = group.members.map((m) => m.user.id).toSet();
    final candidates = friends.where((f) => !existing.contains(f.id)).toList();
    final selected = <String>{};

    showModalBottomSheet<List<String>>(
      context: context,
      backgroundColor: AppColors.surfaceDark,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setState) {
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
                  const Text('Add friends to group',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                  const SizedBox(height: 12),
                  if (candidates.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Text('All your friends are already in this group.',
                          style: TextStyle(color: AppColors.textSecondary)),
                    )
                  else
                    SizedBox(
                      height: 280,
                      child: ListView(
                        children: candidates.map((f) {
                          final checked = selected.contains(f.id);
                          return CheckboxListTile(
                            value: checked,
                            onChanged: (v) => setState(() {
                              if (v == true) {
                                selected.add(f.id);
                              } else {
                                selected.remove(f.id);
                              }
                            }),
                            activeColor: AppColors.electricPurple,
                            secondary: SocialAvatar(user: f, radius: 18),
                            title: Text(f.displayName,
                                style: const TextStyle(color: AppColors.textPrimary)),
                          );
                        }).toList(),
                      ),
                    ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.electricPurple,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      onPressed: selected.isEmpty ? null : () => Navigator.of(sheetContext).pop(selected.toList()),
                      child: Text('Add ${selected.isEmpty ? '' : '(${selected.length})'}'),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    ).then((picked) async {
      if (picked is! List<String> || picked.isEmpty) return;
      final result = await ref.read(socialRepositoryProvider).addGroupMembers(group.id, picked);
      if (!context.mounted) return;
      result.fold(
        (failure) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failure.message))),
        (_) {
          ref.invalidate(groupDetailProvider(group.id));
          ref.invalidate(groupsListProvider);
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text('Members added.')));
        },
      );
    });
  }

  Future<void> _confirmLeave(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        title: const Text('Leave group?'),
        content: const Text('You will stop receiving group messages.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Leave', style: TextStyle(color: AppColors.warning)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final result = await ref.read(socialRepositoryProvider).leaveGroup(groupId);
    if (!context.mounted) return;
    result.fold(
      (f) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message))),
      (_) {
        ref.invalidate(groupsListProvider);
        Navigator.of(context).pop();
      },
    );
  }

  Future<void> _confirmDisband(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        title: const Text('Disband group?'),
        content: const Text('This permanently deletes the group for everyone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: const Text('Disband', style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final result = await ref.read(socialRepositoryProvider).disbandGroup(groupId);
    if (!context.mounted) return;
    result.fold(
      (f) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message))),
      (_) {
        ref.invalidate(groupsListProvider);
        Navigator.of(context).pop();
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.group});
  final SocialGroup group;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          CachedAvatar(
            name: group.name,
            imageUrl: group.avatarUrl,
            radius: 30,
            fallbackIcon: Icons.groups_2,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(group.name,
                    style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                Text('${group.memberCount} members',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                if (group.description != null && group.description!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(group.description!,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MemberTile extends ConsumerWidget {
  const _MemberTile({required this.group, required this.member});
  final SocialGroup group;
  final GroupMember member;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canManage = group.isManager && member.role != GroupRole.owner;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            SocialAvatar(user: member.user),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(member.user.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                  Text(_roleLabel(member.role),
                      style: TextStyle(
                          fontSize: 12,
                          color: member.role == GroupRole.owner
                              ? AppColors.warning
                              : member.role == GroupRole.admin
                                  ? AppColors.softCyan
                                  : AppColors.textMuted)),
                ],
              ),
            ),
            if (canManage)
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert, color: AppColors.textSecondary),
                color: AppColors.surfaceElevated,
                onSelected: (value) => _action(context, ref, value),
                itemBuilder: (_) => [
                  if (group.isOwner)
                    PopupMenuItem(
                      value: member.role == GroupRole.admin ? 'demote' : 'promote',
                      child: Text(member.role == GroupRole.admin ? 'Remove admin' : 'Make admin'),
                    ),
                  if (group.isOwner)
                    const PopupMenuItem(value: 'transfer', child: Text('Transfer ownership')),
                  const PopupMenuItem(value: 'kick', child: Text('Remove from group')),
                ],
              ),
          ],
        ),
      ),
    );
  }

  String _roleLabel(GroupRole role) {
    switch (role) {
      case GroupRole.owner:
        return 'Owner';
      case GroupRole.admin:
        return 'Admin';
      case GroupRole.member:
        return 'Member';
    }
  }

  Future<void> _action(BuildContext context, WidgetRef ref, String action) async {
    final repo = ref.read(socialRepositoryProvider);
    String? message;
    SocialGroup? refreshed;

    if (action == 'promote') {
      final r = await repo.setGroupRole(group.id, member.user.id, GroupRole.admin);
      r.fold((f) => message = f.message, (g) => refreshed = g);
    } else if (action == 'demote') {
      final r = await repo.setGroupRole(group.id, member.user.id, GroupRole.member);
      r.fold((f) => message = f.message, (g) => refreshed = g);
    } else if (action == 'transfer') {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          backgroundColor: AppColors.surfaceElevated,
          title: const Text('Transfer ownership?'),
          content: Text('${member.user.displayName} will become the owner.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
            TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Transfer')),
          ],
        ),
      );
      if (confirm == true) {
        final r = await repo.transferOwnership(group.id, member.user.id);
        r.fold((f) => message = f.message, (g) => refreshed = g);
      } else {
        return;
      }
    } else if (action == 'kick') {
      final r = await repo.kickGroupMember(group.id, member.user.id);
      r.fold((f) => message = f.message, (_) {});
      if (message == null) refreshed = null;
    }

    if (message != null) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message!)));
      return;
    }
    ref.invalidate(groupDetailProvider(group.id));
    ref.invalidate(groupsListProvider);
  }
}

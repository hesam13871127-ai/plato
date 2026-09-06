import 'package:flutter/material.dart';
import '../../../../core/widgets/cached_avatar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../domain/entities/social_entities.dart';
import '../providers/social_providers.dart';
import 'group_detail_screen.dart';

/// Lists the player's groups/clubs and allows creating a new one.
class GroupsScreen extends ConsumerWidget {
  const GroupsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final groups = ref.watch(groupsListProvider);

    return Scaffold(
      backgroundColor: AppColors.deepNavy,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Groups'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            icon: const Icon(Icons.refresh, color: AppColors.textSecondary),
            onPressed: () => ref.invalidate(groupsListProvider),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.electricPurple,
        onPressed: () => _showCreateGroup(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('New group'),
      ),
      body: groups.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.softCyan)),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(e.toString().replaceFirst('Bad state: ', ''),
                textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary)),
          ),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.groups_2_outlined, size: 56, color: AppColors.textMuted),
                    SizedBox(height: 16),
                    Text('No groups yet',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                    SizedBox(height: 8),
                    Text('Create a group to gather your friends in one club and group chat.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                  ],
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) => _GroupTile(group: list[i]),
          );
        },
      ),
    );
  }

  void _showCreateGroup(BuildContext context, WidgetRef ref) {
    final nameController = TextEditingController();
    final descController = TextEditingController();
    showModalBottomSheet<void>(
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
              const Text('Create a group',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
              const SizedBox(height: 16),
              TextField(
                controller: nameController,
                autofocus: true,
                style: const TextStyle(color: AppColors.textPrimary),
                decoration: _inputDecoration('Group name'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: descController,
                style: const TextStyle(color: AppColors.textPrimary),
                decoration: _inputDecoration('Description (optional)'),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.electricPurple,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: () => Navigator.of(sheetContext).pop(),
                  child: const Text('Create'),
                ),
              ),
            ],
          ),
        );
      },
    ).then((_) async {
      final name = nameController.text.trim();
      if (name.isEmpty) return;
      final result = await ref.read(socialRepositoryProvider).createGroup(
            name: name,
            description: descController.text.trim().isEmpty ? null : descController.text.trim(),
          );
      result.fold(
        (failure) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failure.message)));
          }
        },
        (group) {
          ref.invalidate(groupsListProvider);
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => GroupDetailScreen(groupId: group.id),
            ),
          );
        },
      );
    });
  }

  static InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      filled: true,
      fillColor: AppColors.surfaceElevated,
      hintStyle: const TextStyle(color: AppColors.textMuted),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
    );
  }
}

class _GroupTile extends StatelessWidget {
  const _GroupTile({required this.group});
  final SocialGroup group;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => GroupDetailScreen(groupId: group.id)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      child: Row(
        children: [
          CachedAvatar(
            name: group.name,
            imageUrl: group.avatarUrl,
            radius: 24,
            fallbackIcon: Icons.groups_2,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(group.name,
                    style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textPrimary, fontSize: 16)),
                Text('${group.memberCount} members',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppColors.textMuted),
        ],
      ),
    );
  }
}

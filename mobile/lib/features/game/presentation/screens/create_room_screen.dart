import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/game_logo.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../../../core/widgets/gradient_button.dart';
import '../providers/game_providers.dart';
import '../widgets/tutorial_sheet.dart';

/// Create-a-table sheet/screen: privacy toggle, ranked mode, seat count and
/// auto-fill (invisible bots so the host can start immediately).
class CreateRoomScreen extends ConsumerStatefulWidget {
  const CreateRoomScreen({super.key, required this.gameSlug});

  final String gameSlug;

  @override
  ConsumerState<CreateRoomScreen> createState() => _CreateRoomScreenState();
}

class _CreateRoomScreenState extends ConsumerState<CreateRoomScreen> {
  final _nameController = TextEditingController();
  bool _isPrivate = true;
  bool _isRanked = false;
  bool _fillWithBots = true;
  int _seats = 2;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final repo = ref.read(gameRepositoryProvider);
    final result = await repo.createRoom(
      gameSlug: widget.gameSlug,
      name: _nameController.text.trim().isEmpty ? null : _nameController.text.trim(),
      isPrivate: _isPrivate,
      isRanked: _isRanked,
      maxPlayers: _seats,
      fillWithBots: _fillWithBots,
    );
    if (!mounted) return;
    result.fold(
      (failure) => setState(() {
        _busy = false;
        _error = failure.message;
      }),
      (room) {
        context.pushReplacement('/rooms/${room.id}');
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Create table', style: TextStyle(color: AppColors.textPrimary)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                GameLogo(slug: widget.gameSlug, size: 58, radius: 16),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.gameSlug
                            .replaceAll('_', ' ')
                            .split(' ')
                            .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
                            .join(' '),
                        style: const TextStyle(
                            color: AppColors.textPrimary, fontSize: 20, fontWeight: FontWeight.w800),
                      ),
                      Text(context.l10n.t('create_room'),
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: context.l10n.t('how_to_play'),
                  onPressed: () {
                    final name = widget.gameSlug.replaceAll('_', ' ');
                    TutorialSheet.show(
                      context,
                      slug: widget.gameSlug,
                      name: name[0].toUpperCase() + name.substring(1),
                    );
                  },
                  icon: const Icon(Icons.help_outline_rounded, color: AppColors.softCyan),
                ),
              ],
            ),
            const SizedBox(height: 18),
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Table name',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _nameController,
                    style: const TextStyle(color: AppColors.textPrimary),
                    decoration: InputDecoration(
                      hintText: 'e.g. Friday night dominoes',
                      hintStyle: const TextStyle(color: AppColors.textMuted),
                      filled: true,
                      fillColor: AppColors.glassFill,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  _Toggle(
                    label: 'Private table',
                    subtitle: 'Only people with your invite link can join.',
                    value: _isPrivate,
                    onChanged: (v) => setState(() => _isPrivate = v),
                  ),
                  _Toggle(
                    label: 'Ranked match',
                    subtitle: 'Affects your season rating.',
                    value: _isRanked,
                    onChanged: (v) => setState(() => _isRanked = v),
                  ),
                  _Toggle(
                    label: 'Fill empty seats',
                    subtitle: 'Adds ready opponents so you can start instantly.',
                    value: _fillWithBots,
                    onChanged: (v) => setState(() => _fillWithBots = v),
                  ),
                  const SizedBox(height: 12),
                  const Text('Seats',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      for (final n in const [2, 3, 4])
                        Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: ChoiceChip(
                            label: Text('$n'),
                            selected: _seats == n,
                            onSelected: (_) => setState(() => _seats = n),
                            selectedColor: AppColors.electricPurple,
                            labelStyle: TextStyle(
                              color: _seats == n ? Colors.white : AppColors.textSecondary,
                            ),
                            backgroundColor: AppColors.glassFill,
                            side: const BorderSide(color: AppColors.glassStroke),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
            const SizedBox(height: 24),
            GradientButton(
              label: 'Create table',
              icon: Icons.check_rounded,
              isLoading: _busy,
              onPressed: _busy ? () {} : _create,
            ),
          ],
        ),
      ),
    );
  }
}

class _Toggle extends StatelessWidget {
  const _Toggle({
    required this.label,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        color: AppColors.textPrimary, fontWeight: FontWeight.w600)),
                Text(subtitle,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.softCyan,
            activeTrackColor: AppColors.electricPurple.withOpacity(0.6),
          ),
        ],
      ),
    );
  }
}

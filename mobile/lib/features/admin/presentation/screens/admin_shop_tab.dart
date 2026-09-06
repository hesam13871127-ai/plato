import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/glass_card.dart';
import '../../data/admin_remote_data_source.dart';

/// Shop management: create/edit/delete catalogue items and toggle availability.
class AdminShopTab extends ConsumerStatefulWidget {
  const AdminShopTab({super.key});

  @override
  ConsumerState<AdminShopTab> createState() => _AdminShopTabState();
}

class _AdminShopTabState extends ConsumerState<AdminShopTab> {
  List<AdminShopItem> _items = [];
  bool _loading = true;

  AdminRemoteDataSource get _ds => ref.read(adminRemoteDataSourceProvider);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      _items = await _ds.shopItems();
    } on DioException catch (e) {
      _toast(e, 'Could not load the shop.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(DioException e, String fallback, {Color color = AppColors.danger}) {
    final msg = (e.response?.data is Map && (e.response!.data as Map)['message'] != null)
        ? (e.response!.data as Map)['message'].toString()
        : fallback;
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: color));
    }
  }

  Future<void> _openEditor({AdminShopItem? item}) async {
    final saved = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surfaceDark,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _ItemEditor(item: item),
    );
    if (saved == null) return;
    try {
      await _ds.upsertShopItem(saved);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Item saved.'), backgroundColor: AppColors.success),
        );
      }
      await _load();
    } on DioException catch (e) {
      _toast(e, 'Could not save the item.');
    }
  }

  Future<void> _delete(AdminShopItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surfaceElevated,
        title: const Text('Delete item?'),
        content: Text('"${item.name}" will be permanently removed from the shop.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete', style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _ds.deleteShopItem(item.id);
      await _load();
    } on DioException catch (e) {
      _toast(e, 'Could not delete the item.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.electricPurple,
        icon: const Icon(Icons.add),
        label: const Text('New item'),
        onPressed: () => _openEditor(),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.softCyan))
          : RefreshIndicator(
              onRefresh: _load,
              color: AppColors.softCyan,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
                itemCount: _items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final item = _items[i];
                  return GlassCard(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.name,
                                  style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w800)),
                              const SizedBox(height: 2),
                              Text('${item.type} · ${item.rarity} · ${item.currency == 'coins' ? '🪙' : '💎'} ${item.price}',
                                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: (item.isAvailable ? AppColors.success : AppColors.textMuted).withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(item.isAvailable ? 'live' : 'hidden',
                              style: TextStyle(
                                  color: item.isAvailable ? AppColors.success : AppColors.textMuted,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800)),
                        ),
                        IconButton(
                          icon: const Icon(Icons.edit_rounded, color: AppColors.softCyan),
                          onPressed: () => _openEditor(item: item),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                          onPressed: () => _delete(item),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
    );
  }
}

/// Create/edit form for a shop item.
class _ItemEditor extends StatefulWidget {
  const _ItemEditor({this.item});
  final AdminShopItem? item;

  @override
  State<_ItemEditor> createState() => _ItemEditorState();
}

class _ItemEditorState extends State<_ItemEditor> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: widget.item?.name ?? '');
  late final TextEditingController _price = TextEditingController(text: widget.item?.price.toString() ?? '0');
  String _type = 'avatar_frame';
  String _rarity = 'common';
  String _currency = 'coins';
  bool _available = true;
  bool _unique = true;

  static const _types = [
    'avatar_frame', 'banner', 'chat_bubble', 'theme', 'game_skin',
    'id_color', 'dice_set', 'emote', 'bundle', 'consumable',
  ];
  static const _rarities = ['common', 'rare', 'epic', 'legendary'];

  @override
  void initState() {
    super.initState();
    if (widget.item != null) {
      _type = _types.contains(widget.item!.type) ? widget.item!.type : 'consumable';
      _rarity = widget.item!.rarity;
      _currency = widget.item!.currency;
      _available = widget.item!.isAvailable;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(widget.item == null ? 'New shop item' : 'Edit item',
                  style: const TextStyle(color: AppColors.textPrimary, fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 16),
              _label('Name'),
              TextFormField(
                controller: _name,
                style: const TextStyle(color: AppColors.textPrimary),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Name is required' : null,
                decoration: _dec(),
              ),
              const SizedBox(height: 12),
              _label('Price'),
              TextFormField(
                controller: _price,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                style: const TextStyle(color: AppColors.textPrimary),
                decoration: _dec(),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: _label('Type')),
                  Expanded(child: _label('Rarity')),
                ],
              ),
              Row(
                children: [
                  Expanded(child: _dropdown(_type, _types, (v) => setState(() => _type = v!))),
                  const SizedBox(width: 12),
                  Expanded(child: _dropdown(_rarity, _rarities, (v) => setState(() => _rarity = v!))),
                ],
              ),
              const SizedBox(height: 12),
              _label('Currency'),
              _dropdown(_currency, ['coins', 'pips'], (v) => setState(() => _currency = v!)),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Available in shop', style: TextStyle(color: AppColors.textPrimary)),
                value: _available,
                activeColor: AppColors.softCyan,
                onChanged: (v) => setState(() => _available = v),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Unique (one per account)', style: TextStyle(color: AppColors.textPrimary)),
                value: _unique,
                activeColor: AppColors.softCyan,
                onChanged: (v) => setState(() => _unique = v),
              ),
              const SizedBox(height: 16),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.electricPurple,
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: () {
                  if (!_formKey.currentState!.validate()) return;
                  Navigator.pop(context, {
                    if (widget.item != null) 'id': widget.item!.id,
                    'name': _name.text.trim(),
                    'type': _type,
                    'rarity': _rarity,
                    'currency': _currency,
                    'price': int.tryParse(_price.text.trim()) ?? 0,
                    'isAvailable': _available,
                    'isUniqueOwned': _unique,
                  });
                },
                child: const Text('Save item', style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(t, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w700)),
      );

  InputDecoration _dec() => InputDecoration(
        filled: true,
        fillColor: AppColors.glassFill,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.glassStroke)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.glassStroke)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.softCyan)),
      );

  Widget _dropdown(String value, List<String> options, ValueChanged<String?> onChanged) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(color: AppColors.glassFill, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.glassStroke)),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          isExpanded: true,
          dropdownColor: AppColors.surfaceElevated,
          style: const TextStyle(color: AppColors.textPrimary),
          items: [for (final o in options) DropdownMenuItem(value: o, child: Text(o))],
          onChanged: onChanged,
        ),
      ),
    );
  }
}

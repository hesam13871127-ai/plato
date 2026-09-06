import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_constants.dart';
import '../network/dio_client.dart';
import '../network/api_endpoints.dart';
import '../theme/app_colors.dart';

/// The selectable report reasons — kept in sync with the backend
/// `REPORT_REASONS` enum.
const List<String> kReportReasons = [
  'spam',
  'harassment',
  'hate_speech',
  'sexual_content',
  'underage',
  'cheating',
  'impersonation',
  'other',
];

const Map<String, String> kReportReasonLabels = {
  'spam': 'Spam or scam',
  'harassment': 'Harassment or bullying',
  'hate_speech': 'Hate speech or slurs',
  'sexual_content': 'Sexual content',
  'underage': 'Harm to minors',
  'cheating': 'Cheating / exploit',
  'impersonation': 'Impersonation',
  'other': 'Other',
};

/// Shows a modal bottom sheet to report a user or a message. Returns `true`
/// when the report was successfully filed.
Future<bool?> showReportSheet(
  BuildContext context, {
  required String targetType, // 'user' | 'message' | 'room' | 'group'
  required String targetId,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: AppColors.surfaceDark,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _ReportSheet(targetType: targetType, targetId: targetId),
  );
}

class _ReportSheet extends ConsumerStatefulWidget {
  const _ReportSheet({required this.targetType, required this.targetId});

  final String targetType;
  final String targetId;

  @override
  ConsumerState<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<_ReportSheet> {
  String _reason = 'spam';
  final TextEditingController _details = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final dio = ref.read(dioClientProvider).dio;
      final body = <String, dynamic>{
        'targetType': widget.targetType,
        'targetId': widget.targetId,
        'reason': _reason,
      };
      final details = _details.text.trim();
      if (details.isNotEmpty) body['details'] = details;
      await dio.post<dynamic>(ApiEndpoints.moderationReport, data: body);
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Report submitted. Our moderation team will review it.'),
          backgroundColor: AppColors.success,
        ),
      );
    } on DioException catch (e) {
      final msg = (e.response?.data is Map && (e.response!.data as Map)['message'] != null)
          ? ((e.response!.data as Map)['message']).toString()
          : 'Could not submit the report. Please try again.';
      setState(() {
        _submitting = false;
        _error = msg;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.glassStroke,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Report content',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Tell us what is wrong. Our moderators review every report and '
              'take action against abusive accounts.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final reason in kReportReasons)
                  ChoiceChip(
                    label: Text(kReportReasonLabels[reason] ?? reason),
                    selected: _reason === reason,
                    onSelected: (_) => setState(() => _reason = reason),
                    selectedColor: AppColors.electricPurple.withValues(alpha: 0.4),
                    backgroundColor: AppColors.glassFill,
                    labelStyle: TextStyle(
                      color: _reason === reason ? AppColors.textPrimary : AppColors.textSecondary,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                      side: const BorderSide(color: AppColors.glassStroke),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _details,
              maxLength: 1000,
              maxLines: 3,
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Additional details (optional)',
                hintStyle: const TextStyle(color: AppColors.textMuted),
                filled: true,
                fillColor: AppColors.glassFill,
                counterStyle: const TextStyle(color: AppColors.textMuted),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.glassStroke),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.glassStroke),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.softCyan),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: _submitting ? null : () => Navigator.of(context).pop(false),
                    child: const Text('Cancel', style: TextStyle(color: AppColors.textSecondary)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.electricPurple,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Submit report', style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Center(
              child: Text(
                AppConstants.appName,
                style: TextStyle(color: AppColors.textMuted, fontSize: 11),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

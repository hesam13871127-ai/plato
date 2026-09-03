import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:vibetable/core/theme/app_colors.dart';
import 'package:vibetable/core/widgets/gradient_button.dart';

void main() {
  group('AppColors', () {
    test('uses the brand palette', () {
      expect(AppColors.deepNavy, const Color(0xFF0B1426));
      expect(AppColors.electricPurple, const Color(0xFF7B5CFF));
      expect(AppColors.softCyan, const Color(0xFF00E5FF));
    });
  });

  group('GradientButton', () {
    testWidgets('shows the label and a loading spinner', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GradientButton(
              label: 'Continue',
              isLoading: false,
              onPressed: () {},
            ),
          ),
        ),
      );
      expect(find.text('Continue'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GradientButton(
              label: 'Continue',
              isLoading: true,
              onPressed: () {},
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('invokes onPressed when tapped', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: GradientButton(label: 'Tap', onPressed: () => taps++),
          ),
        ),
      );
      await tester.tap(find.text('Tap'));
      expect(taps, 1);
    });
  });
}

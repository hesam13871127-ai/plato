import 'dart:async';

import 'package:flutter/material.dart';

/// Live day/hour/minute countdown to season end, ticking once a second.
class SeasonCountdown extends StatefulWidget {
  const SeasonCountdown({super.key, required this.timeRemainingMs});

  final int timeRemainingMs;

  @override
  State<SeasonCountdown> createState() => _SeasonCountdownState();
}

class _SeasonCountdownState extends State<SeasonCountdown> {
  late Timer _timer;
  late int _remaining;

  @override
  void initState() {
    super.initState();
    _remaining = widget.timeRemainingMs;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _remaining = (_remaining - 1000).clamp(0, 1 << 31));
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final totalSeconds = (_remaining / 1000).floor();
    final days = totalSeconds ~/ 86400;
    final hours = (totalSeconds % 86400) ~/ 3600;
    final minutes = (totalSeconds % 3600) ~/ 60;
    final seconds = totalSeconds % 60;

    return Row(
      children: [
        _Unit(value: days, label: 'days'),
        _sep(),
        _Unit(value: hours, label: 'hrs'),
        _sep(),
        _Unit(value: minutes, label: 'min'),
        _sep(),
        _Unit(value: seconds, label: 'sec'),
      ],
    );
  }

  Widget _sep() => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Text(':', style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 20, fontWeight: FontWeight.w700)),
      );
}

class _Unit extends StatelessWidget {
  const _Unit({required this.value, required this.label});
  final int value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value.toString().padLeft(2, '0'),
          style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800),
        ),
        Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 10)),
      ],
    );
  }
}
